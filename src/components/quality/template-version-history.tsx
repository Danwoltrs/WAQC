'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Clock,
  User,
  History,
  Eye,
  RotateCcw,
  GitCompare,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface TemplateVersion {
  id: string
  template_id: string
  version_number: number
  parameters: any
  changes_description: string | null
  created_by: string
  created_by_name?: string
  created_at: string
}

interface TemplateVersionHistoryProps {
  templateId: string
  currentVersion?: number
  onRestoreVersion?: (versionId: string, versionNumber: number) => Promise<void>
}

export function TemplateVersionHistory({
  templateId,
  currentVersion,
  onRestoreVersion
}: TemplateVersionHistoryProps) {
  const [versions, setVersions] = useState<TemplateVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<TemplateVersion | null>(null)
  const [compareVersion, setCompareVersion] = useState<TemplateVersion | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    fetchVersionHistory()
  }, [templateId])

  const fetchVersionHistory = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/quality-templates/${templateId}/versions`)

      if (!response.ok) {
        throw new Error('Failed to fetch version history')
      }

      const data = await response.json()
      setVersions(data.versions || [])
    } catch (error) {
      console.error('Error fetching version history:', error)
      toast.error('Failed to load version history')
    } finally {
      setLoading(false)
    }
  }

  const handleRestoreVersion = async (version: TemplateVersion) => {
    if (!onRestoreVersion) return

    try {
      setRestoring(true)
      await onRestoreVersion(version.id, version.version_number)
      toast.success(`Restored to version ${version.version_number}`)
      await fetchVersionHistory()
    } catch (error) {
      console.error('Error restoring version:', error)
      toast.error('Failed to restore version')
    } finally {
      setRestoring(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'PPp')
    } catch {
      return dateString
    }
  }

  const getVersionBadgeColor = (version: TemplateVersion) => {
    if (version.version_number === currentVersion) {
      return 'default'
    }
    return 'secondary'
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No version history available
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Version History
        </CardTitle>
        <CardDescription>
          View and restore previous versions of this template
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {versions.map((version, index) => (
              <div key={version.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getVersionBadgeColor(version)}>
                        v{version.version_number}
                      </Badge>
                      {version.version_number === currentVersion && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Current
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm">
                      {version.changes_description || 'No description provided'}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.created_by_name || 'Unknown'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(version.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedVersion(version)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            Version {version.version_number} Details
                          </DialogTitle>
                          <DialogDescription>
                            {formatDate(version.created_at)} by {version.created_by_name || 'Unknown'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Changes</h4>
                            <p className="text-sm text-muted-foreground">
                              {version.changes_description || 'No description provided'}
                            </p>
                          </div>
                          <Separator />
                          <div>
                            <h4 className="text-sm font-medium mb-2">Parameters</h4>
                            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-96">
                              {JSON.stringify(version.parameters, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {version.version_number !== currentVersion && onRestoreVersion && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Restore
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Restore Version {version.version_number}?</DialogTitle>
                            <DialogDescription>
                              This will restore the template to version {version.version_number}.
                              A new version will be created to preserve history.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="flex items-start gap-2 text-sm">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                              <div>
                                <p className="font-medium">Warning</p>
                                <p className="text-muted-foreground">
                                  This action will overwrite the current template configuration.
                                  Make sure you want to proceed.
                                </p>
                              </div>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline">Cancel</Button>
                            <Button
                              onClick={() => handleRestoreVersion(version)}
                              disabled={restoring}
                            >
                              {restoring && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Restore Version
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
                {index < versions.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
