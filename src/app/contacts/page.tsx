'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import type { PersonContact } from '@/lib/contacts/people'
import { CompanyPanel } from '@/components/companies/company-panel/company-panel'
import { ContactDialog } from '@/components/clients/client-page/contact-dialog'
import { DirectoryMatrix } from '@/components/contacts-directory/directory-matrix'
import { useDirectory } from '@/components/contacts-directory/use-directory'
import type { DirectoryRole } from '@/components/contacts-directory/types'

const TABS: Array<{ key: DirectoryRole; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'buyers', label: 'Buyers' },
  { key: 'sellers', label: 'Sellers' },
]

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState<DirectoryRole>('all')
  const [openCompany, setOpenCompany] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ companyId: string; companyName: string; contact: PersonContact | null } | null>(null)
  const dir = useDirectory(q, role)

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <MainLayout fullWidth>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[14px] font-semibold">Contacts</h1>
          <div className="relative w-[260px] shrink-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search company, name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 text-[12px]"
            />
          </div>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setRole(t.key)}
              className={cn(
                'h-6 rounded-full border px-2 text-[11px] transition-colors',
                role === t.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
          {!dir.loading && !dir.error && (
            <span className="ml-auto text-[11px] text-muted-foreground/70">
              {dir.total.toLocaleString('en-US')} {dir.total === 1 ? 'company' : 'companies'}
            </span>
          )}
        </div>

        {dir.error ? (
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-red-600 dark:text-red-400">{dir.error}</span>
            <Button variant="outline" size="sm" onClick={dir.reload}>Retry</Button>
          </div>
        ) : dir.companies.length === 0 && dir.loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : dir.companies.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {q ? `Nothing matches "${q}".` : 'No companies in this view.'}
          </p>
        ) : (
          <div className="-mx-6">
            <DirectoryMatrix
              companies={dir.companies}
              pending={dir.pending}
              onOpenCompany={setOpenCompany}
              onOpenContact={(companyId, contact) => {
                const co = dir.companies.find((c) => c.id === companyId)
                setDialog({ companyId, companyName: companyDisplayName(co), contact })
              }}
              onAddContact={(co) => setDialog({ companyId: co.id, companyName: companyDisplayName(co), contact: null })}
              onTogglePurpose={dir.toggle}
            />
            {dir.hasMore && (
              <div className="flex justify-center py-4">
                <Button variant="outline" size="sm" disabled={dir.loading} onClick={dir.loadMore} className="h-8 rounded-[6px] text-[13px]">
                  {dir.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more companies'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {openCompany && (
        <CompanyPanel
          companyId={openCompany}
          open
          initialTab="contacts"
          onOpenChange={(o) => { if (!o) { setOpenCompany(null); dir.reload() } }}
        />
      )}
      {dialog && (
        <ContactDialog
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          companyId={dialog.companyId}
          companyName={dialog.companyName}
          contact={dialog.contact}
          onSaved={() => { setDialog(null); dir.reload() }}
        />
      )}
    </MainLayout>
  )
}
