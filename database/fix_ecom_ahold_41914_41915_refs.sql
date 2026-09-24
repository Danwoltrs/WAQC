-- fix_ecom_ahold_41914_41915_refs.sql — one-off data fix, NOT a migration.
--
-- Ecom → Ahold, contracts 41914/26 and 41915/26. Confirmed by Anderson
-- (2026-09-24): the Wolthers contract and the Ahold ref on each SS are right;
-- the Ecom ref and the linked PSS were taken from the other contract (the PSS
-- lab unit's contract #1 showed through — fixed in code the same day).
--
--   ICO 002/1848/2422  SAN-00941/26, SAN-00942/26            → 41915/26
--       Ecom 4155261414, PSS SAN-00719/26
--   ICO 002/1848/2581  SAN-00943/26, SAN-00944/26, SAN-00945/26 → 41914/26
--       Ecom 4155261413, PSS SAN-00600/26
--
-- 1. Preview (changes nothing): run the SELECT. Every row must show the
--    expected contract in wolthers_contract_nr, and each target PSS must be
--    found on that same contract, before running step 2.

WITH target(tracking_number, contract_nr, ecom_ref, pss_tracking) AS (VALUES
  ('SAN-00941/26', '41915/26', '4155261414', 'SAN-00719/26'),
  ('SAN-00942/26', '41915/26', '4155261414', 'SAN-00719/26'),
  ('SAN-00943/26', '41914/26', '4155261413', 'SAN-00600/26'),
  ('SAN-00944/26', '41914/26', '4155261413', 'SAN-00600/26'),
  ('SAN-00945/26', '41914/26', '4155261413', 'SAN-00600/26')
)
SELECT t.tracking_number, s.container_nr, s.ico_number,
       s.wolthers_contract_nr, t.contract_nr AS expected_contract,
       s.buyer_contract_nr AS ahold_ref,
       s.seller_contract_nr AS ecom_ref_now, t.ecom_ref AS ecom_ref_new,
       cur_pss.tracking_number AS pss_now,
       new_pss.tracking_number AS pss_new, new_pss.wolthers_contract_nr AS pss_new_contract
FROM target t
LEFT JOIN samples s       ON s.tracking_number = t.tracking_number AND s.deleted_at IS NULL
LEFT JOIN samples cur_pss ON cur_pss.id = s.linked_pss_sample_id
LEFT JOIN samples new_pss ON new_pss.tracking_number = t.pss_tracking AND new_pss.deleted_at IS NULL
ORDER BY 1;

-- 2. Apply. Only touches a row whose contract is the expected one, and links
--    a PSS only when that PSS is on the same contract. Should report 5 rows.
--
-- WITH target(tracking_number, contract_nr, ecom_ref, pss_tracking) AS (VALUES
--   ('SAN-00941/26', '41915/26', '4155261414', 'SAN-00719/26'),
--   ('SAN-00942/26', '41915/26', '4155261414', 'SAN-00719/26'),
--   ('SAN-00943/26', '41914/26', '4155261413', 'SAN-00600/26'),
--   ('SAN-00944/26', '41914/26', '4155261413', 'SAN-00600/26'),
--   ('SAN-00945/26', '41914/26', '4155261413', 'SAN-00600/26')
-- )
-- UPDATE samples s
-- SET seller_contract_nr   = t.ecom_ref,
--     linked_pss_sample_id = p.id,
--     updated_at           = now()
-- FROM target t
-- JOIN samples p ON p.tracking_number = t.pss_tracking AND p.deleted_at IS NULL
-- WHERE s.tracking_number = t.tracking_number
--   AND s.deleted_at IS NULL
--   AND s.wolthers_contract_nr = t.contract_nr
--   AND p.wolthers_contract_nr = t.contract_nr
-- RETURNING s.tracking_number, s.wolthers_contract_nr, s.seller_contract_nr;
--
-- The certificates regenerate on the next view (pdf_url is never cached).
