// GET  /api/resend-webhook-status — is delivery tracking working?
// POST /api/resend-webhook-status — { action: "reconnect" }: repair it.
//
// Used by Guru → Newsletter → Campaigns. Admin only, and fail-closed: this
// changes how the site is wired to Resend.

import { requireAdminStrict } from "../lib/auth.js";
import {
  WEBHOOK_ENDPOINT,
  readWebhookConfig,
  readWebhookHealth,
  listResendWebhooks,
  reconnectResendWebhook,
  describeWebhookState,
} from "../lib/resend-webhooks.js";

async function status(env) {
  const [config, health] = await Promise.all([readWebhookConfig(env), readWebhookHealth(env)]);

  let webhooks = null;
  let resendError = "";
  if (!env.RESEND_API_KEY) {
    resendError = "No Resend API key is set on this deployment.";
  } else {
    try {
      webhooks = await listResendWebhooks(env);
    } catch (err) {
      resendError = err.message || "Could not reach Resend.";
    }
  }

  const hasEnvSecret = Boolean(env.RESEND_WEBHOOK_SECRET);
  const { verdict, advice } = describeWebhookState({ health, config, hasEnvSecret, webhooks });

  // Never the secret itself: only whether one is held, and from where.
  return {
    endpoint: WEBHOOK_ENDPOINT,
    verdict,
    advice,
    health: {
      lastReceivedAt: health.lastReceivedAt || "",
      lastEventType: health.lastEventType || "",
      receivedCount: health.receivedCount || 0,
      lastRejectedAt: health.lastRejectedAt || "",
      rejectedCount: health.rejectedCount || 0,
    },
    secret: {
      adoptedFromResend: Boolean(config.signingSecret),
      setByHand: hasEnvSecret,
      connectedAt: config.connectedAt || "",
    },
    resend: { reachable: webhooks !== null, error: resendError, webhooks: webhooks || [] },
  };
}

export async function onRequestGet(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;
  return Response.json(await status(context.env));
}

export async function onRequestPost(context) {
  const authErr = requireAdminStrict(context);
  if (authErr) return authErr;

  const { env, request } = context;
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  if (payload.action !== "reconnect") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const result = await reconnectResendWebhook(env);
    return Response.json({ ok: true, result, status: await status(env) });
  } catch (err) {
    // A sending-only key cannot manage webhooks; say what to do instead.
    const restricted = err.status === 401 || err.status === 403;
    return Response.json(
      {
        error: restricted
          ? "This site's Resend key is not allowed to manage webhooks. In Resend, open Webhooks, add the endpoint shown here, then set its signing secret as RESEND_WEBHOOK_SECRET."
          : err.message || "Could not reconnect.",
        endpoint: WEBHOOK_ENDPOINT,
      },
      { status: restricted ? 409 : 502 }
    );
  }
}
