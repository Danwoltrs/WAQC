-- Add micro-origin configuration to laboratories
-- This allows labs to specify which micro-origins they can handle per origin

ALTER TABLE laboratories
    ADD COLUMN IF NOT EXISTS micro_origin_config JSONB DEFAULT '[]'::jsonb;

-- Add index for micro-origin queries
CREATE INDEX IF NOT EXISTS idx_laboratories_micro_origin_config ON laboratories USING GIN(micro_origin_config);

-- Comments
COMMENT ON COLUMN laboratories.micro_origin_config IS 'Array of micro-origin configurations with requirements and percentages: [{origin: "Brazil", micro_regions: [{id: "uuid", name: "Cerrado", is_required: true, percentage: 50}]}]';

-- Example structure:
-- [
--   {
--     "origin": "Brazil",
--     "micro_regions": [
--       {
--         "id": "micro-region-uuid",
--         "name": "Cerrado",
--         "is_required": false,
--         "percentage": 50
--       },
--       {
--         "id": "micro-region-uuid-2",
--         "name": "Sul de Minas",
--         "is_required": true,
--         "percentage": 50
--       }
--     ]
--   },
--   {
--     "origin": "Colombia",
--     "micro_regions": [
--       {
--         "id": "micro-region-uuid-3",
--         "name": "Huila",
--         "is_required": false,
--         "percentage": null
--       }
--     ]
--   }
-- ]
