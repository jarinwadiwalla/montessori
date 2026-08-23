// POST /api/community/accept-guidelines
// Records that the signed-in member has read and accepted the community
// guidelines. Asked once, at first sign-in.

import { requireMember } from "../../lib/community-auth.js";

export async function onRequestPost(context) {
  const { member, response } = await requireMember(context);
  if (response) return response;

  if (!member.guidelines_accepted_at) {
    await context.env.SITE_DB.prepare(
      "UPDATE community_members SET guidelines_accepted_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), member.id)
      .run();
  }

  return Response.json({ ok: true });
}
