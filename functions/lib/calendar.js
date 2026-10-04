// Calendar invites for Collective events.
//
// A gathering that lives only in an email is a gathering people forget, or
// never see because the email was filed under Promotions. Two things put it
// on a calendar instead: a link that opens Google Calendar with the event
// filled in, and an .ics file that Apple Calendar, Outlook and everything
// else can open.
//
// Both are built from the stored event, never typed, so the time on the
// calendar cannot drift from the time on the Events page. Both carry the
// joining link, so they are only ever handed to members.

const SITE = "https://montessoriforadolescents.com";
const ORG = "Montessori Adolescent Collective";
const DEFAULT_MINUTES = 60;

// Start and end as Dates. An event with no end, or an end that is not after
// its start, is given an hour: long enough to block out, short enough not to
// swallow someone's evening.
export function eventWindow(event) {
  const start = new Date(event?.starts_at);
  if (Number.isNaN(start.getTime())) return null;
  let end = event.ends_at ? new Date(event.ends_at) : null;
  if (!end || Number.isNaN(end.getTime()) || end <= start) {
    end = new Date(start.getTime() + DEFAULT_MINUTES * 60 * 1000);
  }
  return { start, end };
}

// 20261004T130000Z — UTC, so no timezone database is needed anywhere.
function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function isOnline(location) {
  return !location || /^\s*(online|virtual|zoom|google meet|meet)\s*$/i.test(location);
}

// The words that go on the calendar entry.
export function calendarText(event) {
  const title = `${String(event.title || "Gathering").trim()} · ${ORG}`;

  const lines = [];
  if (event.description) lines.push(String(event.description).trim());
  if (event.timezone_note) lines.push(String(event.timezone_note).trim());
  lines.push(
    event.link
      ? `Join: ${event.link}`
      : `The joining link will be on the Events page before we meet.`
  );
  lines.push(`Events page: ${SITE}/collective/events/`);

  const location = isOnline(event.location)
    ? event.link || "Online"
    : String(event.location).trim();

  return { title, details: lines.join("\n\n"), location };
}

// A link that opens Google Calendar with the event ready to save.
export function googleCalendarUrl(event) {
  const window = eventWindow(event);
  if (!window) return "";
  const { title, details, location } = calendarText(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(window.start)}/${stamp(window.end)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ---- .ics -----------------------------------------------------------

function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,");
}

// RFC 5545: no line longer than 75 octets; continuation lines start with a
// space. Counted in bytes, and never split inside a multi-byte character.
function fold(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = " ";
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

// The whole calendar file. `now` is injectable so tests are repeatable.
export function buildIcs(event, { now = new Date() } = {}) {
  const window = eventWindow(event);
  if (!window) return "";
  const { title, details, location } = calendarText(event);
  const modified = new Date(event.updated_at || "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Montessori for Adolescents//Collective//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.id)}@montessoriforadolescents.com`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(window.start)}`,
    `DTEND:${stamp(window.end)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(details)}`,
    `LOCATION:${escapeText(location)}`,
    `URL:${event.link || `${SITE}/collective/events/`}`,
    event.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
  ];
  if (!Number.isNaN(modified.getTime())) lines.push(`LAST-MODIFIED:${stamp(modified)}`);
  lines.push(
    // A nudge the day before and an hour before, for calendars that honour
    // reminders carried in the file.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(title)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(title)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  );

  return lines.map(fold).join("\r\n") + "\r\n";
}

// inaugural-gathering-2026-10-04.ics
export function icsFilename(event) {
  const slug =
    String(event.title || "gathering")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "gathering";
  const window = eventWindow(event);
  const day = window ? window.start.toISOString().slice(0, 10) : "";
  return day ? `${slug}-${day}.ics` : `${slug}.ics`;
}

// Base64 of the UTF-8 bytes, for an email attachment. btoa() alone would
// throw on any character outside Latin-1.
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// The path a signed-in member downloads the file from.
export function icsPath(event) {
  return `/api/community/event-ics?id=${encodeURIComponent(event.id)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// What an email needs to carry the invite: a line for the body with the
// one-click Google link, and the .ics as an attachment for Apple Calendar,
// Outlook and the rest. An event whose date can't be read gets neither, and
// the email goes out as it would have.
export function inviteForEmail(event) {
  const ics = buildIcs(event);
  const google = googleCalendarUrl(event);
  if (!ics || !google) return { calendarBlock: "", attachments: undefined };

  return {
    calendarBlock:
      `<p style="color:#6b5b7d;font-size:14px;margin-top:20px;">Put it in your calendar: ` +
      `<a href="${escapeHtml(google)}" style="color:#3f265b;">add to Google Calendar</a>, ` +
      `or open the attached invite for Apple Calendar and Outlook.</p>`,
    // No content type given: Resend derives text/calendar from ".ics",
    // which is the documented path and one less thing for it to refuse.
    attachments: [{ filename: icsFilename(event), content: toBase64(ics) }],
  };
}
