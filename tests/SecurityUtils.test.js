/**
 * @jest-environment jsdom
 * @fileoverview Tests for security utility functions.
 */

import {jest} from '@jest/globals';
import {escapeHtml, fetchWikipedia} from '../modules/core/SecurityUtils.js';

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  test('escapes less than', () => {
    expect(escapeHtml('foo < bar')).toBe('foo &lt; bar');
  });

  test('escapes greater than', () => {
    expect(escapeHtml('foo > bar')).toBe('foo &gt; bar');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('foo "bar"')).toBe('foo &quot;bar&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("foo 'bar'")).toBe('foo &#039;bar&#039;');
  });

  test('escapes all special characters together', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('handles non-string input by converting to string', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
  });

  test('handles object toString', () => {
    expect(escapeHtml({})).toBe('[object Object]');
  });

  test('preserves safe characters', () => {
    const safe = 'Hello World! 123 abc ABC';
    expect(escapeHtml(safe)).toBe(safe);
  });

  test('handles unicode characters', () => {
    expect(escapeHtml('☆ Star ★')).toBe('☆ Star ★');
    expect(escapeHtml('日本語')).toBe('日本語');
  });

  test('prevents XSS via event handlers', () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  test('prevents XSS via javascript: URLs', () => {
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<');
    expect(escaped).toBe(
      '&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;/a&gt;'
    );
  });
});

describe('fetchWikipedia', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('adds Api-User-Agent header to requests', async () => {
    await fetchWikipedia(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Test'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Api-User-Agent': expect.stringContaining('SkyMap/1.0'),
        }),
      })
    );
  });

  test('Api-User-Agent contains required Wikipedia API format', async () => {
    await fetchWikipedia('https://en.wikipedia.org/api/rest_v1/page/summary/X');

    const callArgs = global.fetch.mock.calls[0];
    const headers = callArgs[1].headers;
    const userAgent = headers['Api-User-Agent'];

    // Wikipedia requires: AppName/Version (URL; contact) library/version
    expect(userAgent).toMatch(/^\w+\/[\d.]+\s+\(/);
    expect(userAgent).toContain('https://');
    expect(userAgent).toContain('@');
  });
});
