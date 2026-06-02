-- CVA cupping: add 'cva' to the session_type enum.
-- Separate file: ALTER TYPE ADD VALUE must commit before the value is used elsewhere.
ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';
