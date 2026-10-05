import { supabaseServer } from "@/lib/supabase";
import type {
  DistributionCampaignConfig,
  DistributionGoal,
  DistributionPlatform,
} from "@/lib/distributionTypes";

const GOALS: DistributionGoal[] = ["launch", "early_users", "credibility", "waitlist"];

function mapDbError(message: string | undefined): string {
  const m = message ?? "database error";
  if (
    /distribution_campaigns|distribution_opportunities/i.test(m) &&
    /(schema cache|does not exist|Could not find the table)/i.test(m)
  ) {
    return "Distribution tables missing. Apply Supabase migration 009_distribution_opportunities.sql, then retry.";
  }
  return m;
}

function rowToConfig(row: Record<string, unknown>): DistributionCampaignConfig {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    goal: row.goal as DistributionGoal,
    angle: (row.angle as string) ?? undefined,
    surfaces: (row.surfaces as DistributionPlatform[]) ?? [],
    autonomous_paused: Boolean(row.autonomous_paused),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ config: null });
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id required" }, { status: 400 });
  const { data } = await sb
    .from("distribution_campaigns")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  return Response.json({ config: data ? rowToConfig(data) : null });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "database not configured" }, { status: 503 });

  const body = await request.json();
  const session_id = body.session_id as string | undefined;
  const goal = body.goal as DistributionGoal | undefined;
  if (!session_id || !goal || !GOALS.includes(goal)) {
    return Response.json({ error: "session_id and valid goal required" }, { status: 400 });
  }

  const angle =
    typeof body.angle === "string" && body.angle.trim() ? body.angle.trim() : defaultAngle(goal);
  const surfaces: DistributionPlatform[] = Array.isArray(body.surfaces)
    ? body.surfaces
    : ["x", "reddit", "linkedin"];

  const { data, error } = await sb
    .from("distribution_campaigns")
    .upsert(
      {
        session_id,
        goal,
        angle,
        surfaces,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    )
    .select("*")
    .single();

  if (error) return Response.json({ error: mapDbError(error.message) }, { status: 500 });
  return Response.json({ config: rowToConfig(data) });
}

export async function PATCH(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "database not configured" }, { status: 503 });
  const body = await request.json();
  const session_id = body.session_id as string | undefined;
  if (!session_id) return Response.json({ error: "session_id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.autonomous_paused === "boolean") patch.autonomous_paused = body.autonomous_paused;
  if (typeof body.angle === "string") patch.angle = body.angle;
  if (Array.isArray(body.surfaces)) patch.surfaces = body.surfaces;

  const { data, error } = await sb
    .from("distribution_campaigns")
    .update(patch)
    .eq("session_id", session_id)
    .select("*")
    .single();
  if (error) return Response.json({ error: mapDbError(error.message) }, { status: 500 });
  return Response.json({ config: rowToConfig(data) });
}

function defaultAngle(goal: DistributionGoal): string {
  switch (goal) {
    case "launch":
      return "Show a concrete before/after moment of the product and invite early feedback.";
    case "early_users":
      return "Join conversations where people describe the exact problem you solve; offer a useful answer first.";
    case "credibility":
      return "Share a specific insight from building the product that peers would bookmark.";
    case "waitlist":
      return "Create curiosity with a clear problem statement and a low-friction waitlist ask.";
  }
}
