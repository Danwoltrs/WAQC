'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Award } from 'lucide-react'

export default function SupplierReviewPage() {
  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Supplier Review</h1>
          <p className="text-lg text-muted-foreground">
            Quarterly performance rankings and analysis
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Coming Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Quarterly supplier performance leaderboard with PSS/SS breakdown will be available here.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>• Supplier rankings by approval rate</li>
              <li>• PSS vs SS performance comparison</li>
              <li>• Color-coded performance indicators</li>
              <li>• Trend charts over time</li>
              <li>• Supplier anonymization for competitors</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
