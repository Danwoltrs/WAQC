'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, X, Settings2, CheckCircle2, Copy } from 'lucide-react'
import { ScaleBuilder } from './scale-builder'
import { AttributeScaleType } from '@/types/attribute-scales'
import {
  CUPPING_ATTRIBUTE_TEMPLATES,
  type CuppingAttributeTemplate
} from '@/types/cupping-templates'

export interface AttributeWithScale {
  attribute: string
  scale: AttributeScaleType
}

interface CuppingAttributeConfigManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: AttributeWithScale[]
  onChange: (attributes: AttributeWithScale[]) => void
}

export function CuppingAttributeConfigManager({
  open,
  onOpenChange,
  value,
  onChange
}: CuppingAttributeConfigManagerProps) {
  const [attributes, setAttributes] = useState<AttributeWithScale[]>(value)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const handleSave = () => {
    onChange(attributes)
    onOpenChange(false)
  }

  const handleCancel = () => {
    setAttributes(value) // Reset to original
    setEditingIndex(null)
    onOpenChange(false)
  }

  const handleLoadTemplate = (templateId: string) => {
    const template = CUPPING_ATTRIBUTE_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setAttributes(template.attributes)
    }
  }

  const handleAddAttribute = () => {
    const newAttr: AttributeWithScale = {
      attribute: `New Attribute ${attributes.length + 1}`,
      scale: {
        type: 'numeric',
        min: 0,
        max: 10,
        increment: 0.25
      }
    }
    setAttributes([...attributes, newAttr])
  }

  const handleRemoveAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  const handleUpdateAttribute = (index: number, updates: Partial<AttributeWithScale>) => {
    setAttributes(attributes.map((attr, i) => (i === index ? { ...attr, ...updates } : attr)))
  }

  const handleUpdateAttributeScale = (index: number, scale: AttributeScaleType) => {
    handleUpdateAttribute(index, { scale })
  }

  const handleDuplicateAttribute = (index: number) => {
    const attr = attributes[index]
    const newAttr: AttributeWithScale = {
      ...attr,
      attribute: `${attr.attribute} (Copy)`
    }
    setAttributes([...attributes, newAttr])
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Fixed Header */}
          <div className="shrink-0 border-b px-6 py-4 bg-background">
            <DialogHeader>
              <DialogTitle>Cupping Attributes Configuration</DialogTitle>
              <DialogDescription>
                Configure sensory attributes and their scoring scales for cupping sessions
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0">
            {/* Template Selector */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Templates</CardTitle>
                <CardDescription>Start with a predefined cupping template</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Load from Template</Label>
                  <Select onValueChange={handleLoadTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a cupping template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CUPPING_ATTRIBUTE_TEMPLATES.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{template.name}</span>
                            {template.description && (
                              <span className="text-xs text-muted-foreground">
                                {template.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose SCA, COE, Brazil Traditional, or start from scratch
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Attributes List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Cupping Attributes</CardTitle>
                    <CardDescription>
                      Define sensory attributes with their scoring scales
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleAddAttribute}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Attribute
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {attributes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No attributes configured yet</p>
                    <p className="text-xs mt-1">Click &quot;Add Attribute&quot; or load a template</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {attributes.map((attr, index) => (
                      <Card key={index} className="relative">
                        <button
                          onClick={() => handleRemoveAttribute(index)}
                          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors z-10"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <CardHeader className="pb-3">
                          <Input
                            value={attr.attribute}
                            onChange={(e) =>
                              handleUpdateAttribute(index, { attribute: e.target.value })
                            }
                            placeholder="Attribute name..."
                            className="h-8 text-sm font-medium pr-6"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {attr.scale.type === 'numeric' ? 'Numeric' : 'Wording'}
                            </Badge>
                            {attr.scale.type === 'numeric' ? (
                              <span className="text-xs text-muted-foreground">
                                {attr.scale.min}-{attr.scale.max} (step {attr.scale.increment})
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {attr.scale.options?.length || 0} options
                              </span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                              className="flex-1 h-8 text-xs"
                            >
                              <Settings2 className="h-3 w-3 mr-1" />
                              {editingIndex === index ? 'Hide' : 'Edit'} Scale
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicateAttribute(index)}
                              className="h-8"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scale Editor (shown when editing) */}
            {editingIndex !== null && (
              <Card className="border-2 border-primary">
                <CardHeader>
                  <CardTitle className="text-sm">
                    Editing Scale: {attributes[editingIndex].attribute}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScaleBuilder
                    value={attributes[editingIndex].scale}
                    onChange={(scale) => handleUpdateAttributeScale(editingIndex, scale)}
                    showTemplateSelector={true}
                  />
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Configuration Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Total Attributes</Label>
                    <p className="text-lg font-semibold">{attributes.length}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Numeric Scales</Label>
                    <p className="text-lg font-semibold">
                      {attributes.filter(a => a.scale.type === 'numeric').length}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Wording Scales</Label>
                    <p className="text-lg font-semibold">
                      {attributes.filter(a => a.scale.type === 'wording').length}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Total Score</Label>
                    <p className="text-lg font-semibold">
                      {attributes
                        .filter(a => a.scale.type === 'numeric')
                        .reduce((sum, a) => sum + (a.scale.type === 'numeric' ? a.scale.max : 0), 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fixed Footer */}
          <div className="shrink-0 border-t px-6 py-4 bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
