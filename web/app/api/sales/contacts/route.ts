import { supabaseServer } from "@/lib/supabase";

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const { session_id, account_id, name, email } = body as {
    session_id?: string;
    account_id?: string;
    name?: string;
    email?: string;
  };

  if (!session_id || !account_id || !email?.includes("@")) {
    return Response.json(
      { error: "session_id, account_id, and valid email required" },
      { status: 400 },
    );
  }

  const { data: account } = await sb
    .from("sales_accounts")
    .select("id, session_id, name")
    .eq("id", account_id)
    .eq("session_id", session_id)
    .maybeSingle();

  if (!account) return Response.json({ error: "account not found" }, { status: 404 });

  const { data: existing } = await sb
    .from("sales_contacts")
    .select("id")
    .eq("account_id", account_id)
    .eq("session_id", session_id)
    .maybeSingle();

  const row = {
    session_id,
    account_id,
    name: name ?? account.name,
    email: email.trim().toLowerCase(),
    email_verification: "valid",
    do_not_contact: false,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await sb
      .from("sales_contacts")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ persisted: true, contact: data });
  }

  const { data, error } = await sb.from("sales_contacts").insert(row).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await sb.from("sales_audit_events").insert({
    session_id,
    actor: "user",
    action: "contact_email_added",
    entity_type: "sales_contact",
    entity_id: data.id,
    payload: { account_id, email: row.email },
  });

  return Response.json({ persisted: true, contact: data });
}
