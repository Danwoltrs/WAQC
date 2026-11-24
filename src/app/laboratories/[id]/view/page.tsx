'use client'

import { use } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { LabReadOnlyView } from '@/components/laboratories/lab-read-only-view'

/** Another laboratory, read only: opened by HQ from the eye on the Laboratories page. */
export default function LaboratoryViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <MainLayout>
      <div className="p-6">
        <LabReadOnlyView labId={id} />
      </div>
    </MainLayout>
  )
}
