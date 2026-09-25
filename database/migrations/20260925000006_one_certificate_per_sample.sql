-- Migration 20260925000006: one certificate row per sample
--
-- WHY: mintGroupCertificates reads a sample's certificate and inserts one when
-- none exists, with no lock between the two. Two certifications of the same
-- lot at the same moment (a double click, two tabs), or a failed read, would
-- insert a second certificate with a fresh number that no list shows: one
-- more hole in the client's line. Checked on prod 2026-09-25: no sample holds
-- more than one certificate row, so the index builds.
--
-- WHAT: the second insert now fails instead. Its whole statement rolls back,
-- the number it drew included, so the line stays gap-free. A voided
-- certificate (deleted sample) does not count.
--
-- Run alone in the Supabase SQL editor after parts 1-5. Safe to re-run.

SET LOCAL lock_timeout = '5s';
CREATE UNIQUE INDEX IF NOT EXISTS certificates_one_per_sample
  ON certificates (sample_id)
  WHERE voided_at IS NULL;
