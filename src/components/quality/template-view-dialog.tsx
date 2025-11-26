'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Edit, X } from 'lucide-react'
import { TemplateBuilder } from './template-builder'
import { TemplateVersionHistory } from './template-version-history'

interface Template {
  id: string
  name_en: string
  name_pt?: string
  name_es?: string
  description_en?: string
  description_pt?: string
  description_es?: string
  name?: string
  description?: string
  version: number
  parameters: any
  is_active: boolean
  is_global: boolean
  laboratory_id?: string | null
  laboratory?: {
    id: string
    name: string
    code: string
  } | null
  assigned_laboratories?: string[]
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at: string
  updated_by?: string
  updated_by_name?: string
  usage_count?: number
  assigned_clients?: Array<{ id: string; name: string; fantasy_name: string; company: string; custom_name: string }>
}

interface TemplateViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: Template | null
  onSave: (templateData: any) => Promise<void>
  onTemplateUpdated?: () => void
}

export function TemplateViewDialog({
  open,
  onOpenChange,
  template,
  onSave,
  onTemplateUpdated,
}: TemplateViewDialogProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [activeTab, setActiveTab] = useState('view')

  if (!template) return null

  // Helper functions
  const getTemplateName = (t: Template) => t.name_en || t.name || ''
  const getTemplateDescription = (t: Template) => t.description_en || t.description || ''

  const getGreenAspectMinLabel = (t: Template) => {
    const config = t.parameters.green_aspect_configuration
    if (!config?.validation?.min_acceptable_value || !config?.wordings) return '-'
    const wording = config.wordings.find((w: any) => w.value === config.validation?.min_acceptable_value)
    return wording?.label || '-'
  }

  const getRoastAspectMinLabel = (t: Template) => {
    const config = t.parameters.roast_aspect_configuration
    if (!config?.validation?.min_acceptable_value || !config?.wordings) return '-'
    const wording = config.wordings.find((w: any) => w.value === config.validation?.min_acceptable_value)
    return wording?.label || '-'
  }

  const handleSave = async (templateData: any) => {
    await onSave(templateData)
    setIsEditMode(false)
    setActiveTab('view')
    if (onTemplateUpdated) {
      onTemplateUpdated()
    }
  }

  const handleCancel = () => {
    setIsEditMode(false)
    setActiveTab('view')
  }

  const handleClose = () => {
    setIsEditMode(false)
    setActiveTab('view')
    onOpenChange(false)
  }

  const params = template.parameters

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl">{getTemplateName(template)}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{getTemplateDescription(template)}</p>
            </div>
            {!isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditMode(true)}
                className="ml-4"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        {isEditMode ? (
          <div className="mt-4">
            <TemplateBuilder
              template={template}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="view">Quick View</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="view" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  {/* Basic Info - Horizontal Layout */}
                  <div className="grid grid-cols-4 gap-4 pb-4 border-b">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Origin</div>
                      <div className="font-medium">{(params as any).origin || 'Not specified'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Micro-origins</div>
                      <div className="font-medium">
                        {(params as any).micro_origins?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(params as any).micro_origins.slice(0, 2).map((mo: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs px-1 py-0">
                                {mo}
                              </Badge>
                            ))}
                            {(params as any).micro_origins.length > 2 && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                +{(params as any).micro_origins.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : 'Any'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Created by</div>
                      <div className="font-medium text-sm">{template.created_by_name || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{new Date(template.created_at).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Version</div>
                      <Badge variant="outline">v{template.version}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-4">
                    {/* Left Column */}
                    <div className="space-y-4">
                      {/* Screen Size Requirements */}
                      <div className="pb-4 border-b">
                        <h3 className="text-sm font-semibold mb-3">Screen Size Requirements</h3>
                        {params.screen_size_requirements?.constraints?.length ? (
                          <div className="space-y-1">
                            {[...params.screen_size_requirements.constraints]
                              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                              .map((c, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="font-mono font-medium">{c.screen_size}</span>
                                  <span className="text-muted-foreground">
                                    {c.constraint_type === 'minimum' && `≥ ${c.min_value}%`}
                                    {c.constraint_type === 'maximum' && `≤ ${c.max_value}%`}
                                    {c.constraint_type === 'range' && `${c.min_value}-${c.max_value}%`}
                                    {c.constraint_type === 'any' && 'any'}
                                  </span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not configured</p>
                        )}
                      </div>

                      {/* Defect Thresholds */}
                      <div className="pb-4 border-b">
                        <h3 className="text-sm font-semibold mb-3">Defect Thresholds</h3>
                        {params.defect_configuration?.thresholds ? (
                          <div className="space-y-1 text-xs">
                            {params.defect_configuration.thresholds.max_primary !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Primary</span>
                                <span className="font-medium">≤ {params.defect_configuration.thresholds.max_primary}</span>
                              </div>
                            )}
                            {params.defect_configuration.thresholds.max_secondary !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Secondary</span>
                                <span className="font-medium">≤ {params.defect_configuration.thresholds.max_secondary}</span>
                              </div>
                            )}
                            {params.defect_configuration.thresholds.max_total !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Total</span>
                                <span className="font-medium">≤ {params.defect_configuration.thresholds.max_total}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not configured</p>
                        )}
                      </div>

                      {/* Moisture & Quakers */}
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Physical Properties</h3>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Moisture Range</span>
                            <span className="font-medium">
                              {params.moisture_min || '-'}% - {params.moisture_max || '-'}%
                            </span>
                          </div>
                          {params.max_quakers !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Max Quakers</span>
                              <span className="font-medium">
                                ≤ {params.max_quakers} per {params.roast_sample_size_grams || 300}g
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4 border-l pl-6">
                      {/* Cupping Attributes */}
                      <div className="pb-4 border-b">
                        <h3 className="text-sm font-semibold mb-3">
                          Cupping Attributes ({params.cupping_attributes?.length || 0})
                        </h3>
                        {params.cupping_attributes?.length ? (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {params.cupping_attributes.map((attr: any, idx: number) => (
                              <div key={idx} className="text-xs">
                                <div className="font-medium">{attr.attribute}</div>
                                <div className="text-muted-foreground ml-2">
                                  {attr.scale.type === 'numeric'
                                    ? `${attr.scale.min}-${attr.scale.max} (step ${attr.scale.increment})`
                                    : `${attr.scale.options?.length || 0} wording levels`}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not configured</p>
                        )}
                      </div>

                      {/* Taints & Faults */}
                      <div className="pb-4 border-b">
                        <h3 className="text-sm font-semibold mb-3">Taints & Faults</h3>
                        {params.taint_fault_configuration ? (
                          <div className="space-y-2 text-xs">
                            {params.taint_fault_configuration.rules?.zero_tolerance ? (
                              <Badge variant="destructive" className="text-xs">Zero Tolerance</Badge>
                            ) : (
                              <>
                                {params.taint_fault_configuration.taints?.length > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Taints</span>
                                    <span className="font-medium">{params.taint_fault_configuration.taints.length} defined</span>
                                  </div>
                                )}
                                {params.taint_fault_configuration.faults?.length > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Faults</span>
                                    <span className="font-medium">{params.taint_fault_configuration.faults.length} defined</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not configured</p>
                        )}
                      </div>

                      {/* Aspects */}
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Visual Aspects</h3>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Green Aspect</span>
                            <span className="font-medium">
                              {params.green_aspect_configuration?.wordings?.length || 0} levels
                              {params.green_aspect_configuration?.validation?.min_acceptable_value &&
                                ` (min: ${getGreenAspectMinLabel(template)})`}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Roast Aspect</span>
                            <span className="font-medium">
                              {params.roast_aspect_configuration?.wordings?.length || 0} levels
                              {params.roast_aspect_configuration?.validation?.min_acceptable_value &&
                                ` (min: ${getRoastAspectMinLabel(template)})`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <TemplateVersionHistory templateId={template.id} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
