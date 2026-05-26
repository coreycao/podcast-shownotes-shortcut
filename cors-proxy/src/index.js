const ALLOWED_PREFIXES = ['https://'];
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const ALLOWED_PORTS = new Set(['', '443']);
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const RSS_CONTENT_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
  'text/plain',
];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return json({ error: 'Missing ?url= parameter' }, 400);
    }
    if (!ALLOWED_PREFIXES.some((p) => target.startsWith(p))) {
      return json({ error: 'Only HTTPS URLs are allowed' }, 400);
    }
    let targetUrl;
    try {
      targetUrl = new URL(target);
      if (!isAllowedTarget(targetUrl)) {
        return json({ error: 'Blocked host' }, 403);
      }
    } catch {
      return json({ error: 'Invalid URL' }, 400);
    }

    try {
      const res = await fetchWithSafeRedirects(targetUrl);
      const contentType = res.headers.get('Content-Type') || 'text/plain';
      if (!isRssContentType(contentType)) {
        return json({ error: 'Unsupported upstream content type' }, 415);
      }
      const contentLength = Number(res.headers.get('Content-Length') || 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        return json({ error: 'Upstream response too large' }, 413);
      }
      const body = await readTextWithLimit(res, MAX_RESPONSE_BYTES);
      return new Response(body, {
        status: res.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (e) {
      if (e instanceof Response) return e;
      return json({ error: 'Upstream fetch failed' }, 502);
    }
  },
};

async function fetchWithSafeRedirects(url) {
  let nextUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const res = await fetch(nextUrl.toString(), {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/plain;q=0.5',
        'User-Agent': 'Mozilla/5.0 (compatible; PodcastShownotes/1.0)',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
      redirect: 'manual',
    });

    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get('Location');
    if (!location) throw json({ error: 'Upstream redirect missing location' }, 502);

    nextUrl = new URL(location, nextUrl);
    if (!isAllowedTarget(nextUrl)) {
      throw json({ error: 'Blocked redirect target' }, 403);
    }
  }

  throw json({ error: 'Too many upstream redirects' }, 508);
}

function isAllowedTarget(url) {
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (!ALLOWED_PORTS.has(url.port)) return false;

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return false;
  }
  return !isPrivateIp(host);
}

function isPrivateIp(host) {
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }

  const ipv6 = host.replace(/^\[|\]$/g, '');
  return ipv6 === '::1' || ipv6.startsWith('fc') || ipv6.startsWith('fd') || ipv6.startsWith('fe80:');
}

function isRssContentType(contentType) {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return RSS_CONTENT_TYPES.includes(normalized);
}

async function readTextWithLimit(response, limit) {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      reader.cancel();
      throw json({ error: 'Upstream response too large' }, 413);
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
