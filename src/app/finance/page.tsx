'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, DollarSign, TrendingUp, AlertCircle, Building, Users } from 'lucide-react'

interface LabPaymentSummary {
  laboratory_id: string
  laboratory_name: string
  laboratory_type: string
  total_samples: number
  total_owed_amount: string
  total_potential_amount: string
  avg_fee_per_sample: string
}

interface LabBreakdown {
  laboratory_id: string
  laboratory_name: string
  laboratory_type: string
  total_samples: number
  approved_samples: number
  rejected_samples: number
  pending_samples: number
  approval_rate: number
}

interface ClientBilling {
  client_id: string
  client_name: string
  fantasy_name: string | null
  has_origin_pricing: boolean
  total_samples: number
  total_billable_amount: string
  total_potential_amount: string
  avg_price_per_sample: string
}

export default function FinancePage() {
  const [labPayments, setLabPayments] = useState<LabPaymentSummary[]>([])
  const [labBreakdown, setLabBreakdown] = useState<LabBreakdown[]>([])
  const [clientBilling, setClientBilling] = useState<ClientBilling[]>([])
  const [loading, setLoading] = useState(true)
  const [labTotals, setLabTotals] = useState({
    total_labs: 0,
    total_samples: 0,
    total_owed: 0,
    total_potential: 0,
  })
  const [clientTotals, setClientTotals] = useState({
    total_clients: 0,
    total_samples: 0,
    total_billable: 0,
    total_potential: 0,
  })

  useEffect(() => {
    loadFinanceData()
  }, [])

  const loadFinanceData = async () => {
    try {
      setLoading(true)

      // Load all finance data in parallel
      const [labPaymentsRes, labBreakdownRes, clientBillingRes] = await Promise.all([
        fetch('/api/finance/reports/lab-payments'),
        fetch('/api/finance/reports/lab-breakdown'),
        fetch('/api/finance/reports/client-billing'),
      ])

      if (labPaymentsRes.ok) {
        const data = await labPaymentsRes.json()
        setLabPayments(data.laboratories || [])
        setLabTotals({
          total_labs: data.totals?.total_labs || 0,
          total_samples: data.totals?.total_samples || 0,
          total_owed: data.totals?.total_owed || 0,
          total_potential: data.totals?.total_potential || 0,
        })
      }

      if (labBreakdownRes.ok) {
        const data = await labBreakdownRes.json()
        setLabBreakdown(data.laboratories || [])
      }

      if (clientBillingRes.ok) {
        const data = await clientBillingRes.json()
        setClientBilling(data.clients || [])
        setClientTotals({
          total_clients: data.totals?.total_clients || 0,
          total_samples: data.totals?.total_samples || 0,
          total_billable: data.totals?.total_billable || 0,
          total_potential: data.totals?.total_potential || 0,
        })
      }
    } catch (error) {
      console.error('Error loading finance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finance Dashboard</h1>
          <p className="text-muted-foreground">
            Financial overview of lab payments and client billing
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Owed to Labs</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(labTotals.total_owed)}</div>
              <p className="text-xs text-muted-foreground">
                From {labTotals.total_samples.toLocaleString()} samples
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Potential Lab Costs</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(labTotals.total_potential)}</div>
              <p className="text-xs text-muted-foreground">
                If all pending samples are approved
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Billable to Clients</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(clientTotals.total_billable)}</div>
              <p className="text-xs text-muted-foreground">
                From {clientTotals.total_clients} active clients
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Revenue (Est.)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(clientTotals.total_billable - labTotals.total_owed)}
              </div>
              <p className="text-xs text-muted-foreground">
                Client billing minus lab costs
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Reports */}
        <Tabs defaultValue="lab-payments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lab-payments">Lab Payments</TabsTrigger>
            <TabsTrigger value="lab-breakdown">Lab Performance</TabsTrigger>
            <TabsTrigger value="client-billing">Client Billing</TabsTrigger>
          </TabsList>

          {/* Lab Payments Tab */}
          <TabsContent value="lab-payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>3rd Party Laboratory Payments</CardTitle>
                <CardDescription>
                  Amount owed to external laboratories based on completed samples
                </CardDescription>
              </CardHeader>
              <CardContent>
                {labPayments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No 3rd party lab payment data available</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Laboratory</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Samples</TableHead>
                        <TableHead className="text-right">Avg Fee/Sample</TableHead>
                        <TableHead className="text-right">Amount Owed</TableHead>
                        <TableHead className="text-right">Potential Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labPayments.map((lab) => (
                        <TableRow key={lab.laboratory_id}>
                          <TableCell className="font-medium">{lab.laboratory_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {lab.laboratory_type === 'hq' ? 'HQ' : 'Lab'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {lab.total_samples.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(lab.avg_fee_per_sample)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(lab.total_owed_amount)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(lab.total_potential_amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lab Breakdown Tab */}
          <TabsContent value="lab-breakdown" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Laboratory Sample Breakdown</CardTitle>
                <CardDescription>
                  Sample counts and approval rates by laboratory
                </CardDescription>
              </CardHeader>
              <CardContent>
                {labBreakdown.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No lab breakdown data available</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Laboratory</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Total Samples</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Rejected</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead className="text-right">Approval Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labBreakdown.map((lab) => (
                        <TableRow key={lab.laboratory_id}>
                          <TableCell className="font-medium">{lab.laboratory_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {lab.laboratory_type === 'hq' ? 'HQ' : 'Lab'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {lab.total_samples.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {lab.approved_samples.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {lab.rejected_samples.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-amber-600">
                            {lab.pending_samples.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                lab.approval_rate >= 90
                                  ? 'default'
                                  : lab.approval_rate >= 75
                                  ? 'secondary'
                                  : 'destructive'
                              }
                            >
                              {formatPercentage(lab.approval_rate)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Client Billing Tab */}
          <TabsContent value="client-billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Client Billing Summary</CardTitle>
                <CardDescription>
                  Billable amounts by client based on their pricing models
                </CardDescription>
              </CardHeader>
              <CardContent>
                {clientBilling.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No client billing data available</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Pricing</TableHead>
                        <TableHead className="text-right">Samples</TableHead>
                        <TableHead className="text-right">Avg Price/Sample</TableHead>
                        <TableHead className="text-right">Billable Amount</TableHead>
                        <TableHead className="text-right">Potential Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientBilling.map((client) => (
                        <TableRow key={client.client_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{client.fantasy_name || client.client_name}</p>
                              {client.fantasy_name && (
                                <p className="text-xs text-muted-foreground">{client.client_name}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {client.has_origin_pricing ? (
                              <Badge variant="secondary">Multi-Origin</Badge>
                            ) : (
                              <Badge variant="outline">Standard</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {client.total_samples.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(client.avg_price_per_sample)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(client.total_billable_amount)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(client.total_potential_amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
