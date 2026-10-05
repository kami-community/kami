-- Hermes-recommended distribution plan fields.
-- Goal is no longer a fixed enum — Hermes chooses; founder confirms/edits.

ALTER TABLE distribution_campaigns
  DROP CONSTRAINT IF EXISTS distribution_campaigns_goal_check;

ALTER TABLE distribution_campaigns
  ADD COLUMN IF NOT EXISTS goal_label TEXT,
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS why_these_surfaces TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS revise_note TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS hermes_session_id TEXT;

-- Soft status check (drop+add for idempotent re-runs)
ALTER TABLE distribution_campaigns
  DROP CONSTRAINT IF EXISTS distribution_campaigns_status_check;

ALTER TABLE distribution_campaigns
  ADD CONSTRAINT distribution_campaigns_status_check
  CHECK (status IN ('proposed', 'approved', 'superseded'));

-- Existing rows were created via the old chip flow — treat as approved so research still works.
UPDATE distribution_campaigns
SET status = 'approved'
WHERE status = 'proposed'
  AND angle IS NOT NULL
  AND length(trim(angle)) > 0
  AND created_at < now();

COMMENT ON COLUMN distribution_campaigns.goal IS
  'Hermes-chosen distribution job key or free-text slug (not a rigid enum).';
COMMENT ON COLUMN distribution_campaigns.goal_label IS
  'Plain-English job for the founder UI.';
COMMENT ON COLUMN distribution_campaigns.status IS
  'proposed = awaiting founder confirm; approved = research unlocked.';
