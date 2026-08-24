-- Migration 20260824000001: QC fee → co-broker offset routing
--
-- WHY: some QC clients are never invoiced for quality control. Rich Coop is the
-- first: its fees are absorbed by co-broker Cada Uno (Yong Ma) and deducted from
-- what Wolthers owes that co-broker, rather than billed to Rich Coop.
--
-- WHAT: one nullable FK naming the absorbing co-broker. NULL keeps today's
-- behaviour (bill the client normally).
--
-- WHY NOT fee_payer: that enum holds ROLES (exporter/importer/roaster/
-- final_buyer/client_pays). A co-broker is a specific company, not a role.
-- Adding an enum value would also need ALTER TYPE ... ADD VALUE, which cannot be
-- used in the same transaction that adds it, and WAQC's billing views read it.

BEGIN;

ALTER TABLE public.qc_client_settings
  ADD COLUMN IF NOT EXISTS qc_fee_co_broker_company_id UUID
    REFERENCES public.companies(id);

COMMENT ON COLUMN public.qc_client_settings.qc_fee_co_broker_company_id IS
  'When set, this client is never invoiced for QC. Its billable sample fees post '
  'as negative qc_offset accruals against this co-broker company instead. '
  'NULL = bill the client normally.';

CREATE INDEX IF NOT EXISTS idx_qc_client_settings_offset_co_broker
  ON public.qc_client_settings(qc_fee_co_broker_company_id)
  WHERE qc_fee_co_broker_company_id IS NOT NULL;

COMMIT;
