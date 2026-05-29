'use client'

import { use } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ClientDetailView } from '@/components/clients/client-detail-view'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <MainLayout>
      <div className="max-w-[1080px] px-6 py-8">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="h-[15px] w-[15px]" />
          Back to clients
        </Link>
        <ClientDetailView clientId={id} />
      </div>
    </MainLayout>
  )
}
