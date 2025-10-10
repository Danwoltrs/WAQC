-- Migration: Add entrance position to laboratories table
-- This allows lab directors to mark the entrance door on the 2D floor plan

ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS entrance_x_position INTEGER DEFAULT 0;

ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS entrance_y_position INTEGER DEFAULT 0;

COMMENT ON COLUMN laboratories.entrance_x_position IS 'X coordinate for entrance door on 2D floor plan (in meters)';
COMMENT ON COLUMN laboratories.entrance_y_position IS 'Y coordinate for entrance door on 2D floor plan (in meters)';

SELECT 'Entrance position columns added successfully' as status;
