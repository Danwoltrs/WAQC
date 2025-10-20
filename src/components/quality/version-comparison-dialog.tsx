'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Clock, User, GitCompare, ArrowRight } from 'lucide-react'

interface VersionComparisonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  templateName: string
}

interface TemplateVersion {
  id: string
  version_number: number
  parameters: any
  changes_description: string
  created_by: string
  created_by_name: string
  created_at: string
}

export function VersionComparisonDialog({
  open,
  onOpenChange,
  templateId,
  templateName
}: VersionComparisonDialogProps) {
  const [versions, setVersions] = useState<TemplateVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion1, setSelectedVersion1] = useState<string>('')
  const [selectedVersion2, setSelectedVersion2] = useState<string>('')

  useEffect(() => {
    if (open && templateId) {
      loadVersions()
    }
  }, [open, templateId])

  const loadVersions = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/quality-templates/${templateId}/versions`)
      if (response.ok) {
        const data = await response.json()
        setVersions(data.versions || [])

        // Auto-select the two most recent versions for comparison
        if (data.versions && data.versions.length >= 2) {
          setSelectedVersion1(data.versions[0].id) // Latest
          setSelectedVersion2(data.versions[1].id) // Previous
        } else if (data.versions && data.versions.length === 1) {
          setSelectedVersion1(data.versions[0].id)
          setSelectedVersion2('')
        }
      }
    } catch (error) {
      console.error('Error loading versions:', error)
    } finally {
      setLoading(false)
    }
  }

  const version1 = versions.find(v => v.id === selectedVersion1)
  const version2 = versions.find(v => v.id === selectedVersion2)

  // Helper to detect changes between two parameter sets
  const getParameterDiff = () => {
    if (!version1 || !version2) return []

    const changes: Array<{
      field: string
      oldValue: any
      newValue: any
      changed: boolean
    }> = []

    const allKeys = new Set([
      ...Object.keys(version2.parameters || {}),
      ...Object.keys(version1.parameters || {})
    ])

    allKeys.forEach(key => {
      const oldValue = version2.parameters?.[key]
      const newValue = version1.parameters?.[key]
      const oldStr = JSON.stringify(oldValue)
      const newStr = JSON.stringify(newValue)

      changes.push({
        field: key,
        oldValue,
        newValue,
        changed: oldStr !== newStr
      })
    })

    return changes
  }

  const changes = selectedVersion1 && selectedVersion2 ? getParameterDiff() : []
  const hasChanges = changes.some(c => c.changed)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Version History - {templateName}
          </DialogTitle>
          <DialogDescription>
            View change history and compare different versions of this template
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading version history...
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No version history available
          </div>
        ) : (
          <div className="space-y-6">
            {/* Version History Timeline */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Version History</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {versions.map((version, idx) => (
                  <div
                    key={version.id}
                    className="flex items-start gap-3 text-sm pb-2 border-b last:border-b-0"
                  >
                    <Badge variant={idx === 0 ? 'default' : 'outline'} className="text-xs">
                      v{version.version_number}
                      {idx === 0 && ' (Current)'}
                    </Badge>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{version.created_by_name}</span>
                        <Clock className="h-3 w-3 ml-2" />
                        <span>{new Date(version.created_at).toLocaleString()}</span>
                      </div>
                      {version.changes_description && (
                        <p className="text-xs">{version.changes_description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Version Comparison */}
            {versions.length >= 2 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Compare Versions</h3>

                {/* Version Selectors */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Compare From</label>
                    <Select value={selectedVersion2} onValueChange={setSelectedVersion2}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            v{version.version_number} - {new Date(version.created_at).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <ArrowRight className="h-5 w-5 text-muted-foreground" />

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Compare To</label>
                    <Select value={selectedVersion1} onValueChange={setSelectedVersion1}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            v{version.version_number} - {new Date(version.created_at).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Diff View */}
                {selectedVersion1 && selectedVersion2 && (
                  <div className="border rounded-lg">
                    <div className="bg-muted/30 px-4 py-2 border-b">
                      <h4 className="text-xs font-semibold">
                        {hasChanges ? `${changes.filter(c => c.changed).length} parameter(s) changed` : 'No changes detected'}
                      </h4>
                    </div>
                    <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                      {changes
                        .filter(c => c.changed) // Only show changed fields
                        .map((change, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <div className="text-xs font-medium">{formatFieldName(change.field)}</div>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              {/* Old Value */}
                              <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded">
                                <div className="text-[10px] text-red-600 dark:text-red-400 font-medium mb-1">
                                  v{version2?.version_number}
                                </div>
                                <pre className="text-xs text-red-900 dark:text-red-100 overflow-auto">
                                  {formatValue(change.oldValue)}
                                </pre>
                              </div>

                              {/* New Value */}
                              <div className="p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded">
                                <div className="text-[10px] text-green-600 dark:text-green-400 font-medium mb-1">
                                  v{version1?.version_number}
                                </div>
                                <pre className="text-xs text-green-900 dark:text-green-100 overflow-auto">
                                  {formatValue(change.newValue)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      {!hasChanges && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No differences found between these versions
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper to format field names from snake_case to Title Case
function formatFieldName(field: string): string {
  return field
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Helper to format values for display
function formatValue(value: any): string {
  if (value === undefined || value === null) {
    return 'Not set'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}
