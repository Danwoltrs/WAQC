'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { StandbyView } from '@/components/certificates/standby-view'

/** Pre-certificates waiting for their container. */
export default function StandbyPage() {
  return (
    <MainLayout>
      <div className="p-6">
        <StandbyView />
      </div>
    </MainLayout>
  )
}
