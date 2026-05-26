import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sanitizeShownotes } from '../sanitize.js';

function sanitize(html) {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  return sanitizeShownotes(html, {
    document,
    baseUrl: 'https://podcast-shownotes.example/episode',
  });
}

test('sanitizeShownotes strips executable markup and event handlers', () => {
  const output = sanitize(`
    <p onclick="alert(1)">hello</p>
    <script>alert(1)</script>
    <iframe src="https://evil.example"></iframe>
    <svg><g onload="alert(1)"></g></svg>
  `);

  assert.match(output, /hello/);
  assert.doesNotMatch(output, /onclick|script|iframe|svg|onload|alert/i);
});

test('sanitizeShownotes removes dangerous URLs and hardens links', () => {
  const output = sanitize(`
    <a href="javascript:alert(1)" title="bad">bad</a>
    <a href="https://example.com/show">good</a>
    <img src="data:text/html,<script>alert(1)</script>" alt="bad">
    <img src="https://example.com/art.png" onerror="alert(1)" alt="good">
  `);

  assert.match(output, /<a title="bad">bad<\/a>/);
  assert.match(output, /href="https:\/\/example.com\/show"/);
  assert.match(output, /target="_blank"/);
  assert.match(output, /rel="noopener noreferrer"/);
  assert.match(output, /src="https:\/\/example.com\/art.png"/);
  assert.doesNotMatch(output, /javascript:|data:text\/html|onerror/i);
});

test('sanitizeShownotes preserves expected formatting tags', () => {
  const output = sanitize('<blockquote><strong>note</strong><ul><li><em>item</em></li></ul></blockquote>');

  assert.match(output, /<blockquote>/);
  assert.match(output, /<strong>note<\/strong>/);
  assert.match(output, /<ul><li><em>item<\/em><\/li><\/ul>/);
});
