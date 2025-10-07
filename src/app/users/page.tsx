'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { AccessRequestsManager } from '@/components/admin/access-requests-manager'

export default function UsersPage() {
  return (
    <MainLayout>
      <div className="p-6">
        <AccessRequestsManager />
      </div>
    </MainLayout>
  )
}
