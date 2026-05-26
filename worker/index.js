import { handleProxyRequest } from './proxy.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' https: data:",
    "connect-src 'self' https:",
    "font-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const NO_CACHE_PATHS = new Set(['/sw.js', '/index.html', '/app.css', '/app.js', '/config.js', '/sanitize.js']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/rss-proxy') {
      return handleProxyRequest(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    return withStaticHeaders(url, response);
  },
};

function withStaticHeaders(url, response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (NO_CACHE_PATHS.has(url.pathname) || url.pathname === '/') {
    headers.set('Cache-Control', 'no-cache');
  } else if (url.pathname === '/manifest.json') {
    headers.set('Cache-Control', 'public, max-age=3600');
  } else if (/^\/icon-\d+\.png$/.test(url.pathname)) {
    headers.set('Cache-Control', 'public, max-age=604800');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
