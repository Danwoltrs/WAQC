/**
 * How a stored sample is named on the storage screen: its certificate number
 * once one exists, else its own identifier, with its contract number beside
 * it. The SAN- lab number is a backend key and is never selected here.
 */
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { sampleLabelText } from '@/lib/sample-reference'

export const STORED_SAMPLE_COLUMNS =
  'id, storage_position_id, wolthers_contract_nr, container_nr, ico_number, exporter_sample_number, ' +
  'client:companies!samples_client_id_fkey(name, fantasy_name)'

export interface StoredSampleRow {
  id: string
  storage_position_id: string | null
  wolthers_contract_nr: string | null
  container_nr: string | null
  ico_number: string | null
  exporter_sample_number: string | null
  client: { name: string | null; fantasy_name: string | null } | null
}

export interface CertRow { id: string; sample_id: string; certificate_number: string | null }

export interface CubbySampleRow { id: string; label: string; contract: string | null; client: string }

export function buildCubbySampleRows(samples: StoredSampleRow[], certs: CertRow[]): CubbySampleRow[] {
  const certBySample = new Map(certs.map((c) => [c.sample_id, c]))
  return samples
    .map((s) => {
      const cert = certBySample.get(s.id)
      return {
        id: s.id,
        label: sampleLabelText(
          {
            container_nr: s.container_nr,
            ico_number: s.ico_number,
            exporter_sample_number: s.exporter_sample_number,
            certificate_id: cert?.id ?? null,
            certificate_number: cert?.certificate_number ?? null,
          },
          'Reference pending',
        ),
        contract: s.wolthers_contract_nr?.trim() || null,
        // The embed carries no id; companyDisplayName only reads the two names.
        client: companyDisplayName(s.client ? { id: '', ...s.client } : null),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Characters PostgREST treats as filter syntax, plus LIKE wildcards, become spaces. */
export function sanitizeStorageSearch(q: string | null): string {
  const cleaned = (q ?? '').replace(/[,()*%_\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return cleaned.length >= 2 ? cleaned : ''
}
