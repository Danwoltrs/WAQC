-- check_ss_pss_contract_links.sql — REVIEW ONLY, changes nothing.
--
-- Background (2026-09-21): sys keeps a split contract family under ONE shared
-- contracts.contract_number that differs only by split_suffix (42089/26A, /26B,
-- /26C), while WAQC prints and stores the number WITH the letter. A bare-string
-- "does the FK agree with the number" check read a correctly linked
-- sub-contract as a mislink, so SS intake silently dropped the PSS's own
-- contract link, and the relink UI showed the whole family as identical
-- "#42089/26" rows, mother first. Fixed in the app; this file lists what the
-- data already holds so it can be repaired by hand.
--
-- Run each block on its own in the Supabase SQL editor. Nothing is updated.

-- ---------------------------------------------------------------------------
-- A. SS rows filed on a different contract than the PSS they ship against
--    (task 4). Expected rule: ss.contract_id = pss.contract_id, always.
-- ---------------------------------------------------------------------------
SELECT
  ss.tracking_number                                        AS ss_number,
  ss.created_at::date                                       AS ss_registered,
  ss.wolthers_contract_nr                                   AS ss_stored_nr,
  sc.contract_number || coalesce(sc.split_suffix, '')       AS ss_contract,
  pss.tracking_number                                       AS pss_number,
  pss.wolthers_contract_nr                                  AS pss_stored_nr,
  pc.contract_number || coalesce(pc.split_suffix, '')       AS pss_contract,
  CASE
    WHEN ss.contract_id IS NULL                                     THEN 'SS has no contract (link was dropped)'
    WHEN pss.contract_id IS NULL                                    THEN 'PSS has no contract'
    WHEN sc.id = pc.parent_contract_id                              THEN 'SS on the MOTHER of the PSS contract'
    WHEN sc.parent_contract_id IS NOT NULL
     AND sc.parent_contract_id = pc.parent_contract_id              THEN 'SS on a SIBLING of the PSS contract'
    WHEN pc.id = sc.parent_contract_id                              THEN 'PSS on the mother of the SS contract'
    ELSE 'unrelated contracts'
  END                                                       AS relation,
  ss.id                                                     AS ss_id,
  ss.contract_id                                            AS ss_contract_id,
  pss.id                                                    AS pss_id,
  pss.contract_id                                           AS pss_contract_id
FROM public.samples ss
JOIN public.samples pss ON pss.id = ss.linked_pss_sample_id
LEFT JOIN public.contracts sc ON sc.id = ss.contract_id
LEFT JOIN public.contracts pc ON pc.id = pss.contract_id
WHERE ss.deleted_at IS NULL
  AND ss.contract_id IS DISTINCT FROM pss.contract_id
ORDER BY ss.created_at DESC;

-- ---------------------------------------------------------------------------
-- B. PSS rows linked to a contract that HAS sub-contracts — the family mother
--    (task 3). Each is a candidate mislink: the PSS may belong to a child.
--    Not necessarily wrong (a PSS registered before the split legitimately
--    points at the mother, which sys keeps as leg A), hence review only.
-- ---------------------------------------------------------------------------
SELECT
  pss.tracking_number                                       AS pss_number,
  pss.created_at::date                                      AS pss_registered,
  pss.wolthers_contract_nr                                  AS pss_stored_nr,
  c.contract_number || coalesce(c.split_suffix, '')         AS linked_contract,
  (SELECT string_agg(k.contract_number || coalesce(k.split_suffix, ''), ', ' ORDER BY k.split_suffix, k.contract_number)
     FROM public.contracts k
    WHERE k.parent_contract_id = c.id
      AND coalesce(k.status, '') NOT IN ('cancelled', 'washed_out'))    AS sub_contracts,
  (SELECT count(*) FROM public.samples s2
    WHERE s2.linked_pss_sample_id = pss.id AND s2.deleted_at IS NULL)  AS ss_linked_to_it,
  pss.id                                                    AS pss_id,
  c.id                                                      AS contract_id
FROM public.samples pss
JOIN public.contracts c ON c.id = pss.contract_id
WHERE pss.deleted_at IS NULL
  AND pss.sample_type = 'pss'
  AND EXISTS (SELECT 1 FROM public.contracts k WHERE k.parent_contract_id = c.id)
ORDER BY pss.created_at DESC;

-- ---------------------------------------------------------------------------
-- C. Provable mislinks: the stored number names NEITHER the linked contract's
--    bare number NOR its printed number (another member's letter, or another
--    contract altogether). Covers PSS and SS alike.
-- ---------------------------------------------------------------------------
SELECT
  s.tracking_number                                         AS sample_number,
  s.sample_type,
  s.created_at::date                                        AS registered,
  s.wolthers_contract_nr                                    AS stored_nr,
  c.contract_number || coalesce(c.split_suffix, '')         AS linked_contract,
  m.id                                                      AS contract_named_by_stored_nr,
  s.id                                                      AS sample_id,
  s.contract_id
FROM public.samples s
JOIN public.contracts c ON c.id = s.contract_id
LEFT JOIN public.contracts m
       ON upper(m.contract_number || coalesce(m.split_suffix, '')) = upper(btrim(s.wolthers_contract_nr))
      AND coalesce(m.status, '') NOT IN ('cancelled', 'washed_out')
WHERE s.deleted_at IS NULL
  AND s.wolthers_contract_nr IS NOT NULL
  AND upper(btrim(s.wolthers_contract_nr)) NOT IN (
        upper(c.contract_number),
        upper(c.contract_number || coalesce(c.split_suffix, '')))
ORDER BY s.created_at DESC;
