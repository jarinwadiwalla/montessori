// A stand-in for Cloudflare D1, backed by SQLite in memory and built from
// the repo's own schema files. The handlers run against real SQL, so a test
// that passes here is exercising the same statements production runs.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_FILES = [
  "init.sql",
  "migrate-newsletter.sql",
  "community.sql",
  "email-templates.sql",
  "payments.sql",
  "webinar-recordings.sql",
];

function statements(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Run one schema file against the raw database, as `wrangler d1 execute
// --file` would. Exported so a test can re-run a migration over data.
export function applySchema(db, file) {
  const sql = readFileSync(path.join(ROOT, "schema", file), "utf8");
  for (const stmt of statements(sql)) {
    try {
      db.exec(stmt);
    } catch (err) {
      // The migration file re-adds columns init.sql already declares.
      if (!/duplicate column name|already exists/i.test(String(err.message))) throw err;
    }
  }
}

export function createDb() {
  const db = new DatabaseSync(":memory:");
  for (const file of SCHEMA_FILES) applySchema(db, file);

  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const api = {
        bind(...values) {
          args = values;
          return api;
        },
        async first() {
          return db.prepare(sql).get(...args) ?? null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
        async run() {
          const r = db.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return api;
    },
  };
}

// Replace global fetch for the length of one test. `handler(url, init)`
// returns { status, json }, or undefined to fail the test loudly.
export function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async function (input, init = {}) {
    // Cloudflare Workers throws "Illegal invocation" when fetch is called
    // as a method of another object (ctx.fetch(...)). Node does not, so a
    // test would pass and production would break. Hold the tests to the
    // stricter rule.
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation: fetch called with an incorrect `this`");
    }
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    const reply = await handler(url, init);
    if (!reply) throw new Error(`Unexpected fetch in test: ${init.method || "GET"} ${url}`);
    return new Response(JSON.stringify(reply.json ?? {}), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}
