'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { ClientForm } from '@/components/clients/client-form'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NewClientPage() {
  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Add New Client</h1>
            <p className="text-muted-foreground">
              Create a new client profile with pricing and quality specifications
            </p>
          </div>
        </div>

        {/* Form */}
        <ClientForm mode="create" />
      </div>
    </MainLayout>
  )
}
