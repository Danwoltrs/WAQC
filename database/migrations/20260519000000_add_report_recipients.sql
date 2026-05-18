-- Migration: persisted recipient lists per (client, report_type).
--
-- Each successful send replaces the row for (client_id, report_type) with the
-- exact recipient set the user just sent to. Next time the Send modal opens
-- for that client + report type, the To/Cc inputs are pre-filled from this
-- row so the user doesn't have to re-paste addresses.
--
-- The qualitycontrol@wolthers.com mailbox is auto-added on send and is NOT
-- stored here — it's a global constant from MICROSOFT_GRAPH_MAILBOX, not a
-- per-client preference.
--
-- One row per (client_id, report_type) — semantics are "what was sent last
-- time", not a history log. Future report types (weekly_ss, biweekly,
-- monthly, annual) all coexist as separate rows under the same client.

CREATE TABLE IF NOT EXISTS report_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  cc_emails TEXT[] NOT NULL DEFAULT '{}',
  bcc_emails TEXT[] NOT NULL DEFAULT '{}',
  last_sent_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, report_type)
);

CREATE INDEX IF NOT EXISTS idx_report_recipients_client_type
  ON report_recipients (client_id, report_type);

COMMENT ON TABLE report_recipients IS
  'Per-(client, report_type) recipient set. Replaced on each successful send; not a history log. qualitycontrol@wolthers.com is auto-CCed on every send and is NOT stored here.';

-- RLS: any authenticated user can read/write — recipient lists aren't
-- sensitive, and any user who can send a report can also see who it was sent
-- to.
ALTER TABLE report_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read report recipients" ON report_recipients;
CREATE POLICY "Authenticated users can read report recipients"
  ON report_recipients FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can upsert report recipients" ON report_recipients;
CREATE POLICY "Authenticated users can upsert report recipients"
  ON report_recipients FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update report recipients" ON report_recipients;
CREATE POLICY "Authenticated users can update report recipients"
  ON report_recipients FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
