-- Migration 20260925000001: recycle unsent certificate numbers — PART 1 of 5
-- Void markers on certificates + the pool of released numbers.
--
-- WHY: a certificate on a deleted sample keeps its number and leaves the
-- /certificates list with the sample, so the client's line shows a hole. Two
-- ways in: a certified sample deleted afterwards (allowed since 2026-09-17),
-- or a group certification that still numbered contract rows deleted before
-- it. The second made the Dunkin Santos hole BR-037406/26 -> BR-037412/26:
-- contracts #2-#6 of SAN-01082/26, deleted 23/09 08:31, numbered 15:29.
-- A deleted certificate that never reached the client now gives its number
-- back, and the next certificate of that line takes it.
--
-- Replaces 20260924000000, which the Supabase SQL editor could not run: the
-- editor mistakes a PL/pgSQL variable filled by a select-with-target for a new
-- table and appends "ALTER TABLE v_x ENABLE ROW LEVEL SECURITY" to the script
-- (42P01 relation "v_pattern" does not exist). These parts fill variables by
-- assignment only and make no table inside a function. Not even the comments
-- carry the pattern: the editor's scan may not skip them.
--
-- Run the five parts in order, each on its own, in the Supabase SQL editor.
-- Each part is one implicit transaction: all of it applies or none of it.
-- Every statement is idempotent; re-run a part if it times out on a lock.

SET LOCAL lock_timeout = '5s';

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS voided_number TEXT;
COMMENT ON COLUMN certificates.voided_at IS
  'Set when the certificate''s sample was deleted. A voided certificate is never shown or sent.';
COMMENT ON COLUMN certificates.voided_number IS
  'The number the certificate carried when it was voided. A released number is also suffixed " VOID-<id8>" on certificate_number.';

CREATE TABLE IF NOT EXISTS certificate_number_pool (
  client_id      UUID NOT NULL,
  laboratory_id  UUID NOT NULL,
  year           INT  NOT NULL,
  sequence       INT  NOT NULL,
  certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
  released_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, laboratory_id, year, sequence)
);
-- Written and read only by the SECURITY DEFINER functions of part 2.
ALTER TABLE certificate_number_pool ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE certificate_number_pool IS
  'Released sequences of voided, never-sent certificates, per certificate_sequences line. '
  'mint_certificate_number() hands out the lowest one before advancing the line.';
