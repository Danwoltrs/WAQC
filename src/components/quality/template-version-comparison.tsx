'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { GitCompare, ArrowRight, Plus, Minus, AlertCircle } from 'lucide-react'

interface TemplateVersion {
  id: string
  version_number: number
  parameters: any
  changes_description: string | null
  created_at: string
  created_by_name?: string
}

interface VersionComparisonProps {
  versions: TemplateVersion[]
  currentVersion?: number
}

interface DiffResult {
  path: string
  type: 'added' | 'removed' | 'modified'
  oldValue?: any
  newValue?: any
}

export function TemplateVersionComparison({
  versions,
  currentVersion
}: VersionComparisonProps) {
  const [leftVersion, setLeftVersion] = useState<string>('')
  const [rightVersion, setRightVersion] = useState<string>('')
  const [diffs, setDiffs] = useState<DiffResult[]>([])

  const compareVersions = () => {
    const left = versions.find(v => v.id === leftVersion)
    const right = versions.find(v => v.id === rightVersion)

    if (!left || !right) return

    const differences = findDifferences(left.parameters, right.parameters, '')
    setDiffs(differences)
  }

  const findDifferences = (
    obj1: any,
    obj2: any,
    path: string = ''
  ): DiffResult[] => {
    const results: DiffResult[] = []

    // Check all keys in obj1
    Object.keys(obj1 || {}).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key
      const val1 = obj1[key]
      const val2 = obj2?.[key]

      if (!(key in (obj2 || {}))) {
        // Key removed
        results.push({
          path: currentPath,
          type: 'removed',
          oldValue: val1
        })
      } else if (typeof val1 === 'object' && val1 !== null && !Array.isArray(val1)) {
        // Recursively check nested objects
        results.push(...findDifferences(val1, val2, currentPath))
      } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        // Value modified
        results.push({
          path: currentPath,
          type: 'modified',
          oldValue: val1,
          newValue: val2
        })
      }
    })

    // Check for added keys in obj2
    Object.keys(obj2 || {}).forEach(key => {
      if (!(key in (obj1 || {}))) {
        const currentPath = path ? `${path}.${key}` : key
        results.push({
          path: currentPath,
          type: 'added',
          newValue: obj2[key]
        })
      }
    })

    return results
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
  }

  const getDiffIcon = (type: string) => {
    switch (type) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />
      case 'modified':
        return <ArrowRight className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  const getDiffColor = (type: string) => {
    switch (type) {
      case 'added':
        return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
      case 'removed':
        return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
      case 'modified':
        return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
      default:
        return ''
    }
  }

  const leftVersionData = versions.find(v => v.id === leftVersion)
  const rightVersionData = versions.find(v => v.id === rightVersion)
  const canCompare = leftVersionData && rightVersionData && leftVersion !== rightVersion

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="h-5 w-5" />
          Compare Versions
        </CardTitle>
        <CardDescription>
          Select two versions to see what changed between them
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Version Selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Base Version</label>
            <Select value={leftVersion} onValueChange={setLeftVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    <div className="flex items-center gap-2">
                      v{version.version_number}
                      {version.version_number === currentVersion && (
                        <Badge variant="outline" className="ml-2">Current</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Compare With</label>
            <Select value={rightVersion} onValueChange={setRightVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    <div className="flex items-center gap-2">
                      v{version.version_number}
                      {version.version_number === currentVersion && (
                        <Badge variant="outline" className="ml-2">Current</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={compareVersions}
          disabled={!canCompare}
          className="w-full"
        >
          <GitCompare className="h-4 w-4 mr-2" />
          Compare Versions
        </Button>

        {/* Comparison Results */}
        {diffs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  Changes: {leftVersionData?.version_number} → {rightVersionData?.version_number}
                </h4>
                <Badge variant="secondary">{diffs.length} changes</Badge>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {diffs.map((diff, index) => (
                    <div
                      key={index}
                      className={`border rounded-lg p-4 ${getDiffColor(diff.type)}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{getDiffIcon(diff.type)}</div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono bg-background/50 px-2 py-1 rounded">
                              {diff.path}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {diff.type}
                            </Badge>
                          </div>

                          {diff.type === 'modified' && (
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-medium mb-1 text-red-600 dark:text-red-400">
                                  Old Value
                                </div>
                                <pre className="bg-background/50 p-2 rounded overflow-auto max-h-32">
                                  {formatValue(diff.oldValue)}
                                </pre>
                              </div>
                              <div>
                                <div className="font-medium mb-1 text-green-600 dark:text-green-400">
                                  New Value
                                </div>
                                <pre className="bg-background/50 p-2 rounded overflow-auto max-h-32">
                                  {formatValue(diff.newValue)}
                                </pre>
                              </div>
                            </div>
                          )}

                          {diff.type === 'added' && (
                            <div className="text-xs">
                              <div className="font-medium mb-1 text-green-600 dark:text-green-400">
                                Added
                              </div>
                              <pre className="bg-background/50 p-2 rounded overflow-auto max-h-32">
                                {formatValue(diff.newValue)}
                              </pre>
                            </div>
                          )}

                          {diff.type === 'removed' && (
                            <div className="text-xs">
                              <div className="font-medium mb-1 text-red-600 dark:text-red-400">
                                Removed
                              </div>
                              <pre className="bg-background/50 p-2 rounded overflow-auto max-h-32">
                                {formatValue(diff.oldValue)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {diffs.length === 0 && leftVersion && rightVersion && leftVersion !== rightVersion && (
          <div className="flex items-start gap-2 p-4 border rounded-lg bg-muted/50">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">No differences found</p>
              <p className="text-muted-foreground">
                The selected versions have identical parameters
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
