-- Certificate send history is now read by the certificate's own sample
-- (metadata->>'sample_id') instead of through its sys contract, so lots with no
-- Wolthers contract (every Dunkin lot, SS lots registered without one) show as
-- sent and drop out of "Send unsent". /certificates and the send queue run that
-- lookup on every load; index it rather than scan email_messages each time.
--
-- Optional: the code works without it (143 ms over 21k rows on 2026-09-14).
CREATE INDEX IF NOT EXISTS email_messages_metadata_sample_id_idx
  ON public.email_messages ((metadata->>'sample_id'))
  WHERE metadata->>'sample_id' IS NOT NULL;
