# Client Database Schema Investigation
**Task**: 26.1
**Date**: 2025-10-10
**Status**: Complete

## Summary
Investigation of the shared Supabase database revealed multiple tables containing client/company data from both the legacy system and the modern trips.wolthers.com application.

## Key Tables Discovered

### 1. `companies` table (trips.wolthers.com - Modern)
**Purpose**: Main company management table for trips application
**Key Fields**:
- `id` (uuid) - Primary key
- `name` (varchar) - Company legal name
- `fantasy_name` (varchar) - Trade name/DBA
- `email` (text) - Company email
- `phone` (varchar) - Phone number
- `address` (text) - Street address
- `city` (varchar) - City
- `state` (varchar) - State/Province
- `country` (varchar) - Country
- `region` (varchar) - Geographic region
- `category` (enum) - Company category
- `subcategories` (text[]) - Additional categories
- `legacy_client_id` (int) - Link to old system
- `logo_url` (text) - Company logo
- `latitude`, `longitude` (numeric) - Geolocation

**Category Enum Values**:
- `importer_roaster`
- `exporter_coop`
- `service_provider`
- `buyer`
- `supplier`
- `exporter`
- `importer`
- `cooperative`
- `roaster`

**Related Tables**:
- `company_contacts` - Multiple contacts per company
- `company_locations` - Multiple physical locations
- `company_tags` - Tag system
- `company_user_roles` - User permissions

### 2. `legacy_clients` table (Old System - Portuguese)
**Purpose**: Imported data from legacy CRM system
**Key Fields**:
- `id` (bigint) - Primary key
- `legacy_client_id` (int) - Original ID from old system
- `company_id` (uuid) - Link to modern companies table
- `descricao` (text) - Company name (Portuguese)
- `descricao_fantasia` (text) - Fantasy name (Portuguese)
- `endereco` (text) - Address (street)
- `numero` (text) - Street number
- `complemento` (text) - Address complement
- `bairro` (text) - Neighborhood
- `cidade` (text) - City
- `pais` (text) - Country
- `uf` (text) - State
- `cep` (text) - Postal code
- `telefone1`, `telefone2`, `telefone3`, `telefone4` (text) - Phone numbers
- `email` (text) - Email
- `email_contratos` (text) - Contracts email
- `grupo1`, `grupo2` (text) - Group classifications (potential client types)
- `pessoa` (text) - Person type (company/individual)
- `obs` (text) - Observations
- `ativo` (boolean) - Active status

### 3. `clients` table (QC System - Current)
**Purpose**: QC-specific client table
**Current Fields**:
- `id` (uuid) - Primary key
- `name` (text) - Client name
- `email` (text) - Email
- `company` (text) - Company name
- `address` (text) - Address
- `default_quality_specs` (uuid[]) - Quality specifications
- `qc_enabled` (boolean) - QC system access
- `notification_emails` (text[]) - Email list for notifications
- `certificate_delivery_timing` (text) - Certificate timing preference
- `tracking_number_format` (text) - Custom tracking format

**Missing Fields (Need to Add)**:
- `city` (varchar) - City
- `state` (varchar) - State/Province
- `country` (varchar) - Country
- `client_types` (text[]) - Array of client type categories
- `fantasy_name` (text) - Trade name
- `phone` (varchar) - Phone number

### 4. `company_locations` table
**Purpose**: Multiple locations per company
**Key Fields**:
- `company_id` (uuid) - Foreign key to companies
- `address_line1`, `address_line2` (varchar) - Street address
- `city` (varchar) - City
- `state_province` (varchar) - State
- `postal_code` (varchar) - Postal code
- `country` (varchar) - Country
- `cep` (varchar) - Brazilian postal code
- `latitude`, `longitude` (numeric) - Geolocation
- `is_headquarters` (boolean) - HQ flag
- `is_active` (boolean) - Active status

### 5. `company_contacts` table
**Purpose**: Multiple contacts per company
**Key Fields**:
- `company_id` (uuid) - Foreign key to companies
- `name` (varchar) - Contact name
- `email` (varchar) - Email
- `phone` (varchar) - Phone
- `whatsapp` (varchar) - WhatsApp number
- `title` (varchar) - Job title
- `department` (varchar) - Department
- `is_primary` (boolean) - Primary contact flag
- `contact_type` (varchar) - Contact type
- `is_active` (boolean) - Active status

## Recommended Implementation Strategy

### Phase 1: Extend QC Clients Table
Add a migration to extend the `clients` table:

```sql
ALTER TABLE clients ADD COLUMN city varchar;
ALTER TABLE clients ADD COLUMN state varchar;
ALTER TABLE clients ADD COLUMN country varchar;
ALTER TABLE clients ADD COLUMN client_types text[] DEFAULT '{}';
ALTER TABLE clients ADD COLUMN fantasy_name text;
ALTER TABLE clients ADD COLUMN phone varchar;
ALTER TABLE clients ADD COLUMN legacy_client_id int;
ALTER TABLE clients ADD COLUMN company_id uuid REFERENCES companies(id);
```

### Phase 2: Create Client Type Enum/Array
Support multi-select client types matching user requirements:
- `producer`
- `producer_exporter`
- `cooperative`
- `exporter`
- `importer_buyer`
- `roaster`
- `final_buyer`
- `roaster_final_buyer`
- `service_provider`

### Phase 3: Search Strategy
Client search should query:
1. **Primary**: `companies` table (modern data, well-structured)
2. **Fallback**: `legacy_clients` table (for old clients not yet migrated)
3. **Join**: Use `company_id` or `legacy_client_id` to link tables

### Sample Search Query Pattern
```sql
SELECT
  c.id,
  c.name,
  c.fantasy_name,
  c.email,
  c.phone,
  c.address,
  c.city,
  c.state,
  c.country,
  c.category,
  c.subcategories,
  lc.descricao as legacy_name,
  lc.descricao_fantasia as legacy_fantasy_name
FROM companies c
LEFT JOIN legacy_clients lc ON c.legacy_client_id = lc.legacy_client_id
WHERE
  c.name ILIKE '%search_term%'
  OR c.fantasy_name ILIKE '%search_term%'
  OR c.email ILIKE '%search_term%'
  OR lc.descricao ILIKE '%search_term%'
  OR lc.descricao_fantasia ILIKE '%search_term%'
ORDER BY c.name
LIMIT 50;
```

## Field Mapping: Companies → QC Clients

| Companies Table | QC Clients Table | Notes |
|----------------|------------------|-------|
| `name` | `name` | Company legal name |
| `fantasy_name` | `fantasy_name` | Trade name/DBA |
| `email` | `email` | Primary email |
| `phone` | `phone` | Primary phone |
| `address` | `address` | Street address |
| `city` | `city` | NEW FIELD |
| `state` | `state` | NEW FIELD |
| `country` | `country` | NEW FIELD |
| `category` + `subcategories` | `client_types[]` | NEW FIELD - Multi-select array |
| `id` | `company_id` | Foreign key reference |
| `legacy_client_id` | `legacy_client_id` | Legacy system link |

## Field Mapping: Legacy Clients → QC Clients

| Legacy Clients Table | QC Clients Table | Notes |
|---------------------|------------------|-------|
| `descricao` | `name` | Portuguese name field |
| `descricao_fantasia` | `fantasy_name` | Portuguese fantasy name |
| `email` | `email` | Email address |
| `telefone1` | `phone` | Primary phone |
| `endereco + numero + complemento` | `address` | Concatenate address parts |
| `cidade` | `city` | City |
| `uf` | `state` | State abbreviation |
| `pais` | `country` | Country |
| `grupo1, grupo2` | `client_types[]` | Map to client type enum |
| `legacy_client_id` | `legacy_client_id` | Original ID |
| `company_id` | `company_id` | Link to companies if migrated |

## Next Steps

1. ✅ **Subtask 26.1**: Schema investigation complete
2. **Subtask 26.2**: Create database migration for clients table extensions
3. **Subtask 26.3**: Build API endpoint for searching companies/legacy_clients
4. **Subtask 26.4**: Create search dialog UI component
5. **Subtask 26.5**: Build client management page

## Additional Notes

- The `companies` table is the source of truth for modern clients
- `legacy_clients` provides historical data and can be queried as fallback
- Consider creating a database view that unions both tables for easier searching
- RLS policies will need to be added to the extended clients table
- Company logos are stored in `companies.logo_url` and can be used in certificates
