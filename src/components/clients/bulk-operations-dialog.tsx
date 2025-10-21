'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, Upload, FileText, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface BulkOperationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ImportResult {
  success: number
  failed: number
  errors: ValidationError[]
}

export function BulkOperationsDialog({
  open,
  onOpenChange,
  onSuccess
}: BulkOperationsDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleExport = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/clients/export')

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to export clients')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clients_export_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Export successful',
        description: 'Clients have been exported to CSV'
      })
    } catch (error: any) {
      console.error('Export error:', error)
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to export clients',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadTemplate = () => {
    const template = `name,company,fantasy_name,email,phone,address,city,state,country,is_qc_client,client_type,pricing_model,price_per_sample,currency,payment_terms,certificate_delivery_timing,billing_notes
John Doe,Acme Coffee Corp,Acme,john@acme.com,+1234567890,"123 Coffee St",Santos,SP,Brazil,true,Exporter,per_sample,50.00,USD,Net 30,immediate,
Jane Smith,Best Roasters,Best,jane@best.com,+0987654321,"456 Roast Ave",New York,NY,USA,true,Roaster,per_pound,2.50,USD,Net 45,on_approval,Volume discount applies`

    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clients_import_template.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    toast({
      title: 'Template downloaded',
      description: 'Use this template to prepare your client import file'
    })
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select a CSV file',
          variant: 'destructive'
        })
        return
      }
      setSelectedFile(file)
      setImportResult(null)
    }
  }

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a CSV file to import',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    setProgress(0)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const response = await fetch('/api/clients/import', {
        method: 'POST',
        body: formData
      })

      clearInterval(progressInterval)
      setProgress(100)

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Import failed')
      }

      setImportResult(result)

      if (result.success > 0) {
        toast({
          title: 'Import completed',
          description: `Successfully imported ${result.success} client(s). ${result.failed > 0 ? `${result.failed} failed.` : ''}`
        })

        if (result.failed === 0) {
          onSuccess?.()
        }
      } else {
        toast({
          title: 'Import failed',
          description: 'No clients were imported. Please check the errors below.',
          variant: 'destructive'
        })
      }
    } catch (error: any) {
      console.error('Import error:', error)
      toast({
        title: 'Import failed',
        description: error.message || 'Failed to import clients',
        variant: 'destructive'
      })
      setImportResult({
        success: 0,
        failed: 0,
        errors: [{ row: 0, field: 'general', message: error.message }]
      })
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setImportResult(null)
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Operations</DialogTitle>
          <DialogDescription>
            Export, import, or bulk update client data
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="export" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4">
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <Download className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-medium">Export All Clients</h4>
                  <p className="text-sm text-muted-foreground">
                    Download all clients as a CSV file including all fields
                  </p>
                </div>
                <Button
                  onClick={handleExport}
                  disabled={loading}
                  variant="outline"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Export CSV
                </Button>
              </div>

              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-medium">Download Template</h4>
                  <p className="text-sm text-muted-foreground">
                    Get a CSV template with example data for importing clients
                  </p>
                </div>
                <Button
                  onClick={handleDownloadTemplate}
                  variant="outline"
                >
                  Download Template
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <div className="space-y-4 py-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Import clients from a CSV file. Duplicate emails will be skipped.
                  Required fields: name, company, email, address.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="flex-1"
                    disabled={loading}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {selectedFile ? selectedFile.name : 'Select CSV File'}
                  </Button>
                  {selectedFile && (
                    <Button
                      onClick={handleReset}
                      variant="ghost"
                      size="icon"
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {loading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Importing clients...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                {importResult && (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1 p-4 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <div>
                            <div className="font-medium">{importResult.success}</div>
                            <div className="text-sm text-muted-foreground">Successful</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 p-4 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-600" />
                          <div>
                            <div className="font-medium">{importResult.failed}</div>
                            <div className="text-sm text-muted-foreground">Failed</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {importResult.errors.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Errors:</h4>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {importResult.errors.map((error, index) => (
                            <Alert key={index} variant="destructive">
                              <AlertDescription className="text-sm">
                                Row {error.row}: {error.field} - {error.message}
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={!selectedFile || loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import Clients
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
