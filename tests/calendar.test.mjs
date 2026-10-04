import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventWindow,
  googleCalendarUrl,
  buildIcs,
  icsFilename,
  toBase64,
  inviteForEmail,
  calendarText,
} from "../functions/lib/calendar.js";

const gathering = {
  id: "evt_abc123",
  title: "Inaugural Gathering!",
  description: "Say hello; bring one thing you're stuck on.",
  starts_at: "2026-10-04T13:00:00.000Z",
  ends_at: "",
  timezone_note: "9:00pm Malaysia · 3:00pm France & Spain · 7:00am Mexico",
  location: "Online",
  link: "https://meet.google.com/abc-defg-hij",
  status: "visible",
  updated_at: "2026-10-01T05:00:00.000Z",
};

test("an event with no end is given an hour", () => {
  const { start, end } = eventWindow(gathering);
  assert.equal(start.toISOString(), "2026-10-04T13:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-04T14:00:00.000Z");
});

test("a stated end is respected, an end before the start is not", () => {
  assert.equal(
    eventWindow({ ...gathering, ends_at: "2026-10-04T14:30:00.000Z" }).end.toISOString(),
    "2026-10-04T14:30:00.000Z"
  );
  assert.equal(
    eventWindow({ ...gathering, ends_at: "2026-10-04T12:00:00.000Z" }).end.toISOString(),
    "2026-10-04T14:00:00.000Z"
  );
});

test("an unreadable date yields no calendar entry at all", () => {
  const broken = { ...gathering, starts_at: "soon" };
  assert.equal(eventWindow(broken), null);
  assert.equal(googleCalendarUrl(broken), "");
  assert.equal(buildIcs(broken), "");
  assert.deepEqual(inviteForEmail(broken), { calendarBlock: "", attachments: undefined });
});

test("the Google link carries the time in UTC, the title and the joining link", () => {
  const url = new URL(googleCalendarUrl(gathering));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261004T130000Z/20261004T140000Z");
  assert.match(url.searchParams.get("text"), /^Inaugural Gathering! · Montessori Adolescent Collective$/);
  assert.match(url.searchParams.get("details"), /Join: https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.equal(url.searchParams.get("location"), "https://meet.google.com/abc-defg-hij");
});

test("an online event with no link yet says where the link will be", () => {
  const { details, location } = calendarText({ ...gathering, link: "" });
  assert.match(details, /joining link will be on the Events page/);
  assert.equal(location, "Online");
});

test("a real place is kept as the location", () => {
  assert.equal(calendarText({ ...gathering, location: "Ubud, Bali" }).location, "Ubud, Bali");
});

test("the .ics is a well-formed single event", () => {
  const ics = buildIcs(gathering, { now: new Date("2026-10-01T00:00:00Z") });
  assert.ok(ics.endsWith("\r\n"), "ends with CRLF");
  assert.ok(!/[^\r]\n/.test(ics), "every line break is CRLF");

  const unfolded = ics.replace(/\r\n /g, "");
  const lines = unfolded.trim().split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  assert.ok(lines.includes("METHOD:PUBLISH"));
  assert.ok(lines.includes("UID:evt_abc123@montessoriforadolescents.com"));
  assert.ok(lines.includes("DTSTAMP:20261001T000000Z"));
  assert.ok(lines.includes("DTSTART:20261004T130000Z"));
  assert.ok(lines.includes("DTEND:20261004T140000Z"));
  assert.ok(lines.includes("STATUS:CONFIRMED"));
  assert.ok(lines.includes("LAST-MODIFIED:20261001T050000Z"));
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 1);
  assert.equal(lines.filter((l) => l === "BEGIN:VALARM").length, 2);
  assert.ok(lines.includes("TRIGGER:-P1D") && lines.includes("TRIGGER:-PT1H"));
});

test("text is escaped: commas, semicolons, backslashes and new lines", () => {
  const ics = buildIcs({ ...gathering, title: "Maths; seminars, part 1", description: "Line one\nLine two \\ done" });
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /SUMMARY:Maths\; seminars\\, part 1 · Montessori Adolescent Collective/);
  assert.match(unfolded, /DESCRIPTION:Line one\\nLine two \\\\ done\\n\\n/);
});

test("no line is longer than 75 octets, and folding never splits a character", () => {
  const long = { ...gathering, description: "Ünïcödé — ".repeat(40) };
  const ics = buildIcs(long);
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long: ${line}`);
  }
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("Ünïcödé — ".repeat(40).trim().replace(/,/g, "\\,")));
});

test("a cancelled event says so", () => {
  assert.match(buildIcs({ ...gathering, status: "cancelled" }), /STATUS:CANCELLED/);
});

test("the file name is readable and dated", () => {
  assert.equal(icsFilename(gathering), "inaugural-gathering-2026-10-04.ics");
  assert.equal(icsFilename({ ...gathering, title: "" }), "gathering-2026-10-04.ics");
});

test("base64 survives characters outside Latin-1", () => {
  const text = "9:00pm Malaysia · café — 日本";
  assert.equal(Buffer.from(toBase64(text), "base64").toString("utf8"), text);
});

test("the email invite has a Google link in the body and the .ics attached", () => {
  const { calendarBlock, attachments } = inviteForEmail(gathering);
  assert.match(calendarBlock, /href="https:\/\/calendar\.google\.com\/calendar\/render\?[^"]+"/);
  assert.ok(!/href="[^"]*[<>]/.test(calendarBlock), "link is attribute-safe");
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].filename, "inaugural-gathering-2026-10-04.ics");
  assert.equal("content_type" in attachments[0], false, "the type is left for Resend to derive from .ics");
  const decoded = Buffer.from(attachments[0].content, "base64").toString("utf8");
  assert.match(decoded, /^BEGIN:VCALENDAR\r\n/);
  assert.match(decoded.replace(/\r\n /g, ""), /Join: https:\/\/meet\.google\.com\/abc-defg-hij/);
});
