'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClientPeopleTab } from '@/components/clients/client-page/client-people-tab'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { GeneralSection } from './general-section'
import { RegisterSection } from './register-section'
import { useCompany } from './company-details'

type PanelTab = 'general' | 'register' | 'contacts'

/** One company, completely: its details, holders and bank accounts, and contacts. */
export function CompanyPanel({
  companyId, open, onOpenChange, initialTab = 'general',
}: { companyId: string; open: boolean; onOpenChange: (open: boolean) => void; initialTab?: PanelTab }) {
  const [tab, setTab] = useState<PanelTab>(initialTab)
  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])
  const { company, canEdit, error, saved } = useCompany(companyId)
  const name = companyDisplayName(company) || 'Company'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-[10px]">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="sr-only">Company details, holders and bank accounts, and contacts</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        {!error && !company && <p className="text-sm text-muted-foreground">Loading...</p>}
        {company && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)}>
            <TabsList className="h-auto gap-6 rounded-none border-b border-border bg-transparent p-0">
              {([['general', 'General'], ['register', 'Holders and bank accounts'], ['contacts', 'Contacts']] as const).map(([v, l]) => (
                <TabsTrigger key={v} value={v}
                  className="-mb-px rounded-none border-b-2 border-transparent px-0 py-2 text-[13px] font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none">
                  {l}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="pt-4">
              <TabsContent value="general" className="mt-0">
                <GeneralSection key={JSON.stringify(company)} company={company} canEdit={canEdit} onSaved={saved} />
              </TabsContent>
              <TabsContent value="register" className="mt-0">
                <RegisterSection companyId={companyId} country={company.country} />
              </TabsContent>
              <TabsContent value="contacts" className="mt-0">
                <ClientPeopleTab companyId={companyId} companyName={name} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
