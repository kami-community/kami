-- Viral / current format metadata on distribution opportunities.

ALTER TABLE distribution_opportunities
  ADD COLUMN IF NOT EXISTS format_used TEXT,
  ADD COLUMN IF NOT EXISTS format_why TEXT;

COMMENT ON COLUMN distribution_opportunities.format_used IS
  'Platform format pattern Hermes chose for this draft (refreshed per research run).';
COMMENT ON COLUMN distribution_opportunities.format_why IS
  'One-line why that format fits this week / this source.';
