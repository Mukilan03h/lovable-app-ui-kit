"""release A: answer corrections (correction -> reusable knowledge)

Revision ID: 0002_release_a
Revises: 0001_baseline
Create Date: 2026-10-09

A correction is a user-proposed fix to an answer, with supporting evidence, that a
knowledge owner reviews. Approved corrections influence future answers, but only
within an access scope and until an expiry/review date — a correction never
silently becomes company-wide truth. The row records who approved it, its scope
and its expiry so provenance is auditable.
"""

from __future__ import annotations

from alembic import op

revision = "0002_release_a"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

_UP = """
CREATE TABLE IF NOT EXISTS answer_corrections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  query           text NOT NULL,
  normalized      text NOT NULL DEFAULT '',
  original_answer text NOT NULL DEFAULT '',
  corrected_answer text NOT NULL,
  evidence_url    text NOT NULL DEFAULT '',
  scope           jsonb NOT NULL DEFAULT '["public"]'::jsonb,  -- principals it applies to
  status          text NOT NULL DEFAULT 'pending',             -- pending | approved | rejected
  submitted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  submitter_name  text NOT NULL DEFAULT '',
  reviewed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewer_name   text NOT NULL DEFAULT '',
  review_note     text NOT NULL DEFAULT '',
  approved_at     timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS answer_corrections_norm_idx ON answer_corrections (tenant_id, normalized);
ALTER TABLE answer_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON answer_corrections;
CREATE POLICY tenant_isolation ON answer_corrections
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS answer_corrections")
