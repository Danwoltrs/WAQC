'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CompanyRecord } from '@/lib/company-register/company-schema'
import { GeneralSection } from './general-section'
import { RegisterSection } from './register-section'

export function useCompany(companyId: string) {
  const [company, setCompany] = useState<CompanyRecord | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setCompany(null); setError(null)
    fetch(`/api/companies/${companyId}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((j) => { if (live) { setCompany(j.company); setCanEdit(j.canEditCompany === true) } })
      .catch(() => { if (live) setError('The company could not be loaded.') })
    return () => { live = false }
  }, [companyId])
  const saved = useCallback((c: CompanyRecord) => setCompany(c), [])
  return { company, canEdit, error, saved }
}

const H = 'text-sm font-semibold'

/** General and Holders/accounts one under the other: the client page's "Company and bank" tab. */
export function CompanyDetails({ companyId }: { companyId: string }) {
  const { company, canEdit, error, saved } = useCompany(companyId)
  if (error) return <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
  if (!company) return <p className="text-sm text-muted-foreground">Loading...</p>
  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-[10px] border border-border p-6">
        <h2 className={H}>General</h2>
        <GeneralSection key={JSON.stringify(company)} company={company} canEdit={canEdit} onSaved={saved} />
      </section>
      <section className="space-y-3 rounded-[10px] border border-border p-6">
        <h2 className={H}>Holders and bank accounts</h2>
        <RegisterSection companyId={companyId} country={company.country} />
      </section>
    </div>
  )
}
