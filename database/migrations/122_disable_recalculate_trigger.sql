-- Migration 122: Disable the recalculate trigger temporarily
-- This is likely the real cause of the error
-- Date: 2025-11-26

-- Disable the recalculate trigger
ALTER TABLE clients DISABLE TRIGGER trigger_recalculate_on_client_pricing_change;

SELECT 'Migration 122: Recalculate trigger disabled - client updates should now work' as status;
