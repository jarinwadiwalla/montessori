// Shared helpers for direct messages.
//
// Conversations are stored with the member pair in a fixed order so the
// same two people can only ever have one thread, whoever writes first.

import { generateId } from "./community-auth.js";

/** Canonical pair order — smaller id first, so lookups work from either side. */
export function pairKey(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

/** Which side of the conversation row is this member on? */
export function sideOf(conversation, memberId) {
  return conversation.member_a === memberId ? "a" : "b";
}

/** The other person's id. */
export function otherId(conversation, memberId) {
  return conversation.member_a === memberId
    ? conversation.member_b
    : conversation.member_a;
}

/**
 * Unread for this member when the last message is newer than their read
 * marker and they did not send it themselves.
 */
export function isUnread(conversation, memberId) {
  if (!conversation.last_message_at) return false;
  if (conversation.last_sender_id === memberId) return false;
  const marker =
    sideOf(conversation, memberId) === "a"
      ? conversation.a_last_read_at
      : conversation.b_last_read_at;
  return !marker || conversation.last_message_at > marker;
}

/** Find the conversation between two members, or null. */
export async function findConversation(env, id1, id2) {
  const [a, b] = pairKey(id1, id2);
  return env.SITE_DB.prepare(
    "SELECT * FROM community_conversations WHERE member_a = ? AND member_b = ?"
  )
    .bind(a, b)
    .first();
}

/** Find it, or create it. Safe against two people writing at the same moment. */
export async function ensureConversation(env, id1, id2) {
  const existing = await findConversation(env, id1, id2);
  if (existing) return existing;

  const [a, b] = pairKey(id1, id2);
  const now = new Date().toISOString();
  try {
    await env.SITE_DB.prepare(
      `INSERT INTO community_conversations
         (id, member_a, member_b, created_at, last_message_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(generateId("conv_"), a, b, now, now)
      .run();
  } catch {
    // Unique index tripped — the other side created it first. Fall through
    // and read theirs rather than failing the send.
  }
  return findConversation(env, id1, id2);
}

/** Has `memberId` muted `otherMemberId`? */
export async function hasMuted(env, memberId, otherMemberId) {
  const row = await env.SITE_DB.prepare(
    "SELECT 1 AS n FROM community_mutes WHERE member_id = ? AND muted_id = ?"
  )
    .bind(memberId, otherMemberId)
    .first();
  return !!row;
}

/** How many conversations have something unread for this member. */
export async function unreadCount(env, memberId) {
  try {
    const row = await env.SITE_DB.prepare(
      `SELECT COUNT(*) AS n FROM community_conversations
       WHERE last_sender_id != '' AND last_sender_id != ?
         AND ((member_a = ? AND (a_last_read_at = '' OR last_message_at > a_last_read_at))
           OR (member_b = ? AND (b_last_read_at = '' OR last_message_at > b_last_read_at)))`
    )
      .bind(memberId, memberId, memberId)
      .first();
    return row?.n || 0;
  } catch {
    // Table not created yet — the badge simply stays at zero.
    return 0;
  }
}
