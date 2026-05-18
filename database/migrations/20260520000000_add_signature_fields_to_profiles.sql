-- Migration: add HTML email signature fields to profiles.
--
-- Mirrors sys.wolthers.com's user_profiles signature columns so we can
-- attach a per-user HTML signature to report emails sent via Microsoft
-- Graph. Signature rendering is per-user (name, title, contact info, +
-- Q Grader badge when is_q_grader=true). The "Groups" line is fixed to
-- qualitycontrol@wolthers.com — WAQC doesn't have a multi-department
-- model like sys does.
--
-- Storage strategy mirrors sys: we store both the editable source fields
-- AND the rendered HTML on the profile row. The render is recomputed on
-- every PATCH to /api/profile so the cached HTML never drifts. Sending
-- the report just reads email_signature_html — zero rendering cost on
-- the hot path.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS teams_email TEXT,
  ADD COLUMN IF NOT EXISTS email_signature_html TEXT,
  ADD COLUMN IF NOT EXISTS email_signature_compact_html TEXT;

COMMENT ON COLUMN profiles.title IS
  'Job title shown in the email signature (e.g. "Quality Director", "Senior Cupper"). Free text, optional.';
COMMENT ON COLUMN profiles.phone IS
  'Phone shown in the compact signature variant. Free text, optional.';
COMMENT ON COLUMN profiles.whatsapp IS
  'WhatsApp number (with country code). Used to build a wa.me link in the signature.';
COMMENT ON COLUMN profiles.teams_email IS
  'Microsoft Teams chat address. Falls back to profiles.email when null.';
COMMENT ON COLUMN profiles.email_signature_html IS
  'Cached rendered full HTML signature. Recomputed by /api/profile PATCH on every save; read directly by report-send endpoints.';
COMMENT ON COLUMN profiles.email_signature_compact_html IS
  'Cached rendered compact (reply) HTML signature. Same recompute rules as the full variant.';
