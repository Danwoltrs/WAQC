-- Migration 117: Temporarily disable the sync trigger
-- This allows client updates to work while we investigate the issue
-- Date: 2025-11-26

-- Disable the trigger (but keep it for later re-enabling)
ALTER TABLE clients DISABLE TRIGGER trigger_sync_client_to_supply_chain;

SELECT 'Migration 117: Trigger temporarily disabled - client updates should now work' as status;

-- To re-enable later, run:
-- ALTER TABLE clients ENABLE TRIGGER trigger_sync_client_to_supply_chain;
