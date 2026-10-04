// POST /api/webinar-access   { webinar, email }
//
// "I bought this recording — send me my link." The way back in for a buyer
// on a new device, or whose link has lapsed.
//
// The reply is the same whether or not the address bought anything, so the
// form can't be used to find out who our customers are. Nothing is sent to
// an address with no purchase: this must not become a way to make us email
// strangers.

import { normalizeEmail, isValidEmail } from "../lib/community-auth.js";
import {
  getRecording,
  hasAccess,
  recentLinkCount,
  sendAccessLink,
} from "../lib/webinar-access.js";

// At most this many links to one address in the window, so the form can't
// be used to flood a buyer's inbox either.
const MAX_LINKS = 3;
const WINDOW_MINUTES = 15;

export async function onRequestPost(context) {
  const { env, request } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const recording = await getRecording(env, payload.webinar);
  if (recording && (await hasAccess(env, recording.webinar_id, email))) {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    if ((await recentLinkCount(env, recording.webinar_id, email, since)) < MAX_LINKS) {
      const ip =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For") ||
        "unknown";
      await sendAccessLink(context, recording, email, ip);
    }
  }

  // Identical response in every branch.
  return Response.json({
    ok: true,
    message:
      "Check your email — if that address bought the recording, your link to watch is on its way. Nothing after a few minutes? Try the address on your Stripe receipt, or get in touch.",
  });
}
