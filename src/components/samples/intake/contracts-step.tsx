'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown } from 'lucide-react'
import { SubContractFormData, StepComponentProps } from './types'
import type { Client } from './types'
import { ContractNumberInput } from './contract-number-input'
import { QuantityInputs } from './quantity-inputs'
import { IcoNumberInput } from '../ico-number-input'
import { PartySelect } from './party-select'
import { useSubContractLookup } from './sub-contract-lookup'
import {
  sellerRefIsImporterRef,
  SELLER_REF_IS_IMPORTER_REF_WARNING,
} from '@/lib/contract-intake-mapping'

/**
 * A contract added by hand to this lot ("+ Add sub-contract", and the rows a
 * sys contract family proposes, which then take their own sys values on top).
 *
 * The Sample nr defaults to the parent's own number: one package usually
 * covers every contract of the lot, so the contracts share it (Ecom AS300226
 * for 42885/26 and 42886/26). It is an ordinary input, so exporters that tag
 * each contract separately (OFI, Alfi) edit it by hand. Nothing is stepped:
 * the 2026-08-28 series guess turned AS300226 into AS300227, and a guess left
 * alone was saved as that contract's number.
 *
 * The contract references start blank. Each contract's refs are its own
 * record's — typed, or filled from its own sys contract once its Wolthers
 * number is found — never the parent's: a copied or inherited ref is how
 * 42886/26 was saved with 42885/26's seller ref. The parties, ICO, container,
 * quantity and shipment month are copied as a starting point, since the same
 * physical sample usually ships them alike.
 */
function createEmptyContract(formData: StepComponentProps['formData']): SubContractFormData {
  return {
    importer: formData.importer,
    importer_is_qc_client: formData.importer_is_qc_client,
    roaster: formData.roaster,
    end_client: formData.end_client,
    qc_client: formData.qc_client,
    // Each contract's own Wolthers number is TYPED (2026-09-10) - it is neither
    // copied from the mother nor stepped from the previous contract, because a
    // guessed contract number that nobody read off the paperwork is exactly how
    // a wrong number reached a certificate. The field searches as you type.
    wolthers_contract_nr: '',
    contract_id: '',
    buyer_contract_nr: '',
    roaster_contract_nr: '',
    qc_client_contract_nr: '',
    end_client_contract_nr: '',
    // The contract's SELLER ref. Never the parent's supplier_contract_nr,
    // which is the farm / co-op Supplier's ref, a different party.
    supplier_contract_nr: '',
    ico_number: formData.ico_number || '',
    container_nr: formData.container_nr || '',
    bag_count: formData.bag_count,
    bag_weight_kg: formData.bag_weight_kg,
    bag_type: formData.bag_type,
    bags_quantity_mt: formData.bags_quantity_mt,
    equivalent_60kg_bags: formData.equivalent_60kg_bags,
    container_count: formData.container_count,
    shipment_month: formData.shipment_month,
    exporter_sample_number: formData.exporter_sample_number || '',
  }
}

/** The form's contracts plus one added by hand: SampleIntakeForm's "+ Add sub-contract". */
export function appendContract(formData: StepComponentProps['formData']): SubContractFormData[] {
  return [...formData.contracts, createEmptyContract(formData)]
}

// ---------- Contract Panel (form for a single sub-contract) ----------

function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground block">{label}</Label>
      {children}
    </div>
  )
}

export function ContractPanel({
  contract,
  updateContract,
  importerOptions,
  mergedImporterOptions,
  roasterOptions,
  qcClients,
  origin,
  sellerName,
  lockQcClient,
}: {
  contract: SubContractFormData
  updateContract: (field: keyof SubContractFormData, value: string | boolean) => void
  importerOptions: { name: string }[]
  mergedImporterOptions: { name: string }[]
  roasterOptions: { name: string }[]
  qcClients: Client[]
  origin: string
  /** Accepted for callers; the panel no longer branches on it (a bulk PSS needs its container fields too). */
  sampleType?: string
  sellerName?: string
  lockQcClient?: boolean
}) {
  const [showDestination, setShowDestination] = useState(
    !!(contract.roaster || contract.end_client)
  )

  const dropdownOptions = contract.importer_is_qc_client ? mergedImporterOptions : importerOptions
  const { contractSeller, handleSelectContract, handleNumberChange } = useSubContractLookup({
    contract,
    updateContract,
    sellerName,
    lockQcClient,
    onFilled: (patch) => { if (patch.end_client) setShowDestination(true) },
  })
  const partySelect = (
    value: string,
    onChange: (v: string) => void,
    options: { key: string; name: string }[],
    disabled?: boolean,
  ) => <PartySelect value={value} onChange={onChange} options={options} disabled={disabled} />
  const qcClientOptions = qcClients.map((c) => ({ key: c.id, name: c.fantasy_name || c.company }))

  return (
    <div className="space-y-5 pt-1">
      {/* References: this contract's own numbers, and the physical sample's tags. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Wolthers contract">
          <ContractNumberInput
            value={contract.wolthers_contract_nr}
            onChange={handleNumberChange}
            onSelectContract={handleSelectContract}
            linkedContractId={contract.contract_id || null}
            placeholder="Wolthers ref."
            className="h-9 font-mono"
          />
          {contract.contract_id && (
            <p className="text-[11px] text-muted-foreground">Filled from the contract on the system</p>
          )}
          {contract.proposed_from && (
            <p className="text-[11px] text-[#556b2f]">
              {contract.proposed_from === 'pss'
                ? 'Proposed from the linked PSS, which covers this contract too. Remove it if this shipment does not.'
                : 'Proposed from the contract family on the system. Remove it if this sample does not cover it.'}
            </p>
          )}
          {contractSeller && (
            <p className="text-[11px] text-[#b07946]">
              This contract&apos;s seller is {contractSeller}, not {sellerName}. The lot keeps its seller.
            </p>
          )}
        </Field>
        {/* Named as the SELLER's ref, not after the seller: when the seller
            is also the importer (OFI to OFI) a box labelled with the name
            alone took the importer's ref (2026-08-13). */}
        <Field label="Seller ref.">
          <Input
            value={contract.supplier_contract_nr}
            onChange={(e) => updateContract('supplier_contract_nr', e.target.value)}
            placeholder="Seller ref."
            className="h-9"
          />
          {sellerRefIsImporterRef(contract.supplier_contract_nr, contract.buyer_contract_nr) && (
            <p className="text-[11px] text-[#b07946]">{SELLER_REF_IS_IMPORTER_REF_WARNING}</p>
          )}
        </Field>
        <Field label="Sample nr">
          <Input
            value={contract.exporter_sample_number}
            onChange={(e) => updateContract('exporter_sample_number', e.target.value)}
            placeholder="Sample ref."
            className="h-9"
          />
        </Field>
        {/* ICO & container — for PSS too: a bulk PSS ships in containers. */}
        <Field label="ICO number">
          <IcoNumberInput
            value={contract.ico_number}
            onChange={(e) => updateContract('ico_number', e.target.value)}
            placeholder="ICO number"
            className="h-9 font-mono"
          />
        </Field>
        <Field label="Container nr.">
          <Input
            value={contract.container_nr}
            onChange={(e) => updateContract('container_nr', e.target.value)}
            placeholder="Container nr."
            className="h-9 font-mono"
          />
        </Field>
      </div>

      {/* Buyer side: importer (or a separate QC client) with its own ref. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Importer</Label>
            <div className="flex items-center gap-1">
              <Checkbox
                checked={contract.importer_is_qc_client}
                onCheckedChange={(checked) => updateContract('importer_is_qc_client', checked as boolean)}
                className="h-3 w-3"
                disabled={lockQcClient}
              />
              <Label className="text-[10px] cursor-pointer text-muted-foreground">=QC Client</Label>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_160px] gap-2">
            {partySelect(
              contract.importer,
              (v) => updateContract('importer', v),
              dropdownOptions.map((o) => ({ key: o.name, name: o.name })),
            )}
            <Input
              value={contract.buyer_contract_nr}
              onChange={(e) => updateContract('buyer_contract_nr', e.target.value)}
              placeholder="Importer ref."
              className="h-9"
            />
          </div>
        </div>

        {!contract.importer_is_qc_client && (
          <Field label="QC Client">
            <div className="grid grid-cols-[1fr_160px] gap-2">
              {partySelect(contract.qc_client, (v) => updateContract('qc_client', v), qcClientOptions, lockQcClient)}
              <Input
                value={contract.qc_client_contract_nr}
                onChange={(e) => updateContract('qc_client_contract_nr', e.target.value)}
                placeholder="QC client ref."
                className="h-9"
              />
            </div>
          </Field>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowDestination(!showDestination)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showDestination ? '' : '-rotate-90'}`} />
          Roaster & End Client
        </button>
        {showDestination && (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="Roaster">
              <div className="grid grid-cols-[1fr_160px] gap-2">
                {partySelect(
                  contract.roaster,
                  (v) => updateContract('roaster', v),
                  roasterOptions.map((o) => ({ key: o.name, name: o.name })),
                )}
                <Input
                  value={contract.roaster_contract_nr}
                  onChange={(e) => updateContract('roaster_contract_nr', e.target.value)}
                  placeholder="Roaster ref."
                  className="h-9"
                />
              </div>
            </Field>
            <Field label="End Client">
              <div className="grid grid-cols-[1fr_160px] gap-2">
                {partySelect(contract.end_client, (v) => updateContract('end_client', v), qcClientOptions)}
                <Input
                  value={contract.end_client_contract_nr}
                  onChange={(e) => updateContract('end_client_contract_nr', e.target.value)}
                  placeholder="End client ref."
                  className="h-9"
                />
              </div>
            </Field>
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <div className="mb-3 text-xs font-medium text-muted-foreground">Quantity & shipment</div>
        <QuantityInputs
          value={contract}
          origin={origin}
          onChange={(patch) => {
            for (const [field, v] of Object.entries(patch)) {
              updateContract(field as keyof SubContractFormData, v as string)
            }
          }}
        />
      </div>
    </div>
  )
}

export { createEmptyContract }
