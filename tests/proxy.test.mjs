import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProxyRequest } from '../worker/proxy.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(target) {
  return new Request(`https://podcast-shownotes.example/rss-proxy?url=${encodeURIComponent(target)}`, {
    headers: { 'CF-Connecting-IP': '203.0.113.8' },
  });
}

test('proxy rejects non-HTTPS targets before fetching upstream', async () => {
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return new Response('should not fetch');
  };

  const response = await handleProxyRequest(request('http://example.com/feed.xml'));

  assert.equal(response.status, 400);
  assert.equal(fetched, false);
});

test('proxy rejects private redirect targets', async () => {
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { Location: 'https://127.0.0.1/feed.xml' },
  });

  const response = await handleProxyRequest(request('https://example.com/feed.xml'));

  assert.equal(response.status, 403);
});

test('proxy rejects unsupported upstream content types', async () => {
  globalThis.fetch = async () => new Response('<html></html>', {
    headers: { 'Content-Type': 'text/html' },
  });

  const response = await handleProxyRequest(request('https://example.com/feed.xml'));

  assert.equal(response.status, 415);
});

test('proxy rejects responses larger than the configured limit', async () => {
  globalThis.fetch = async () => new Response('', {
    headers: {
      'Content-Type': 'application/rss+xml',
      'Content-Length': String(11 * 1024 * 1024),
    },
  });

  const response = await handleProxyRequest(request('https://example.com/feed.xml'));

  assert.equal(response.status, 413);
});

test('proxy uses the Cloudflare rate limit binding when available', async () => {
  globalThis.fetch = async () => new Response('<rss></rss>', {
    headers: { 'Content-Type': 'application/rss+xml' },
  });

  const response = await handleProxyRequest(request('https://example.com/feed.xml'), {
    RSS_PROXY_RATE_LIMIT: {
      limit: async ({ key }) => {
        assert.equal(key, '203.0.113.8:example.com');
        return { success: false };
      },
    },
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
});
