'use client'

import { useState, useEffect } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExtractedScore {
  cupper_id: string
  cupper_name: string
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

// Helper to get abbreviation from attribute name
function getAbbreviation(attr: any): string {
  if (attr.abbreviation) return attr.abbreviation
  // Generate abbreviation from attribute name
  const name = attr.attribute || attr
  if (name.includes('/')) {
    // "Fragrance/Aroma" -> "Fra/Aro"
    return name.split('/').map((s: string) => s.substring(0, 3)).join('/')
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

  const currentCard = extractedCards[currentCardIndex]
  const hasNextCard = currentCardIndex < extractedCards.length - 1
  const hasPrevCard = currentCardIndex > 0
  const allCardsValidated = extractedCards.every((_, index) =>
    validatedCards.has(index)
  )

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

  // Update cupper name
  const updateCupperName = (cupperIndex: number, name: string) => {
    const newScores = [...cupperScores]
    newScores[cupperIndex].cupper_name = name
    setCupperScores(newScores)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
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

        <div className="space-y-6 py-4">
          {/* TOP: Scanned Card Image */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Scanned Card</Label>
            <div className="relative w-full h-[200px] rounded-lg border overflow-hidden bg-muted">
              <Image
                src={currentCard.imagePreview}
                alt={`Cupping card ${currentCardIndex + 1}`}
                fill
                className="object-contain"
              />
            </div>
          </div>

          {/* MIDDLE: Scores Table */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cupping Scores</Label>
            {cupperScores.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-muted-foreground">
                <p>No scores extracted from this card.</p>
                <p className="text-sm mt-1">OCR could not detect score values. Please enter manually.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Cupper</TableHead>
                      {templateAttributes.map((attr: any, idx: number) => (
                        <TableHead key={attr.attribute || idx} className="text-center w-[60px] px-1">
                          <span title={attr.attribute}>{getAbbreviation(attr)}</span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cupperScores.map((cupper, cupperIndex) => (
                      <TableRow key={cupperIndex}>
                        <TableCell className="p-1">
                          <Input
                            value={cupper.cupper_name}
                            onChange={(e) => updateCupperName(cupperIndex, e.target.value)}
                            placeholder={`Cupper ${cupperIndex + 1}`}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        {templateAttributes.map((attr: any, attrIndex: number) => {
                          const attrName = attr.attribute || attr
                          return (
                            <TableCell key={attrName} className="p-1 text-center">
                              <Input
                                type="number"
                                step="0.25"
                                min="0"
                                max="10"
                                value={cupper.scores[attrName] || ''}
                                onChange={(e) => updateScore(cupperIndex, attrName, e.target.value)}
                                className="h-8 text-sm text-center px-1"
                                placeholder="-"
                              />
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Add row button for manual entry */}
            {cupperScores.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCupperScores([{
                    cupper_id: 'manual_1',
                    cupper_name: '',
                    scores: {},
                    confidence: 0,
                    validated: false,
                  }])
                }}
              >
                Add Cupper Row
              </Button>
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
