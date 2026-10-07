-- Read-only. Run first and paste the result back: the schema migration assumes
-- what this lists. One result set, because the SQL editor shows only the last.
SELECT 'column' AS kind, table_name || '.' || column_name AS name,
       data_type || CASE WHEN is_nullable = 'NO' THEN ' not null' ELSE '' END AS detail
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('lab_shelves', 'storage_positions', 'storage_history', 'laboratories', 'samples')
  AND (table_name <> 'samples' OR column_name LIKE 'storage%')
  AND (table_name <> 'laboratories' OR column_name IN ('entrance_x_position', 'entrance_y_position', 'storage_capacity', 'floor_plan'))
UNION ALL
SELECT 'constraint', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.lab_shelves'::regclass, 'public.storage_positions'::regclass, 'public.storage_history'::regclass)
UNION ALL
SELECT 'policy', tablename || '.' || policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('lab_shelves', 'storage_positions', 'storage_history')
UNION ALL
SELECT 'function', proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('generate_position_code', 'generate_storage_positions_for_shelf', 'get_shelf_utilization',
                  'get_client_samples_in_storage', 'storage_lab_occupancy', 'save_lab_floor_plan')
UNION ALL
SELECT 'view', viewname, '' FROM pg_views WHERE schemaname = 'public' AND viewname = 'client_visible_shelves'
UNION ALL
SELECT 'clients table', COALESCE(to_regclass('public.clients')::text, 'absent'), ''
UNION ALL
SELECT 'samples trigger', tgname, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid = 'public.samples'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'lab', l.name,
       (SELECT count(*) FROM public.lab_shelves s WHERE s.laboratory_id = l.id)::text || ' shelves, '
       || (SELECT count(*) FROM public.storage_positions p WHERE p.laboratory_id = l.id)::text || ' cubbies, '
       || (SELECT count(*) FROM public.samples x WHERE x.laboratory_id = l.id AND x.storage_position IS NOT NULL AND x.deleted_at IS NULL)::text
       || ' samples with a typed position'
FROM public.laboratories l
UNION ALL
SELECT 'shelf', s.laboratory_id::text || ' ' || s.shelf_letter,
       s.rows::text || ' x ' || s.columns::text || ' x ' || s.samples_per_position::text
FROM public.lab_shelves s
ORDER BY 1, 2;
