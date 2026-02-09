-- Migration: Add end_client_id, end_client_contract_nr, supplier_contract_nr, and supplier columns
-- Purpose: Complete the supply chain data model so every entity has proper storage

-- 1. end_client_id: FK to clients table. NULL means the QC client IS the end client.
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS end_client_id UUID REFERENCES public.clients(id);

-- 2. end_client_contract_nr: contract reference for the end client
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS end_client_contract_nr TEXT;

-- 3. supplier_contract_nr: contract reference for the supplier (farm/cooperative)
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS supplier_contract_nr TEXT;

-- 4. supplier: free-text supplier name (farm/cooperative, no FK table yet)
-- Check if column already exists (some forms already collect this)
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS supplier TEXT;

-- Index for end_client_id joins
CREATE INDEX IF NOT EXISTS idx_samples_end_client_id ON public.samples(end_client_id);

-- Rename the auto-generated FK constraint to a predictable name for Supabase explicit joins
-- The default name is samples_end_client_id_fkey which is what we want, so this is a no-op
-- If it was named differently, we'd rename it here:
-- ALTER TABLE public.samples RENAME CONSTRAINT <auto_name> TO samples_end_client_id_fkey;
