-- Link the SS duplicates that lost their source's contract links.
--
-- POST /api/samples/[id]/duplicate copied wolthers_contract_nr but never
-- contract_id or linked_pss_sample_id. Every SS copy therefore came out
-- unlinked while its source kept its PSS link. The 2026-09-14 backfill that
-- derived wolthers_contract_nr from the linked PSS reached only the sources,
-- so the sys mirror trigger (samples_mirror_to_shipment_samples, sys mig 0749)
-- put only the sources on their contracts — and only their certificates were
-- filed there (SAK-011877/26 on 41923/26, but not SAK-011878/26 or 011879/26).
--
-- This copies each source's PSS link, contract FK and W&A contract number onto
-- its copies, only where the copy's own value is empty. The 21 pairs were
-- found on 2026-09-15: same lab, client, buyer reference and exporter sample
-- number, created 11–81 s after a linked source by the duplicate route.
--
-- Side effect, intended: setting wolthers_contract_nr fires the sys mirror for
-- the copies of SAN-00907/26 (41868/26), SAN-00910/26 (41869/26) and
-- SAN-00921/26 (41923/26) — each resolves to exactly one live contract with no
-- open SS placeholder, so each copy gets its own shipment_samples row, as its
-- source did. A certificate is filed on the contract only when the copy is
-- sent to the buyer from /certificates.
--
-- Safe to re-run: a copy that already has any link is left untouched.

UPDATE public.samples AS dup
   SET linked_pss_sample_id = src.linked_pss_sample_id,
       contract_id          = src.contract_id,
       wolthers_contract_nr = src.wolthers_contract_nr
  FROM (VALUES
         ('SAN-00355/26', 'SAN-00354/26'),
         ('SAN-00356/26', 'SAN-00354/26'),
         ('SAN-00357/26', 'SAN-00354/26'),
         ('SAN-00903/26', 'SAN-00902/26'),
         ('SAN-00904/26', 'SAN-00902/26'),
         ('SAN-00905/26', 'SAN-00902/26'),
         ('SAN-00906/26', 'SAN-00902/26'),
         ('SAN-00908/26', 'SAN-00907/26'),
         ('SAN-00909/26', 'SAN-00907/26'),
         ('SAN-00911/26', 'SAN-00910/26'),
         ('SAN-00912/26', 'SAN-00910/26'),
         ('SAN-00919/26', 'SAN-00918/26'),
         ('SAN-00920/26', 'SAN-00918/26'),
         ('SAN-00922/26', 'SAN-00921/26'),
         ('SAN-00923/26', 'SAN-00921/26'),
         ('SAN-00925/26', 'SAN-00924/26'),
         ('SAN-00926/26', 'SAN-00924/26'),
         ('SAN-00930/26', 'SAN-00929/26'),
         ('SAN-00931/26', 'SAN-00929/26'),
         ('SAN-00933/26', 'SAN-00932/26'),
         ('SAN-00934/26', 'SAN-00932/26')
       ) AS m(copy_ref, source_ref)
  JOIN public.samples AS src
    ON src.tracking_number = m.source_ref
   AND src.deleted_at IS NULL
 WHERE dup.tracking_number = m.copy_ref
   AND dup.deleted_at IS NULL
   AND dup.sample_type = 'ss'
   AND dup.laboratory_id = src.laboratory_id
   AND dup.client_id = src.client_id
   AND dup.linked_pss_sample_id IS NULL
   AND dup.contract_id IS NULL
   AND dup.wolthers_contract_nr IS NULL;

-- Verification: expect 21 rows, pss_linked = true on every row, and a sys_row
-- status on the six copies that carry a contract number (SAN-00908, 909, 911,
-- 912, 922, 923).
SELECT dup.tracking_number                                           AS copy,
       src.tracking_number                                           AS source,
       dup.linked_pss_sample_id IS NOT DISTINCT FROM src.linked_pss_sample_id AS pss_linked,
       dup.wolthers_contract_nr,
       ss.status                                                     AS sys_row
  FROM (VALUES
         ('SAN-00355/26', 'SAN-00354/26'), ('SAN-00356/26', 'SAN-00354/26'), ('SAN-00357/26', 'SAN-00354/26'),
         ('SAN-00903/26', 'SAN-00902/26'), ('SAN-00904/26', 'SAN-00902/26'), ('SAN-00905/26', 'SAN-00902/26'),
         ('SAN-00906/26', 'SAN-00902/26'), ('SAN-00908/26', 'SAN-00907/26'), ('SAN-00909/26', 'SAN-00907/26'),
         ('SAN-00911/26', 'SAN-00910/26'), ('SAN-00912/26', 'SAN-00910/26'), ('SAN-00919/26', 'SAN-00918/26'),
         ('SAN-00920/26', 'SAN-00918/26'), ('SAN-00922/26', 'SAN-00921/26'), ('SAN-00923/26', 'SAN-00921/26'),
         ('SAN-00925/26', 'SAN-00924/26'), ('SAN-00926/26', 'SAN-00924/26'), ('SAN-00930/26', 'SAN-00929/26'),
         ('SAN-00931/26', 'SAN-00929/26'), ('SAN-00933/26', 'SAN-00932/26'), ('SAN-00934/26', 'SAN-00932/26')
       ) AS m(copy_ref, source_ref)
  JOIN public.samples AS dup ON dup.tracking_number = m.copy_ref AND dup.deleted_at IS NULL
  JOIN public.samples AS src ON src.tracking_number = m.source_ref AND src.deleted_at IS NULL
  LEFT JOIN public.contracts AS c
         ON c.contract_number = dup.wolthers_contract_nr
        AND coalesce(c.status, '') NOT IN ('cancelled', 'washed_out')
  LEFT JOIN public.shipment_samples AS ss
         ON ss.contract_id = c.id AND ss.waqc_ref = dup.tracking_number
 ORDER BY dup.tracking_number;
