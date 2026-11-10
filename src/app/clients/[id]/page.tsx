'use client'

import { use } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ClientDetailView } from '@/components/clients/client-detail-view'

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  // The client rail takes the app menu's place; "Back to clients" is in it.
  return (
    <MainLayout replaceSidebar>
      <ClientDetailView clientId={id} />
    </MainLayout>
  )
}
