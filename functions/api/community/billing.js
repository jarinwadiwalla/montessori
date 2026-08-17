// POST /api/community/billing — open Stripe's billing portal
//
// Lets a member update their card, switch between monthly and annual, or
// cancel, without any of it landing in Jarin's inbox.
//
// Deliberately uses getMember rather than requireMember: someone whose
// payment has failed is exactly the person who needs this page, and
// requireMember would turn them away with a 402.

import { getMember } from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  const { env } = context;

  const member = await getMember(context);
  if (!member) {
    return Response.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  if (!member.stripe_customer_id) {
    // Comped members (Jarin, the team, anyone added by hand) have no
    // Stripe customer and nothing to manage.
    return Response.json(
      { error: "There are no dues on your membership, so there's nothing to manage." },
      { status: 400 }
    );
  }

  if (!env.STRIPE_SECRET_KEY) {
    return Response.json(
      { error: "Billing isn't configured yet. Please get in touch and we'll help." },
      { status: 503 }
    );
  }

  const body = new URLSearchParams({
    customer: member.stripe_customer_id,
    return_url: "https://montessoriforadolescents.com/collective/portal/",
  });

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    return Response.json(
      { error: "Could not open the billing page. Please try again shortly." },
      { status: 502 }
    );
  }

  const session = await res.json();
  return Response.json({ ok: true, url: session.url });
}
