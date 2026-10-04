import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRefresh, strongerEvent, tally, isSnapshot } from "../functions/lib/delivery-stats.js";

const now = Date.parse("2026-10-04T08:00:00Z");
const sentRecently = "2026-10-01T06:34:46Z";
const minutesAgo = (m) => new Date(now - m * 60 * 1000).toISOString();

test("a row filled by the webhook is never re-asked", () => {
  const row = { last_event: "delivered", events: '[{"type":"delivered"}]', updated_at: minutesAgo(600) };
  assert.equal(isSnapshot(row), false);
  assert.equal(shouldRefresh(row, sentRecently, now), false);
});

test("a fresh snapshot is trusted, a stale one is asked for again", () => {
  assert.equal(shouldRefresh({ last_event: "delivered", events: "[]", updated_at: minutesAgo(3) }, sentRecently, now), false);
  assert.equal(shouldRefresh({ last_event: "delivered", events: "[]", updated_at: minutesAgo(11) }, sentRecently, now), true);
});

test("the case that started this: a snapshot days old on a recent campaign", () => {
  const row = { last_event: "delivered", events: "[]", updated_at: "2026-10-01T07:00:00Z" };
  assert.equal(shouldRefresh(row, sentRecently, now), true);
});

test("bounces and complaints are settled", () => {
  for (const last_event of ["bounced", "complained"]) {
    assert.equal(shouldRefresh({ last_event, events: "[]", updated_at: minutesAgo(999) }, sentRecently, now), false);
  }
});

test("a campaign older than thirty days is left alone", () => {
  const row = { last_event: "delivered", events: "[]", updated_at: "2026-08-13T00:00:00Z" };
  assert.equal(shouldRefresh(row, "2026-08-12T09:38:04Z", now), false);
});

test("the stronger event wins, whichever order they arrive in", () => {
  assert.equal(strongerEvent("clicked", "opened"), "clicked");
  assert.equal(strongerEvent("delivered", "clicked"), "clicked");
  assert.equal(strongerEvent(undefined, "delivered"), "delivered");
  assert.equal(strongerEvent("sent", "bounced"), "bounced");
});

test("tally counts a click as delivered too", () => {
  assert.deepEqual(tally(["delivered", "clicked", "bounced", "complained", "sent", "opened"], 6), {
    total: 6, delivered: 3, clicked: 1, bounced: 1, complained: 1,
  });
});
