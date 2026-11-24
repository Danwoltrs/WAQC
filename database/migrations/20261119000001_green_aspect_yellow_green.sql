-- 20261119000001_green_aspect_yellow_green.sql
--
-- Green and roast aspect are now picked from a list in the certificate editor
-- (they were free text there). Every value saved so far is already on the list,
-- except one lot saved as 'Yellow Green' from the grading page's old fixed list
-- for type samples; the list spells it 'Yellow-Green'. This renames that one
-- value. Nothing else is touched and no value is lost.
--
-- Checked on the live database 2026-11-19: 1 row (a rejected type sample).

UPDATE quality_assessments
SET green_bean_data = jsonb_set(green_bean_data, '{green_aspect}', '"Yellow-Green"')
WHERE green_bean_data->>'green_aspect' = 'Yellow Green';
