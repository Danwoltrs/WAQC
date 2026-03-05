-- Data migration: strip Clean Cup and Uniform Cup numeric entries from cupping_scores.scores JSONB
-- These are boolean fields stored in quality_assessments (clean_cup, uniform_cup),
-- NOT scored cupping attributes. Some sessions/templates accidentally included them
-- as numeric attributes (e.g. "Clean Cup": 10). This migration removes those keys
-- from the scores JSONB so they never render as scored rows on certificates.

-- Remove all known key variants of Clean Cup from cupping_scores.scores
UPDATE cupping_scores
SET scores = scores - 'Clean Cup' - 'clean cup' - 'CleanCup' - 'cleancup' - 'clean_cup' - 'Clean_Cup'
WHERE scores ?| ARRAY['Clean Cup', 'clean cup', 'CleanCup', 'cleancup', 'clean_cup', 'Clean_Cup'];

-- Remove all known key variants of Uniform Cup / Uniformity from cupping_scores.scores
UPDATE cupping_scores
SET scores = scores - 'Uniform Cup' - 'uniform cup' - 'UniformCup' - 'uniformcup' - 'uniform_cup' - 'Uniform_Cup' - 'Uniformity' - 'uniformity'
WHERE scores ?| ARRAY['Uniform Cup', 'uniform cup', 'UniformCup', 'uniformcup', 'uniform_cup', 'Uniform_Cup', 'Uniformity', 'uniformity'];
