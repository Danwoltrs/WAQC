-- Migration 109: Fix Brazil country code from B to BR
-- Date: 2025-11-25
-- Purpose: Brazil was incorrectly set to single-letter code 'B', should be 'BR'

UPDATE country_codes
SET country_code = 'BR'
WHERE country_name = 'Brazil'
  AND country_code = 'B';

-- Verify the change
SELECT
    'Migration 109 completed - Brazil country code updated to BR' as status,
    country_name,
    country_code
FROM country_codes
WHERE country_name = 'Brazil';
