/**
 * Send an X Direct Message as the connected user (OAuth user token).
 * Requires X API access that includes DM scopes (often Basic+).
 */

export interface XDmReceipt {
  dm_event_id?: string;
  conversation_id?: string;
  raw: unknown;
}

export async function sendXDirectMessage(params: {
  accessToken: string;
  recipientUsername: string;
  text: string;
}): Promise<XDmReceipt> {
  const handle = params.recipientUsername.replace(/^@/, "").trim();
  const text = params.text.trim();
  if (!handle) throw new Error("recipient handle required");
  if (!text) throw new Error("message text required");
  if (text.length > 10000) throw new Error("DM too long");

  // Resolve recipient user id
  const userRes = await fetch(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } },
  );
  const userJson = (await userRes.json().catch(() => ({}))) as {
    data?: { id?: string };
    title?: string;
    detail?: string;
    errors?: { message?: string }[];
  };
  if (!userRes.ok || !userJson.data?.id) {
    const msg =
      userJson.detail ??
      userJson.title ??
      userJson.errors?.[0]?.message ??
      `Could not resolve @${handle}`;
    throw new Error(msg);
  }

  const res = await fetch(
    "https://api.x.com/2/dm_conversations/with/" + userJson.data.id + "/messages",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json as { title?: string; detail?: string; errors?: { message?: string }[] };
    const msg = err.detail ?? err.title ?? err.errors?.[0]?.message ?? `X DM API ${res.status}`;
    if (res.status === 403) {
      throw new Error(
        `${msg} — X DM access may require a paid API tier and dm.read/dm.write scopes. Reconnect X after enabling DMs.`,
      );
    }
    throw new Error(msg);
  }

  const data = json as { data?: { dm_conversation_id?: string; dm_event_id?: string } };
  return {
    dm_event_id: data.data?.dm_event_id,
    conversation_id: data.data?.dm_conversation_id,
    raw: json,
  };
}
