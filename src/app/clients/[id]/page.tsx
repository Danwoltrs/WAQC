'use client'

import { use } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ClientDetailView } from '@/components/clients/client-detail-view'
import { Button } from '@/components/ui/button'
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
      <div className="p-6 space-y-6">
        {/* Back Button */}
        <Link href="/clients">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
        </Link>

        {/* Client Detail View */}
        <ClientDetailView clientId={id} />
      </div>
    </MainLayout>
  )
}
