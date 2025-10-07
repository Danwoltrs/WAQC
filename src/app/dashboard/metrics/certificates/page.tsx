'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export default function CertificateStatisticsPage() {
  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Certificate Statistics</h1>
          <p className="text-lg text-muted-foreground">
            Detailed certificate analytics and export reports
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Coming Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Comprehensive certificate statistics and reporting tools will be available here.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>• Total bags and certificates summary</li>
              <li>• Roasters and Importers distribution charts</li>
              <li>• Detailed data table with all certificate information</li>
              <li>• Date range filters (This Week, This Month, Custom)</li>
              <li>• PDF export with branding (Dunkin-style green theme)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
