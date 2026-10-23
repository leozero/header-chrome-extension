import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBasicAuth, encodeBasicAuth } from '../extension/lib/basic-auth.js';

test('encodes like RFC 7617', () => {
  // Example from RFC 7617 section 2.
  assert.equal(encodeBasicAuth('Aladdin', 'open sesame'), 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  assert.equal(encodeBasicAuth('user', ''), 'Basic dXNlcjo=');
});

test('round-trips UTF-8 and colons in the password', () => {
  const value = encodeBasicAuth('élodie', 'pa:ss wörd 🔑');
  assert.deepEqual(decodeBasicAuth(value), { username: 'élodie', password: 'pa:ss wörd 🔑' });
});

test('rejects a colon in the username', () => {
  assert.throws(() => encodeBasicAuth('a:b', 'x'), /cannot contain/);
});

test('decode returns null for non-Basic values', () => {
  for (const v of ['', 'Bearer abc', 'Basic', 'Basic !!!', 'Basic dXNlcg==' /* no colon */, 'Basic //79']) {
    assert.equal(decodeBasicAuth(v), null, v);
  }
  assert.deepEqual(decodeBasicAuth('  basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==  '), { username: 'Aladdin', password: 'open sesame' });
});
