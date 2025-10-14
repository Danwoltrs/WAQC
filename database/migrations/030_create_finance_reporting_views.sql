-- Migration 030: Create Finance Reporting Views
-- Date: 2025-10-14
-- Purpose: Create reporting views for client billing and lab payment summaries

-- Client billing summary view
CREATE OR REPLACE VIEW client_billing_summary AS
SELECT
    c.id,
    c.name,
    c.company,
    c.is_qc_client,
    c.pricing_model,
    c.price_per_sample,
    c.price_per_pound_cents,
    c.billing_basis,
    c.has_origin_pricing,
    COUNT(s.id) AS total_samples,
    COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_samples,
    COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) AS rejected_samples,
    COUNT(CASE WHEN s.status = 'received' THEN 1 END) AS received_samples,
    COUNT(CASE WHEN s.status = 'in_progress' THEN 1 END) AS in_progress_samples,
    SUM(CASE
        WHEN c.billing_basis = 'approved_only' AND s.status = 'approved' THEN s.calculated_client_fee
        WHEN c.billing_basis = 'approved_and_rejected' AND s.status IN ('approved', 'rejected') THEN s.calculated_client_fee
        ELSE 0
    END) AS total_billable_amount,
    SUM(s.calculated_client_fee) AS total_potential_amount,
    c.currency,
    MAX(s.created_at) AS last_sample_date
FROM clients c
LEFT JOIN samples s ON s.client_id = c.id
WHERE c.is_qc_client = true
GROUP BY c.id, c.name, c.company, c.is_qc_client, c.pricing_model,
         c.price_per_sample, c.price_per_pound_cents, c.billing_basis,
         c.has_origin_pricing, c.currency;

-- Client origin pricing summary view
CREATE OR REPLACE VIEW client_origin_pricing_summary AS
SELECT
    c.id AS client_id,
    c.name AS client_name,
    c.company,
    cop.origin,
    cop.pricing_model,
    cop.price_per_sample,
    cop.price_per_pound_cents,
    cop.currency,
    cop.is_active,
    COUNT(s.id) AS samples_count,
    COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_count,
    COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) AS rejected_count,
    SUM(CASE
        WHEN c.billing_basis = 'approved_only' AND s.status = 'approved' THEN s.calculated_client_fee
        WHEN c.billing_basis = 'approved_and_rejected' AND s.status IN ('approved', 'rejected') THEN s.calculated_client_fee
        ELSE 0
    END) AS billable_amount
FROM clients c
INNER JOIN client_origin_pricing cop ON cop.client_id = c.id
LEFT JOIN samples s ON s.client_id = c.id AND s.origin = cop.origin
GROUP BY c.id, c.name, c.company, cop.origin, cop.pricing_model,
         cop.price_per_sample, cop.price_per_pound_cents, cop.currency, cop.is_active;

-- 3rd party lab payment summary view
CREATE OR REPLACE VIEW lab_payment_summary AS
SELECT
    l.id AS laboratory_id,
    l.name,
    l.location,
    l.type,
    l.is_active,
    ltpc.fee_per_sample,
    ltpc.payment_schedule,
    ltpc.billing_basis,
    ltpc.currency,
    ltpc.contact_name,
    ltpc.contact_email,
    COUNT(s.id) AS total_samples,
    COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_samples,
    COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) AS rejected_samples,
    COUNT(CASE WHEN s.status IN ('received', 'in_progress', 'under_review') THEN 1 END) AS pending_samples,
    SUM(CASE
        WHEN ltpc.billing_basis = 'all_samples' THEN s.calculated_lab_fee
        WHEN ltpc.billing_basis = 'approved_only' AND s.status = 'approved' THEN s.calculated_lab_fee
        WHEN ltpc.billing_basis = 'approved_and_rejected' AND s.status IN ('approved', 'rejected') THEN s.calculated_lab_fee
        ELSE 0
    END) AS total_owed_amount,
    SUM(s.calculated_lab_fee) AS total_potential_amount,
    MIN(s.created_at) AS first_sample_date,
    MAX(s.created_at) AS last_sample_date
FROM laboratories l
INNER JOIN laboratory_third_party_config ltpc ON ltpc.laboratory_id = l.id
LEFT JOIN samples s ON s.laboratory_id = l.id
WHERE l.type = 'third_party' AND ltpc.is_active = true
GROUP BY l.id, l.name, l.location, l.type, l.is_active, ltpc.fee_per_sample,
         ltpc.payment_schedule, ltpc.billing_basis, ltpc.currency,
         ltpc.contact_name, ltpc.contact_email;

-- Lab invoice summary view
CREATE OR REPLACE VIEW lab_invoice_summary AS
SELECT
    li.id AS invoice_id,
    li.invoice_number,
    li.laboratory_id,
    l.name AS lab_name,
    l.location AS lab_location,
    li.period_start,
    li.period_end,
    li.sample_count,
    li.approved_count,
    li.rejected_count,
    li.total_amount,
    li.currency,
    li.due_date,
    li.status,
    li.paid_date,
    li.created_at,
    CASE
        WHEN li.status = 'paid' THEN 'Paid'
        WHEN li.due_date < CURRENT_DATE AND li.status != 'paid' THEN 'Overdue'
        WHEN li.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'Due Soon'
        ELSE 'Pending'
    END AS payment_status,
    CURRENT_DATE - li.due_date AS days_overdue
FROM laboratory_invoices li
INNER JOIN laboratories l ON l.id = li.laboratory_id;

-- Per-lab breakdown view for finance dashboard
CREATE OR REPLACE VIEW lab_sample_breakdown AS
SELECT
    l.id AS laboratory_id,
    l.name,
    l.location,
    l.type,
    COUNT(s.id) AS total_samples,
    COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_samples,
    COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) AS rejected_samples,
    COUNT(CASE WHEN s.status IN ('received', 'in_progress', 'under_review') THEN 1 END) AS pending_samples,
    ROUND(
        CASE
            WHEN COUNT(s.id) > 0
            THEN (COUNT(CASE WHEN s.status = 'approved' THEN 1 END)::DECIMAL / COUNT(s.id)) * 100
            ELSE 0
        END,
        2
    ) AS approval_rate
FROM laboratories l
LEFT JOIN samples s ON s.laboratory_id = l.id
WHERE l.is_active = true
GROUP BY l.id, l.name, l.location, l.type;

-- Grant permissions for views
GRANT SELECT ON client_billing_summary TO authenticated;
GRANT SELECT ON client_origin_pricing_summary TO authenticated;
GRANT SELECT ON lab_payment_summary TO authenticated;
GRANT SELECT ON lab_invoice_summary TO authenticated;
GRANT SELECT ON lab_sample_breakdown TO authenticated;

-- Comments
COMMENT ON VIEW client_billing_summary IS 'Summary of client billing including total samples and billable amounts';
COMMENT ON VIEW client_origin_pricing_summary IS 'Breakdown of client billing by origin with multi-tier pricing';
COMMENT ON VIEW lab_payment_summary IS 'Summary of amounts owed to 3rd party laboratories';
COMMENT ON VIEW lab_invoice_summary IS 'Detailed view of lab invoices with payment status indicators';
COMMENT ON VIEW lab_sample_breakdown IS 'Per-lab breakdown of sample counts and approval rates for finance dashboard';
