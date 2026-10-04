// GET /webinars/<id>/watch/
//
// The paid recording. Astro builds only the frame of this page; the player
// is put in here, and only for someone who can show they bought it:
//
//   ?session_id=cs_…  arriving from Stripe checkout — confirmed with Stripe
//   ?key=…            arriving from the link we emailed them
//   cookie            coming back on a browser that has done either
//
// Anyone else is sent to the sales page, which is also where a buyer asks
// for a fresh link. Being a Collective member is deliberately not a way in.

import {
  PLAYER_SLOT,
  watchPath,
  isWebinarId,
  getRecording,
  grantAccess,
  emailForLink,
  viewerEmail,
  startSession,
  verifyCheckoutSession,
} from "../../lib/webinar-access.js";

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const id = String(params.id || "");
  if (!isWebinarId(id)) return context.next();

  const url = new URL(request.url);
  const toSalesPage = (why) => redirect(`/webinars/${id}/?access=${why}#access`);

  // No row means nothing can be shown, whatever the visitor holds. If the
  // site has no such page either, let that be the 404 it always was.
  const recording = await getRecording(env, id);
  if (!recording) {
    const page = await context.next();
    return page.status === 404 ? page : toSalesPage("needed");
  }

  // Proof arrives in the address; swap it for a cookie and a clean address,
  // so it isn't left in the history or copied along with the link.
  const letIn = async (email) => redirect(watchPath(id), await startSession(env, id, email));

  const sessionId = url.searchParams.get("session_id");
  const key = url.searchParams.get("key");
  if (sessionId) {
    const purchase = await verifyCheckoutSession(env, recording, sessionId);
    if (purchase) {
      await grantAccess(env, id, purchase.email, {
        source: "checkout",
        paymentId: purchase.paymentId,
      });
      return letIn(purchase.email);
    }
  } else if (key) {
    const email = await emailForLink(env, id, key);
    if (email) return letIn(email);
  }

  if (!(await viewerEmail(context, id))) {
    return toSalesPage(sessionId ? "unconfirmed" : key ? "expired" : "needed");
  }
  // An old link opened on a browser that is still signed in: just watch.
  if (sessionId || key) return redirect(watchPath(id));

  // Fetch the frame afresh, without the visitor's conditional headers: a
  // 304 has no body to put the player into.
  const frame = await context.next(new Request(new URL(watchPath(id), url)));
  if (!frame.ok) return frame;
  const html = (await frame.text()).replace(PLAYER_SLOT, () => playerHtml(recording));

  return new Response(html, {
    headers: {
      "Content-Type": frame.headers.get("Content-Type") || "text/html; charset=utf-8",
      // This copy contains the player's address: no shared cache may keep it.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function redirect(location, cookie) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function playerHtml(recording) {
  const src = String(recording.embed_url || "");
  if (!src.startsWith("https://")) {
    return `<div class="watch-pending">
        <p>The recording is being prepared and will appear here shortly. If it
        isn’t ready soon, <a href="/contact/">get in touch</a> and we’ll send it
        to you right away.</p>
      </div>`;
  }
  return `<div class="video-frame">
        <iframe
          src="${escapeHtml(src)}"
          title="${escapeHtml(recording.title || "Webinar recording")}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
