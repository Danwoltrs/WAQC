-- check_certificate_numbering_state.sql — read-only. Run it alone in the Supabase SQL editor.
-- Which parts of the certificate-number recycling are live, and can certificates still be issued.
-- Works whatever state the migration runs left behind: it reads the catalog, and
-- reads the new table/columns only when they exist.

WITH fn AS (
  SELECT p.proname, p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('generate_certificate_number', 'assign_certificate_number', 'mint_certificate_number',
                      'void_certificate', 'void_certificates_of_deleted_sample', 'certificate_number_sequence',
                      'certificate_reached_client', 'close_certificate_number_gap', 'renumber_unsent_certificate_tail')
),
has_void_cols AS (
  SELECT count(*) = 2 AS yes FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name IN ('voided_at', 'voided_number')
)
SELECT 1 AS n, 'generate_certificate_number' AS item,
       COALESCE((SELECT string_agg(signature, ' | ') FROM fn WHERE proname = 'generate_certificate_number'),
                'MISSING: certificates cannot be issued') AS result
UNION ALL
SELECT 2, 'editor residue (ENABLE ROW LEVEL SECURITY) inside a function',
       COALESCE((SELECT string_agg(proname, ', ') FROM fn WHERE def ILIKE '%ENABLE ROW LEVEL SECURITY%'), 'none')
UNION ALL
SELECT 3, 'assign_certificate_number mints through',
       (SELECT CASE WHEN def LIKE '%mint_certificate_number%' THEN 'mint_certificate_number (recycling)'
                    ELSE 'generate_certificate_number (original)' END
        || CASE WHEN def ILIKE '%SECURITY DEFINER%' THEN ', security definer' ELSE '' END
        || CASE WHEN def LIKE '%deleted_at IS NOT NULL%' THEN ', skips deleted samples' ELSE '' END
        FROM fn WHERE proname = 'assign_certificate_number')
UNION ALL
SELECT 4, 'other numbering functions',
       COALESCE((SELECT string_agg(signature, ', ' ORDER BY signature) FROM fn
                 WHERE proname NOT IN ('generate_certificate_number', 'assign_certificate_number')), 'none')
UNION ALL
SELECT 5, 'API roles that can call void/mint/generate',
       COALESCE((SELECT string_agg(DISTINCT fn.proname || ':' || r.rolname, ', ')
                 FROM fn JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated')
                 WHERE fn.proname IN ('void_certificate', 'mint_certificate_number', 'generate_certificate_number')
                   AND has_function_privilege(r.oid, fn.signature, 'EXECUTE')), 'none')
UNION ALL
SELECT 6, 'triggers',
       COALESCE((SELECT string_agg(tgname || ' on ' || tgrelid::regclass::text
                                   || CASE WHEN tgenabled = 'D' THEN ' (DISABLED)' ELSE '' END, ', ' ORDER BY tgname)
                 FROM pg_trigger
                 WHERE NOT tgisinternal
                   AND tgname IN ('trg_assign_certificate_number', 'trg_void_certificates_of_deleted_sample',
                                  'trigger_auto_generate_certificate')), 'none')
UNION ALL
SELECT 7, 'certificates.voided_at / voided_number',
       CASE WHEN (SELECT yes FROM has_void_cols) THEN 'present' ELSE 'absent' END
UNION ALL
SELECT 8, 'certificate_number_pool',
       CASE WHEN to_regclass('public.certificate_number_pool') IS NULL THEN 'absent'
            ELSE (xpath('/row/v/text()', query_to_xml(
                   'SELECT count(*) || '' released: '' || COALESCE(string_agg(sequence::text, '', '' ORDER BY sequence), ''-'') AS v
                    FROM certificate_number_pool', false, true, '')))[1]::text END
UNION ALL
SELECT 9, 'voided certificates',
       CASE WHEN NOT (SELECT yes FROM has_void_cols) THEN 'n/a'
            ELSE (xpath('/row/v/text()', query_to_xml(
                   'SELECT count(*)::text AS v FROM certificates WHERE voided_at IS NOT NULL', false, true, '')))[1]::text END
UNION ALL
SELECT 10, 'deleted samples that hold a certificate',
       (SELECT count(*)::text FROM certificates c JOIN samples s ON s.id = c.sample_id WHERE s.deleted_at IS NOT NULL)
UNION ALL
SELECT 11, 'samples with more than one certificate row',
       (SELECT count(*)::text FROM (SELECT sample_id FROM certificates GROUP BY sample_id HAVING count(*) > 1) d)
ORDER BY 1;
