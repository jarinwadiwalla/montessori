// Password sign-in must not allow unlimited guessing.

import test from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as login } from '../functions/api/community/auth-password.js';
import { hashPassword } from '../functions/lib/community-auth.js';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE community_members (
    id TEXT PRIMARY KEY, email TEXT, name TEXT DEFAULT '', status TEXT DEFAULT 'active',
    password_hash TEXT DEFAULT '', last_seen_at TEXT DEFAULT '', role TEXT DEFAULT 'member',
    subscription_id TEXT DEFAULT '', avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '',
    location TEXT DEFAULT '', open_to_exchange INTEGER DEFAULT 0, joined_at TEXT DEFAULT '',
    handle TEXT DEFAULT '', accepted_guidelines_at TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE community_sessions (
    token_hash TEXT PRIMARY KEY, member_id TEXT, created_at TEXT, expires_at TEXT, user_agent TEXT)`);
  const api = {
    raw: db,
    prepare(sql) {
      const binds = [];
      return {
        bind(...a) { binds.push(...a); return this; },
        async run() { db.prepare(sql).run(...binds); return { meta: { changes: 1 } }; },
        async first() { return db.prepare(sql).get(...binds) ?? null; },
        async all() { return { results: db.prepare(sql).all(...binds) }; },
      };
    },
  };
  return api;
}

const req = (email, password, ip = '1.2.3.4') => new Request('https://x/api/community/auth-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
  body: JSON.stringify({ email, password }),
});

test('a wrong password is refused, and repeated guessing is throttled', async () => {
  const SITE_DB = makeDb();
  const hash = await hashPassword('the-real-password');
  SITE_DB.raw.prepare("INSERT INTO community_members (id,email,status,password_hash) VALUES ('m1','a@example.com','active',?)").run(hash);
  const env = { SITE_DB };

  // The correct password works.
  assert.equal((await login({ env, request: req('a@example.com', 'the-real-password') })).status, 200);

  // Ten wrong guesses are each refused with 401...
  for (let i = 0; i < 10; i++) {
    assert.equal((await login({ env, request: req('a@example.com', `guess-${i}`) })).status, 401, `guess ${i}`);
  }
  // ...and the eleventh is throttled rather than checked.
  const blocked = await login({ env, request: req('a@example.com', 'guess-11') });
  assert.equal(blocked.status, 429);

  // Even the correct password is held off while the window is hot.
  assert.equal((await login({ env, request: req('a@example.com', 'the-real-password') })).status, 429);
});

test('an unknown address is throttled the same way, revealing nothing', async () => {
  const SITE_DB = makeDb();
  const env = { SITE_DB };
  for (let i = 0; i < 10; i++) {
    assert.equal((await login({ env, request: req('nobody@example.com', `g${i}`) })).status, 401);
  }
  assert.equal((await login({ env, request: req('nobody@example.com', 'g11') })).status, 429);
});

test('throttling counts the address too, not just one IP', async () => {
  const SITE_DB = makeDb();
  const env = { SITE_DB };
  // Ten different IPs attacking one address.
  for (let i = 0; i < 10; i++) {
    assert.equal((await login({ env, request: req('target@example.com', 'x', `10.0.0.${i}`) })).status, 401);
  }
  const fresh = await login({ env, request: req('target@example.com', 'x', '10.0.0.99') });
  assert.equal(fresh.status, 429, 'a brand-new IP is still stopped');
});
