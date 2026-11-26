// The role tags POST /api/clients accepts: exactly what the QC add-company
// form can send. add-client-modal.tsx offers these seven client types
// (CLIENT_TYPE_OPTIONS, and ROLE_TO_CLIENT_TYPE for the role it was opened
// for; the unused client-form.tsx has the same seven), and
// legacyClientTypeToCompanyTags turns them into the company_types and
// trading_roles listed here. The form never sends those two directly; a body
// that does may use only the same mapped values.
//
// Anything else is refused before any read or write ('Unknown company role'),
// for every caller, because a link adds the tags with the service role on a
// company the caller may not have created. Roles that drive sys access rules
// (co_broker, freight_forwarder, internal_market) are never on these lists.
// No imports: the client form uses it too.

export const QC_COMPANY_ROLES = {
  clientTypes: ['producer', 'cooperative', 'exporter', 'importer_buyer', 'roaster', 'final_buyer', 'end_client'],
  companyTypes: ['farm', 'coop', 'exporter', 'trader', 'roaster', 'final_buyer'],
  tradingRoles: ['seller', 'buyer'],
} as const

export type QcClientType = (typeof QC_COMPANY_ROLES.clientTypes)[number]

export const UNKNOWN_COMPANY_ROLE = 'Unknown company role'
