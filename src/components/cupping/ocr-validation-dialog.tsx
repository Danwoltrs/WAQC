'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Save, AlertCircle, CheckCircle2, User, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExtractedScore {
  cupper_id: string
  cupper_name: string
  ocr_name?: string
  scores: Record<string, number>
  confidence: number
}

interface AssignedCupper {
  id: string
  name: string
}

interface ExtractedCard {
  imagePreview: string
  qr_data: {
    sample_id: string
    tracking_number: string
    type: string
  }
  sample: {
    id: string
    tracking_number: string
    sample_type: string
    quality_template: {
      id: string
      name: string
      parameters: any
    }
  }
  extracted_scores: ExtractedScore[]
  assigned_cuppers: AssignedCupper[]
  defects: {
    taints: string[]
    faults: string[]
  }
  confidence: number
  session_id?: string
}

interface ValidatedScore extends ExtractedScore {
  validated: boolean
}

interface OCRValidationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  extractedCards: ExtractedCard[]
  onSubmit: (validatedData: any[]) => Promise<void>
}

// Default attributes if template doesn't have any
const DEFAULT_ATTRIBUTES = [
  { attribute: 'Fragrance', abbreviation: 'Fra' },
  { attribute: 'Flavor', abbreviation: 'Fla' },
  { attribute: 'Aftertaste', abbreviation: 'Aft' },
  { attribute: 'Acidity', abbreviation: 'Acid' },
  { attribute: 'Body', abbreviation: 'Body' },
  { attribute: 'Balance', abbreviation: 'Bal' },
  { attribute: 'Overall', abbreviation: 'Ove' },
]

// Get short abbreviation for column header (max 4 chars)
function getAbbreviation(attr: any): string {
  if (attr.abbreviation) return attr.abbreviation.substring(0, 4)
  const name = attr.attribute || attr
  if (name.includes('/')) {
    return name.split('/').map((s: string) => s.substring(0, 2)).join('/')
  }
  return name.substring(0, 4)
}

export function OCRValidationDialog({
  open,
  onOpenChange,
  extractedCards,
  onSubmit,
}: OCRValidationDialogProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [validatedCards, setValidatedCards] = useState<Map<number, any>>(new Map())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const currentCard = extractedCards[currentCardIndex]
  const hasNextCard = currentCardIndex < extractedCards.length - 1
  const hasPrevCard = currentCardIndex > 0

  // Initialize validated scores for current card
  const [cupperScores, setCupperScores] = useState<ValidatedScore[]>(
    currentCard?.extracted_scores.map((score) => ({
      ...score,
      validated: false,
    })) || []
  )

  const [taints, setTaints] = useState(currentCard?.defects.taints.join(', ') || '')
  const [faults, setFaults] = useState(currentCard?.defects.faults.join(', ') || '')

  // Get attributes from quality template or use defaults
  const templateAttributes = currentCard?.sample.quality_template?.parameters?.cupping_attributes || DEFAULT_ATTRIBUTES

  // Update state when card changes
  useEffect(() => {
    if (currentCard) {
      setCupperScores(
        currentCard.extracted_scores.map((score) => ({
          ...score,
          validated: false,
        }))
      )
      setTaints(currentCard.defects.taints.join(', '))
      setFaults(currentCard.defects.faults.join(', '))
    }
  }, [currentCard])

  // Update score value
  const updateScore = (cupperIndex: number, attribute: string, value: string) => {
    const newScores = [...cupperScores]
    const numValue = parseFloat(value)

    if (!isNaN(numValue) || value === '') {
      newScores[cupperIndex].scores[attribute] = value === '' ? 0 : numValue
      setCupperScores(newScores)
    }
  }

  // Update cupper id and name (from dropdown selection)
  const updateCupperId = (cupperIndex: number, id: string, name: string) => {
    const newScores = [...cupperScores]
    newScores[cupperIndex].cupper_id = id
    newScores[cupperIndex].cupper_name = name
    setCupperScores(newScores)
  }

  // Add new cupper row
  const addCupperRow = () => {
    const newId = `manual_${cupperScores.length + 1}`
    setCupperScores([...cupperScores, {
      cupper_id: newId,
      cupper_name: '',
      scores: {},
      confidence: 0,
      validated: false,
    }])
  }

  // Save current card validation
  const saveCurrentCard = () => {
    const validated = {
      sample_id: currentCard.sample.id,
      tracking_number: currentCard.sample.tracking_number,
      cupper_scores: cupperScores.map((score) => ({
        ...score,
        validated: true,
      })),
      defects: {
        taints: taints.split(',').map((t) => t.trim()).filter(Boolean),
        faults: faults.split(',').map((f) => f.trim()).filter(Boolean),
      },
      confidence: currentCard.confidence,
      session_id: currentCard.session_id,
    }

    setValidatedCards(new Map(validatedCards.set(currentCardIndex, validated)))
  }

  // Navigate to next card
  const goToNextCard = () => {
    saveCurrentCard()
    if (hasNextCard) {
      setCurrentCardIndex(currentCardIndex + 1)
    }
  }

  // Navigate to previous card
  const goToPrevCard = () => {
    saveCurrentCard()
    if (hasPrevCard) {
      setCurrentCardIndex(currentCardIndex - 1)
    }
  }

  // Submit all validated scores
  const handleSubmit = async () => {
    saveCurrentCard()

    setIsSubmitting(true)
    try {
      const allValidatedData = Array.from(validatedCards.values())
      await onSubmit(allValidatedData)
      onOpenChange(false)
    } catch (error) {
      console.error('Error submitting scores:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!currentCard) {
    return null
  }

  const lowConfidence = currentCard.confidence < 80
  const numCols = templateAttributes.length + 1 // +1 for cupper name column

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[950px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                Validate Cupping Scores - Card {currentCardIndex + 1} of {extractedCards.length}
              </DialogTitle>
              <DialogDescription>
                Sample: <span className="font-semibold">{currentCard.sample.tracking_number}</span>
                {' | '}
                Type: <span className="font-semibold">{currentCard.sample.sample_type?.toUpperCase() || 'N/A'}</span>
              </DialogDescription>
            </div>
            <div
              className={cn(
                'rounded-md px-3 py-1.5 flex items-center gap-2',
                lowConfidence
                  ? 'bg-yellow-500/10 border border-yellow-500/50'
                  : 'bg-green-500/10 border border-green-500/50'
              )}
            >
              {lowConfidence ? (
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
              )}
              <span className="text-sm font-medium">
                OCR: {Math.round(currentCard.confidence)}%
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* TOP: Scanned Card Image */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Scanned Card</Label>
            <div className="relative w-full h-[180px] rounded-lg border overflow-hidden bg-muted">
              <Image
                src={currentCard.imagePreview}
                alt={`Cupping card ${currentCardIndex + 1}`}
                fill
                className="object-contain"
              />
            </div>
          </div>

          {/* MIDDLE: Excel-like Scores Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Cupping Scores</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addCupperRow}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Row
              </Button>
            </div>

            {cupperScores.length === 0 ? (
              <div className="rounded-md border-2 border-dashed p-6 text-center text-muted-foreground">
                <p>No scores extracted from this card.</p>
                <p className="text-sm mt-1">Click &ldquo;Add Row&rdquo; to enter scores manually.</p>
              </div>
            ) : (
              <div
                ref={gridRef}
                className="border-2 border-foreground/80 rounded overflow-hidden"
              >
                {/* Excel-like Grid */}
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `140px repeat(${templateAttributes.length}, 70px)`,
                  }}
                >
                  {/* Header Row */}
                  <div className="bg-muted/80 border-b-2 border-r border-foreground/40 px-3 py-3 font-semibold text-sm flex items-center">
                    Cupper
                  </div>
                  {templateAttributes.map((attr: any, idx: number) => (
                    <div
                      key={attr.attribute || idx}
                      className={cn(
                        "bg-muted/80 border-b-2 border-foreground/40 px-1 py-3 font-semibold text-sm text-center flex items-center justify-center",
                        idx < templateAttributes.length - 1 && "border-r border-foreground/20"
                      )}
                      title={attr.attribute}
                    >
                      {getAbbreviation(attr)}
                    </div>
                  ))}

                  {/* Data Rows */}
                  {cupperScores.map((cupper, cupperIndex) => (
                    <React.Fragment key={`cupper-row-${cupperIndex}`}>
                      {/* Cupper Name Cell */}
                      <div
                        className={cn(
                          "border-r border-foreground/40 bg-muted/30",
                          cupperIndex < cupperScores.length - 1 && "border-b border-foreground/20"
                        )}
                      >
                        {currentCard?.assigned_cuppers && currentCard.assigned_cuppers.length > 0 ? (
                          <Select
                            value={cupper.cupper_id}
                            onValueChange={(value) => {
                              if (value.startsWith('ocr_')) {
                                updateCupperId(cupperIndex, value, cupper.ocr_name || `Cupper ${cupperIndex + 1}`)
                                return
                              }
                              const selectedCupper = currentCard.assigned_cuppers.find(c => c.id === value)
                              if (selectedCupper) {
                                updateCupperId(cupperIndex, selectedCupper.id, selectedCupper.name)
                              }
                            }}
                          >
                            <SelectTrigger className="h-12 border-0 rounded-none text-sm bg-transparent focus:ring-0 focus:ring-offset-0">
                              <SelectValue placeholder="Select...">
                                <span className="truncate block max-w-[110px]">
                                  {cupper.cupper_name || 'Select...'}
                                </span>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {currentCard.assigned_cuppers.map((assignedCupper) => (
                                <SelectItem key={assignedCupper.id} value={assignedCupper.id}>
                                  <div className="flex items-center gap-2">
                                    <User className="h-3 w-3" />
                                    {assignedCupper.name}
                                  </div>
                                </SelectItem>
                              ))}
                              {cupper.ocr_name && (
                                <SelectItem value={`ocr_${cupperIndex}`}>
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    {cupper.ocr_name} (OCR)
                                  </div>
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={cupper.cupper_name}
                            onChange={(e) => {
                              const newScores = [...cupperScores]
                              newScores[cupperIndex].cupper_name = e.target.value
                              setCupperScores(newScores)
                            }}
                            placeholder={cupper.ocr_name || `Cupper ${cupperIndex + 1}`}
                            className="h-12 border-0 rounded-none text-sm bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        )}
                        {/* OCR hint */}
                        {cupper.ocr_name && cupper.ocr_name !== cupper.cupper_name && (
                          <div className="px-2 pb-1 text-[10px] text-muted-foreground truncate" title={`OCR detected: ${cupper.ocr_name}`}>
                            OCR: {cupper.ocr_name}
                          </div>
                        )}
                      </div>

                      {/* Score Cells */}
                      {templateAttributes.map((attr: any, attrIndex: number) => {
                        const attrName = attr.attribute || attr
                        const scoreValue = cupper.scores[attrName]
                        const hasValue = scoreValue !== undefined && scoreValue !== null && scoreValue !== 0

                        return (
                          <div
                            key={`${cupperIndex}-${attrName}`}
                            className={cn(
                              "relative",
                              attrIndex < templateAttributes.length - 1 && "border-r border-foreground/20",
                              cupperIndex < cupperScores.length - 1 && "border-b border-foreground/20"
                            )}
                          >
                            <Input
                              type="number"
                              step="0.25"
                              min="0"
                              max="10"
                              value={hasValue ? scoreValue : ''}
                              onChange={(e) => updateScore(cupperIndex, attrName, e.target.value)}
                              className={cn(
                                "h-12 w-full border-0 rounded-none text-center font-mono text-base font-medium",
                                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:ring-offset-0",
                                "bg-transparent hover:bg-muted/50",
                                hasValue ? "text-foreground" : "text-muted-foreground",
                                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              )}
                              placeholder="-"
                            />
                          </div>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM: Taints and Faults */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Taints</Label>
              <Textarea
                value={taints}
                onChange={(e) => setTaints(e.target.value)}
                placeholder="Comma-separated taints (e.g., ferment, rubber)"
                className="text-sm resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Faults</Label>
              <Textarea
                value={faults}
                onChange={(e) => setFaults(e.target.value)}
                placeholder="Comma-separated faults (e.g., rio, phenolic)"
                className="text-sm resize-none"
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevCard}
              disabled={!hasPrevCard}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextCard}
              disabled={!hasNextCard}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={saveCurrentCard} variant="secondary">
              <Save className="h-4 w-4 mr-2" />
              Save Card
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : `Submit ${extractedCards.length > 1 ? 'All' : ''}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
