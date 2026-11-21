// Cloudflare Access JWT verification.
//
// Regression guard for a live hole: /api/admin-session used to accept the
// mere presence of a CF_Authorization cookie, which the client sets, so
// `Cookie: CF_Authorization=anything` returned the admin token.

import test from 'node:test';
import assert from 'node:assert';
import { verifyAccessJwt } from '../functions/lib/cf-access.js';

const TEAM = 'wadiwalla.cloudflareaccess.com';
const AUD = '2ded9a019c54b290d43b3b3d9c7ac20dfc79c0d38b03a879f4d4859b6166c293';
const b64u = (b) => Buffer.from(b).toString('base64url');

const kp = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
jwk.kid = 'test-kid';

async function makeJwt(payload, { kid = 'test-kid', alg = 'RS256', key = kp.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}

const req = (token, viaHeader = false) => new Request('https://x/api/admin-session', {
  headers: token ? (viaHeader ? { 'Cf-Access-Jwt-Assertion': token } : { Cookie: `CF_Authorization=${token}` }) : {},
});

const now = () => Math.floor(Date.now() / 1000);
const good = () => ({ aud: [AUD], iss: `https://${TEAM}`, exp: now() + 3600, iat: now(), email: 'someone@example.com' });

globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });

test('accepts a valid token, by cookie and by header', async () => {
  assert.ok(await verifyAccessJwt(req(await makeJwt(good()))));
  assert.ok(await verifyAccessJwt(req(await makeJwt(good()), true)));
});

test('refuses a cookie that is not a signed token', async () => {
  assert.equal(await verifyAccessJwt(req('anything-at-all')), null);
  assert.equal(await verifyAccessJwt(req(null)), null);
  assert.equal(await verifyAccessJwt(req('a.b')), null);
});

test('refuses expired, wrong audience, wrong issuer', async () => {
  assert.equal(await verifyAccessJwt(req(await makeJwt({ ...good(), exp: now() - 10 }))), null);
  assert.equal(await verifyAccessJwt(req(await makeJwt({ ...good(), aud: ['another-app'] }))), null);
  assert.equal(await verifyAccessJwt(req(await makeJwt({ ...good(), iss: 'https://evil.example' }))), null);
});

test('refuses alg=none, an unknown key id, and a forged signature', async () => {
  const unsigned = `${b64u(JSON.stringify({ alg: 'none', kid: 'test-kid' }))}.${b64u(JSON.stringify(good()))}.`;
  assert.equal(await verifyAccessJwt(req(unsigned)), null);
  assert.equal(await verifyAccessJwt(req(await makeJwt(good(), { kid: 'unknown' }))), null);
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  assert.equal(await verifyAccessJwt(req(await makeJwt(good(), { key: other.privateKey }))), null);
});

test('fails closed when the key set cannot be fetched', async () => {
  const fresh = await import('../functions/lib/cf-access.js?cold=1');
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal(await fresh.verifyAccessJwt(req(await makeJwt(good()))), null);
});
