import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileHostPattern, hostPatternToUrlRegex, PatternError } from '../extension/lib/pattern.js';

const matches = (pattern, url) => compileHostPattern(pattern)(url);

test('anchored pattern matches the exact host only', () => {
  const p = '^api\\.example\\.com$';
  assert.ok(matches(p, 'https://api.example.com/v1'));
  assert.ok(matches(p, 'https://api.example.com'));
  assert.ok(matches(p, 'http://api.example.com:8080/x?y#z'));
  assert.ok(matches(p, 'wss://api.example.com/socket'));
  assert.ok(matches(p, 'https://API.Example.com/'));
  assert.ok(!matches(p, 'https://foo.api.example.com/'));
  assert.ok(!matches(p, 'https://api.example.com.evil.net/'));
  assert.ok(!matches(p, 'https://example.com/?h=api.example.com'));
});

test('unanchored pattern matches anywhere inside the hostname', () => {
  assert.ok(matches('example', 'https://www.example.org/'));
  assert.ok(!matches('example', 'https://other.org/example'));
});

test('subdomain wildcard', () => {
  const p = '(^|\\.)example\\.com$';
  assert.ok(matches(p, 'https://example.com/'));
  assert.ok(matches(p, 'https://a.b.example.com/'));
  assert.ok(!matches(p, 'https://notexample.com/'));
});

test('top-level alternatives keep their own anchors', () => {
  const p = '^localhost$|^127\\.0\\.0\\.1$';
  assert.ok(matches(p, 'http://localhost:3000/'));
  assert.ok(matches(p, 'http://127.0.0.1/'));
  assert.ok(!matches(p, 'http://localhost.evil.com/'));
  assert.ok(!matches(p, 'http://x127.0.0.1/'));
});

test('wildcards cannot escape the hostname (no header leak)', () => {
  assert.ok(!matches('.*\\.example\\.com$', 'https://evil.com/a.example.com'));
  assert.ok(!matches('^.*\\.example\\.com$', 'https://evil.com/x.example.com'));
  assert.ok(!matches('[^.]+\\.example\\.com$', 'https://evil.com/a.example.com'));
  assert.ok(!matches('^\\S+\\.example\\.com$', 'https://evil.com/a.example.com'));
  assert.ok(!matches('^\\W*example\\.com$', 'https://evil.com/example.com'));
  assert.ok(!matches('^trusted\\.com$', 'https://trusted.com@evil.com/'));
  assert.ok(!matches('trusted\\.com', 'https://evil.com/?q=trusted.com'));
  assert.ok(matches('.*\\.example\\.com$', 'https://a.example.com/'));
});

test('anchors nested in groups', () => {
  const p = '^(dev|staging)\\.example\\.(com$|org)';
  assert.ok(matches(p, 'https://dev.example.com/'));
  assert.ok(!matches(p, 'https://dev.example.com.evil.net/'));
  assert.ok(matches(p, 'https://staging.example.org.eu/'));
  assert.ok(matches('(^|-)api(\\.|$)', 'https://my-api.test/'));
  assert.ok(matches('(^|-)api(\\.|$)', 'https://api/'));
  assert.ok(!matches('(^|-)api(\\.|$)', 'https://myapi.test/'));
});

test('escaped dollar is a literal, not an anchor', () => {
  assert.equal(hostPatternToUrlRegex('a\\$').includes('a\\$'), true);
});

test('invalid patterns throw PatternError', () => {
  for (const p of ['', '   ', '(abc', '[abc', 'a\\', '^|b', '[\\S]', '\\P{L}', 'a{2,1}']) {
    assert.throws(() => hostPatternToUrlRegex(p), PatternError, `expected ${JSON.stringify(p)} to throw`);
  }
});

test('character classes with a literal ] or POSIX class', () => {
  assert.ok(matches('^[]a]+\\.com$', 'https://aa.com/'));
  assert.ok(matches('^[[:alpha:]]+\\.com$', 'https://abc.com/'));
});
