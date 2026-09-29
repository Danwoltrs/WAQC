'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Checkbox } from '@/components/ui/checkbox'
import { AddClientModal, AddClientRole } from '@/components/clients/add-client-modal'
import { StepComponentProps } from './types'
import { ContractNumberInput } from './contract-number-input'
import { EntityResolutionNotice } from './entity-resolution-notice'
import { FieldBox, isPrefilled, PREFILLED_CONTROL } from './field-box'
import { SectionCard } from './section-card'
import { SegmentedControl } from './segmented-control'
import { IcoNumberInput } from '../ico-number-input'
import { ContainerHistoryHint } from '../container-history-hint'
import { sellerRefIsImporterRef, SELLER_REF_IS_IMPORTER_REF_WARNING } from '@/lib/contract-intake-mapping'

export function SupplyChainStep({
  formData,
  updateFormData,
  clients,
  exporters = [],
  importers = [],
  roasters = [],
  qcClients = [],
  approvedPSSSamples = [],
  onEntityCreated,
  onSelectContractNumber,
  part,
}: StepComponentProps & {
  /** One card of the two (Step 2 places them in its columns); both when omitted. */
  part?: 'check' | 'buyer'
}) {
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientRole, setCreateClientRole] = useState<AddClientRole>('exporter')

  // Sellers/Shippers: from exporters table (deduplicated by name), plus the
  // linked contract's own seller and shipper. The contract writes the party's
  // legal name into the field; the list is keyed by that same name, but only
  // carries companies tagged as sellers, shippers or exporters on sys — an untagged seller
  // (prod: Ipanema on #42611/26) was in the field and invisible in the
  // combobox, which showed its placeholder instead. The link is the source of
  // truth for its parties, so they are always options.
  const linked = formData.selected_contract
  const sellerOptions = useMemo(() => {
    const seen = new Set<string>()
    const rows: Array<{ id: string; name: string; fantasy_name: string | null }> = []
    const add = (e: { id: string; name: string | null | undefined; fantasy_name?: string | null }) => {
      const key = (e.name ?? '').trim().toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      rows.push({ id: e.id, name: e.name as string, fantasy_name: e.fantasy_name ?? null })
    }
    exporters.forEach(e => add(e as { id: string; name: string; fantasy_name?: string | null }))
    if (linked?.seller_id && linked.seller_legal_name) {
      add({ id: linked.seller_id, name: linked.seller_legal_name, fantasy_name: linked.seller_name })
    }
    if (linked?.shipper_id && linked.shipper_legal_name) {
      add({ id: linked.shipper_id, name: linked.shipper_legal_name, fantasy_name: linked.shipper_name })
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [exporters, linked])

  // Importers: deduplicated by name
  const importerOptions = useMemo(() => {
    const seen = new Set<string>()
    return importers
      .filter((imp: any) => {
        if (!imp.name || seen.has(imp.name)) return false
        seen.add(imp.name)
        return true
      })
      .map((imp: any) => ({
        id: imp.id,
        name: imp.name,
        fantasy_name: imp.fantasy_name ?? null,
        type: 'importer' as const,
        clientId: imp.client_id
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [importers])

  // Merged importer options: when importer_is_qc_client is checked, show QC
  // clients + linked importers. The linked contract's buyer is always an
  // option too, under the trade name the contract wrote into the field.
  const mergedImporterOptions = useMemo(() => {
    const base = formData.importer_is_qc_client
      ? [
          ...qcClients.map(c => ({
            id: c.id,
            name: c.fantasy_name || c.company,
            fantasy_name: c.fantasy_name ?? null,
            type: 'client' as const,
            clientId: c.id
          })),
          ...importerOptions.filter(imp => imp.clientId),
        ]
      : [...importerOptions]
    if (linked?.buyer_id && linked.buyer_name) {
      base.push({ id: linked.buyer_id, name: linked.buyer_name, fantasy_name: linked.buyer_name, type: 'client' as const, clientId: linked.buyer_id })
    }
    // Deduplicate by name (QC clients first)
    const seen = new Set<string>()
    return base
      .filter(opt => {
        const key = (opt.name ?? '').toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [formData.importer_is_qc_client, qcClients, importerOptions, linked])

  // QC Client options: exclude the selected importer if they're also a QC client
  const qcClientOptions = useMemo(() => {
    return qcClients
      .filter(c => c.fantasy_name && c.fantasy_name !== formData.importer)
      .sort((a, b) => (a.fantasy_name || '').localeCompare(b.fantasy_name || ''))
  }, [qcClients, formData.importer])

  // Roaster options from roasters table (deduplicated by name)
  const roasterOptions = useMemo(() => {
    const seen = new Set<string>()
    return roasters
      .filter(r => {
        if (!r.name || seen.has(r.name)) return false
        seen.add(r.name)
        return true
      })
      .map(r => ({
        id: r.id,
        name: r.name,
        fantasy_name: r.fantasy_name ?? null
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [roasters])

  const pre = (key: keyof typeof formData) => isPrefilled(formData, key)
  const tint = (key: keyof typeof formData, base = 'h-9') => cn(base, pre(key) && PREFILLED_CONTROL)

  const resolutionNotices = (party: 'seller' | 'shipper') => {
    const r = formData.contract_resolution
    if (!r || !formData.selected_contract) return null
    const count = party === 'seller' ? r.seller_match_count : r.shipper_match_count
    const several = party === 'seller' ? r.multiple_seller_matches : r.multiple_shipper_matches
    const name = party === 'seller' ? formData.seller : formData.shipper
    return (
      <>
        {count === 0 && (
          <EntityResolutionNotice message={`No exporter named "${name}" found in WAQC. Select an existing exporter above or create one.`} />
        )}
        {several && (
          <EntityResolutionNotice message={`${count} exporters named "${name}" exist — verify the selection above is correct.`} />
        )}
      </>
    )
  }

  // Everyone else on the contract, behind "All fields".
  const moreParties = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldBox label="Supplier" htmlFor="supplier" prefilled={pre('supplier')}>
        <Input
          id="supplier"
          value={formData.supplier}
          onChange={(e) => updateFormData('supplier', e.target.value)}
          placeholder="Farm / cooperative"
          className={tint('supplier')}
        />
      </FieldBox>
      <FieldBox label="Supplier contract ref." htmlFor="supplier_contract_nr" prefilled={pre('supplier_contract_nr')}>
        <Input
          id="supplier_contract_nr"
          value={formData.supplier_contract_nr}
          onChange={(e) => updateFormData('supplier_contract_nr', e.target.value)}
          placeholder="Contract ref."
          className={tint('supplier_contract_nr')}
        />
      </FieldBox>
      <FieldBox label="Roaster" prefilled={pre('roaster')}>
        <SearchableSelect
          options={roasterOptions.map(r => ({ value: r.name, label: r.fantasy_name || r.name }))}
          value={formData.roaster || ''}
          onValueChange={(value) => updateFormData('roaster', value)}
          placeholder="Select roaster"
          searchPlaceholder="Search roasters..."
          className={tint('roaster')}
          allowCreate
          createLabel="+ New Roaster"
          onCreateNew={() => {
            setCreateClientRole('roaster')
            setShowCreateClientDialog(true)
          }}
        />
      </FieldBox>
      <FieldBox label="Roaster contract ref." htmlFor="roaster_contract_nr" prefilled={pre('roaster_contract_nr')}>
        <Input
          id="roaster_contract_nr"
          value={formData.roaster_contract_nr}
          onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
          placeholder="Contract ref."
          className={tint('roaster_contract_nr')}
        />
      </FieldBox>
      <FieldBox label="End client" prefilled={pre('end_client')}>
        <SearchableSelect
          options={qcClients.map(c => ({ value: c.fantasy_name || c.company, label: c.fantasy_name || c.company }))}
          value={formData.end_client || ''}
          onValueChange={(value) => updateFormData('end_client', value)}
          placeholder="Select end client"
          searchPlaceholder="Search end clients..."
          className={tint('end_client')}
          allowCreate
          createLabel="+ New End Client"
          onCreateNew={() => {
            setCreateClientRole('end_client')
            setShowCreateClientDialog(true)
          }}
        />
      </FieldBox>
      <FieldBox label="End client contract ref." htmlFor="end_client_contract_nr" prefilled={pre('end_client_contract_nr')}>
        <Input
          id="end_client_contract_nr"
          value={formData.end_client_contract_nr}
          onChange={(e) => updateFormData('end_client_contract_nr', e.target.value)}
          placeholder="Contract ref."
          className={tint('end_client_contract_nr')}
        />
      </FieldBox>
    </div>
  )

  // What the user comes to Step 2 for: the sample's own reference (with its
  // type, and a shipment sample's ICO and container) and the seller side,
  // compared with the sample's label. The buyer side sits beside it.
  // Prefilled values carry a tag and a tint until they are edited.
  const checkCard = (
    <SectionCard
      section="check"
      title="Sample and seller"
      description="Compare with the sample's label. Values marked prefilled came from the linked contract or PSS."
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-4">
        <FieldBox label="Sample ref." htmlFor="exporter_sample_number" field="exporter_sample_number" prefilled={pre('exporter_sample_number')} className="w-full sm:w-44">
          <Input
            id="exporter_sample_number"
            data-autofocus
            value={formData.exporter_sample_number}
            onChange={(e) => updateFormData('exporter_sample_number', e.target.value)}
            placeholder="Sample ref."
            className={tint('exporter_sample_number', 'h-9 font-mono')}
          />
        </FieldBox>
        <FieldBox label="Sample type" field="sample_type" required>
          <SegmentedControl
            ariaLabel="Sample type"
            value={formData.sample_type}
            options={[
              { value: 'pss', label: 'PSS' },
              { value: 'ss', label: 'SS' },
              { value: 'type', label: 'Type sample' },
            ]}
            onChange={(value) => updateFormData('sample_type', value as any)}
          />
        </FieldBox>
      </div>

      {/* A shipment sample's own identifiers, read off the same label. */}
      {formData.sample_type === 'ss' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldBox label="ICO number" htmlFor="ico_number" prefilled={pre('ico_number')}>
            <IcoNumberInput
              id="ico_number"
              value={formData.ico_number}
              onChange={(e) => updateFormData('ico_number', e.target.value)}
              placeholder="e.g. 002/1234/0567"
              className={tint('ico_number', 'h-9 font-mono')}
            />
          </FieldBox>
          <FieldBox label="Container number" htmlFor="container_nr" prefilled={pre('container_nr')}>
            <Input
              id="container_nr"
              value={formData.container_nr}
              onChange={(e) => updateFormData('container_nr', e.target.value)}
              placeholder="e.g. ABCD1234567"
              className={tint('container_nr', 'h-9 font-mono')}
            />
            {/* Non-blocking: a repeated container is normal (resubmission after
                a rejection, or the same container on a later shipment). This
                only shows the earlier samples so the history is visible. */}
            <ContainerHistoryHint containerNr={formData.container_nr} />
          </FieldBox>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldBox
          label="Seller"
          field="seller"
          required
          prefilled={pre('seller')}
          aside={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                id="same_seller_shipper"
                checked={formData.same_seller_shipper}
                onCheckedChange={(checked) => {
                  updateFormData('same_seller_shipper', checked as boolean)
                  if (checked) {
                    updateFormData('shipper', '')
                    updateFormData('shipper_contract_nr', '')
                  }
                }}
                className="h-3.5 w-3.5"
              />
              Also the shipper
            </label>
          }
        >
          <SearchableSelect
            options={sellerOptions.map(o => ({ value: o.name, label: o.fantasy_name || o.name }))}
            value={formData.seller || ''}
            onValueChange={(value) => updateFormData('seller', value)}
            placeholder="Select seller"
            searchPlaceholder="Search sellers..."
            className={tint('seller')}
            allowCreate
            createLabel="+ New Seller"
            onCreateNew={() => {
              setCreateClientRole('exporter')
              setShowCreateClientDialog(true)
            }}
          />
          {resolutionNotices('seller')}
        </FieldBox>
        <FieldBox label="Seller contract ref." htmlFor="seller_contract_nr" prefilled={pre('seller_contract_nr')}>
          <Input
            id="seller_contract_nr"
            value={formData.seller_contract_nr}
            onChange={(e) => updateFormData('seller_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className={tint('seller_contract_nr')}
          />
        </FieldBox>

        {/* A distinct shipper only: "Also the shipper" on the seller covers
            the usual case without a row of its own. */}
        {!formData.same_seller_shipper && (
          <>
            <FieldBox label="Shipper" field="shipper" required prefilled={pre('shipper')}>
              <SearchableSelect
                options={sellerOptions.map(o => ({ value: o.name, label: o.fantasy_name || o.name }))}
                value={formData.shipper || ''}
                onValueChange={(value) => updateFormData('shipper', value)}
                placeholder="Select shipper"
                searchPlaceholder="Search shippers..."
                className={tint('shipper')}
                allowCreate
                createLabel="+ New Shipper"
                onCreateNew={() => {
                  setCreateClientRole('exporter')
                  setShowCreateClientDialog(true)
                }}
              />
              {resolutionNotices('shipper')}
            </FieldBox>
            <FieldBox label="Shipper contract ref." htmlFor="shipper_contract_nr" prefilled={pre('shipper_contract_nr')}>
              <Input
                id="shipper_contract_nr"
                value={formData.shipper_contract_nr}
                onChange={(e) => updateFormData('shipper_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className={tint('shipper_contract_nr')}
              />
            </FieldBox>
          </>
        )}
      </div>
    </SectionCard>
  )

  const buyerCard = (
    <SectionCard
      section="buyer"
      title="Buyer side and contract"
      defaultOpen={!!(formData.supplier || formData.roaster || formData.end_client)}
      more={moreParties}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldBox
          label="Importer"
          field="importer"
          prefilled={pre('importer')}
          aside={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                id="importer_is_qc_client"
                checked={formData.importer_is_qc_client}
                onCheckedChange={(checked) => {
                  updateFormData('importer_is_qc_client', checked as boolean)
                  if (checked) {
                    updateFormData('qc_client', '')
                    updateFormData('qc_client_contract_nr', '')
                  }
                }}
                className="h-3.5 w-3.5"
              />
              Also the QC client
            </label>
          }
        >
          <SearchableSelect
            options={mergedImporterOptions.map((o: any) => ({ value: o.name, label: o.fantasy_name || o.name }))}
            value={formData.importer || ''}
            onValueChange={(value) => updateFormData('importer', value)}
            placeholder="Select importer"
            searchPlaceholder="Search importers..."
            className={tint('importer')}
            allowCreate
            createLabel="+ New Importer"
            onCreateNew={() => {
              setCreateClientRole('importer')
              setShowCreateClientDialog(true)
            }}
          />
          {formData.contract_resolution && formData.selected_contract && !formData.contract_resolution.importer_resolved && (
            <EntityResolutionNotice
              message={`No WAQC client or importer is linked to "${formData.importer}". Select an existing one above or create new.`}
            />
          )}
        </FieldBox>
        <FieldBox label="Importer contract ref." htmlFor="importer_contract_nr" prefilled={pre('importer_contract_nr')}>
          <Input
            id="importer_contract_nr"
            value={formData.importer_contract_nr}
            onChange={(e) => updateFormData('importer_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className={tint('importer_contract_nr')}
          />
        </FieldBox>

        {/* A separate QC client only when the importer is not it. */}
        {!formData.importer_is_qc_client && (
          <>
            <FieldBox label="QC client" field="qc_client" prefilled={pre('qc_client')}>
              <SearchableSelect
                options={qcClientOptions.map(c => ({ value: c.fantasy_name!, label: c.fantasy_name! }))}
                value={formData.qc_client || ''}
                onValueChange={(value) => updateFormData('qc_client', value)}
                placeholder="Select QC client"
                searchPlaceholder="Search QC clients..."
                className={tint('qc_client')}
                allowCreate
                createLabel="+ New QC Client"
                onCreateNew={() => {
                  setCreateClientRole('qc_client')
                  setShowCreateClientDialog(true)
                }}
              />
            </FieldBox>
            <FieldBox label="QC client contract ref." htmlFor="qc_client_contract_nr" prefilled={pre('qc_client_contract_nr')}>
              <Input
                id="qc_client_contract_nr"
                value={formData.qc_client_contract_nr}
                onChange={(e) => updateFormData('qc_client_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className={tint('qc_client_contract_nr')}
              />
            </FieldBox>
          </>
        )}

        {/* A linked contract's number is in the wizard's header (Change
            relinks it). Without a link it is typed here, and a match links it. */}
        {!formData.selected_contract && (
          <FieldBox label="Wolthers contract" prefilled={pre('wolthers_contract_nr')}>
            <ContractNumberInput
              value={formData.wolthers_contract_nr}
              onChange={(v) => updateFormData('wolthers_contract_nr', v)}
              onSelectContract={onSelectContractNumber}
              linkedContractId={null}
              className={tint('wolthers_contract_nr', 'h-9 font-mono')}
            />
          </FieldBox>
        )}
      </div>

      {/* The seller ref typed (or prefilled from a PSS) into both boxes. A
          warning, not a block: SAN-00752/26 was stored that way, and a pick of
          it must show the doubt before the SS is saved. */}
      {sellerRefIsImporterRef(formData.seller_contract_nr, formData.importer_contract_nr) && (
        <p className="text-[11px] text-[#b07946]">{SELLER_REF_IS_IMPORTER_REF_WARNING}</p>
      )}

    </SectionCard>
  )

  const modal = (
    <AddClientModal
      open={showCreateClientDialog}
      onOpenChange={setShowCreateClientDialog}
      defaultRole={createClientRole}
      onSuccess={(clientName) => {
        if (createClientRole === 'exporter') {
          updateFormData('seller', clientName)
        } else if (createClientRole === 'importer') {
          updateFormData('importer', clientName)
        } else if (createClientRole === 'roaster') {
          updateFormData('roaster', clientName)
        } else if (createClientRole === 'end_client') {
          updateFormData('end_client', clientName)
        } else if (createClientRole === 'qc_client') {
          updateFormData('qc_client', clientName)
        }
        // Trigger entity list reload so the new entity appears in the dropdown
        onEntityCreated?.(createClientRole as any)
      }}
    />
  )

  return (
    <>
      {part !== 'buyer' && checkCard}
      {part !== 'check' && buyerCard}
      {modal}
    </>
  )
}
