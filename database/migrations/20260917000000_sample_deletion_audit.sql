-- 20260917000000_sample_deletion_audit.sql
--
-- Sample deletion audit trail. Deletion is already soft (058: deleted_at,
-- deleted_by). This adds who registered a sample, why it was deleted, and an
-- append-only per-sample event log — certificate issued / downloaded / sent,
-- sample deleted — so a deletion that follows a certificate is traceable and
-- the per-lab activity report can say whether a certificate existed before a
-- sample was deleted.
--
-- Safe to re-run. Every statement is idempotent and none relies on a
-- transaction (the Supabase SQL runner executes statements in autocommit).

-- ---------------------------------------------------------------------------
-- 1. samples.created_by / samples.deleted_reason
-- ---------------------------------------------------------------------------
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

COMMENT ON COLUMN public.samples.created_by IS
  'The user who registered the sample (intake, duplicate or contract sibling). Backfilled from activity_feed registrations where one existed.';
COMMENT ON COLUMN public.samples.deleted_reason IS
  'Optional free-text reason given at deletion. deleted_at / deleted_by say when and by whom.';

CREATE INDEX IF NOT EXISTS idx_samples_created_by
  ON public.samples (created_by) WHERE created_by IS NOT NULL;

-- POST /api/samples has logged a 'registered' activity with the actor since
-- the feed existed; that actor is the creator.
UPDATE public.samples s
   SET created_by = af.actor_id
  FROM public.activity_feed af
 WHERE af.entity_type = 'sample'
   AND af.action = 'registered'
   AND af.entity_id = s.id
   AND af.actor_id IS NOT NULL
   AND s.created_by IS NULL;

-- A contract sibling was registered together with its lab unit.
UPDATE public.samples s
   SET created_by = lab.created_by
  FROM public.samples lab
 WHERE s.lab_source_sample_id = lab.id
   AND s.created_by IS NULL
   AND lab.created_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. sample_events — append-only audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sample_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  certificate_id uuid REFERENCES public.certificates(id) ON DELETE SET NULL,
  -- 'certificate_issued' | 'certificate_downloaded' | 'certificate_sent' | 'sample_deleted'
  event_type text NOT NULL,
  -- NULL for an unauthenticated actor (the public QR download).
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sample_events IS
  'Append-only audit of what happened to a sample: certificate issued / downloaded / sent, sample deleted. Written by the app; never updated.';

CREATE INDEX IF NOT EXISTS idx_sample_events_sample
  ON public.sample_events (sample_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sample_events_type
  ON public.sample_events (event_type, occurred_at DESC);

ALTER TABLE public.sample_events ENABLE ROW LEVEL SECURITY;

-- Staff read the log; a signed-in user may append events about their own
-- actions; nothing is ever updated or deleted through RLS (no policy for
-- either). The service role writes the rest (public downloads, backfills).
DROP POLICY IF EXISTS sample_events_staff_select ON public.sample_events;
CREATE POLICY sample_events_staff_select ON public.sample_events
  FOR SELECT TO authenticated
  USING (public.is_waqc_staff(auth.uid()));

DROP POLICY IF EXISTS sample_events_actor_insert ON public.sample_events;
CREATE POLICY sample_events_actor_insert ON public.sample_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

GRANT SELECT, INSERT ON public.sample_events TO authenticated;
GRANT ALL ON public.sample_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Backfill history so the timeline starts today, not empty
-- ---------------------------------------------------------------------------

-- Every certificate ever minted counts as issued at its issue time.
INSERT INTO public.sample_events (sample_id, certificate_id, event_type, actor_user_id, occurred_at, metadata)
SELECT c.sample_id,
       c.id,
       'certificate_issued',
       u.id,
       COALESCE(c.issued_at, c.created_at, now()),
       jsonb_build_object(
         'certificate_number', c.certificate_number,
         'is_rejected', COALESCE(c.is_rejected, false),
         'backfilled', true
       )
  FROM public.certificates c
  LEFT JOIN auth.users u ON u.id = c.issued_by
 WHERE c.sample_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sample_events e
      WHERE e.certificate_id = c.id AND e.event_type = 'certificate_issued'
   );

-- Every sample already soft-deleted.
INSERT INTO public.sample_events (sample_id, certificate_id, event_type, actor_user_id, occurred_at, metadata)
SELECT s.id,
       NULL,
       'sample_deleted',
       u.id,
       s.deleted_at,
       jsonb_build_object('tracking_number', s.tracking_number, 'backfilled', true)
  FROM public.samples s
  LEFT JOIN auth.users u ON u.id = s.deleted_by
 WHERE s.deleted_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sample_events e
      WHERE e.sample_id = s.id AND e.event_type = 'sample_deleted'
   );

-- Every certificate email the app logged (metadata->>'sample_id', sources
-- 'sample_approval' / 'batch_approval'). MATERIALIZED keeps the uuid cast
-- behind the shape check.
WITH sends AS MATERIALIZED (
  SELECT m.id,
         m.sent_by,
         COALESCE(m.sent_at, m.created_at) AS sent_at,
         m.metadata
    FROM public.email_messages m
   WHERE m.metadata->>'source' IN ('sample_approval', 'batch_approval')
     AND m.metadata->>'sample_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
INSERT INTO public.sample_events (sample_id, certificate_id, event_type, actor_user_id, occurred_at, metadata)
SELECT s.id,
       NULL,
       'certificate_sent',
       u.id,
       COALESCE(sends.sent_at, now()),
       jsonb_build_object(
         'source', sends.metadata->>'source',
         'side', sends.metadata->>'side',
         'decision', sends.metadata->>'decision',
         'email_message_id', sends.id,
         'backfilled', true
       )
  FROM sends
  JOIN public.samples s ON s.id = (sends.metadata->>'sample_id')::uuid
  LEFT JOIN auth.users u ON u.id = sends.sent_by
 WHERE NOT EXISTS (
   SELECT 1 FROM public.sample_events e
    WHERE e.event_type = 'certificate_sent'
      AND e.metadata->>'email_message_id' = sends.id::text
 );
