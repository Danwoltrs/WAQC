'use client'

import { useState } from 'react'
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

  // Get quality template attributes
  const templateAttributes =
    currentCard?.sample.quality_template?.parameters?.cupping_attributes || [
      'Frag',
      'Arom',
      'Body',
      'Acid',
      'Swet',
      'Bal',
      'Fin',
    ]

  // Update score value
  const updateScore = (cupperIndex: number, attribute: string, value: string) => {
    const newScores = [...cupperScores]
    const numValue = parseFloat(value)

    if (!isNaN(numValue)) {
      newScores[cupperIndex].scores[attribute] = numValue
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
      const nextCard = extractedCards[currentCardIndex + 1]
      setCupperScores(
        nextCard.extracted_scores.map((score) => ({
          ...score,
          validated: false,
        }))
      )
      setTaints(nextCard.defects.taints.join(', '))
      setFaults(nextCard.defects.faults.join(', '))
    }
  }

  // Navigate to previous card
  const goToPrevCard = () => {
    saveCurrentCard()
    if (hasPrevCard) {
      setCurrentCardIndex(currentCardIndex - 1)
      const prevCard = extractedCards[currentCardIndex - 1]
      const existingValidation = validatedCards.get(currentCardIndex - 1)

      if (existingValidation) {
        setCupperScores(existingValidation.cupper_scores)
        setTaints(existingValidation.defects.taints.join(', '))
        setFaults(existingValidation.defects.faults.join(', '))
      } else {
        setCupperScores(
          prevCard.extracted_scores.map((score) => ({
            ...score,
            validated: false,
          }))
        )
        setTaints(prevCard.defects.taints.join(', '))
        setFaults(prevCard.defects.faults.join(', '))
      }
    }
  }

  // Submit all validated scores
  const handleSubmit = async () => {
    saveCurrentCard() // Save current card before submitting

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
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Validate Cupping Scores - Card {currentCardIndex + 1} of {extractedCards.length}
          </DialogTitle>
          <DialogDescription>
            Review and correct the OCR-extracted scores for sample{' '}
            <span className="font-semibold">{currentCard.sample.tracking_number}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          {/* Left: Image Preview */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Scanned Card</Label>
            <div className="relative aspect-[3/2] rounded-lg border overflow-hidden bg-muted">
              <Image
                src={currentCard.imagePreview}
                alt={`Card ${currentCardIndex + 1}`}
                fill
                className="object-contain"
              />
            </div>

            {/* Confidence Score */}
            <div
              className={cn(
                'rounded-md p-3 flex items-center gap-2',
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
              <div className="text-sm">
                <p className="font-medium">
                  OCR Confidence: {Math.round(currentCard.confidence)}%
                </p>
                {lowConfidence && (
                  <p className="text-xs text-muted-foreground">
                    Please carefully review all extracted values
                  </p>
                )}
              </div>
            </div>

            {/* Sample Info */}
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm">
                <span className="font-medium">Sample:</span>{' '}
                {currentCard.sample.tracking_number}
              </p>
              <p className="text-sm">
                <span className="font-medium">Type:</span>{' '}
                {currentCard.sample.sample_type?.toUpperCase() || 'N/A'}
              </p>
              <p className="text-sm">
                <span className="font-medium">Template:</span>{' '}
                {currentCard.sample.quality_template?.name || 'Unknown'}
              </p>
            </div>

            {/* Assigned Cuppers */}
            {currentCard.assigned_cuppers && currentCard.assigned_cuppers.length > 0 && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium">Assigned Cuppers</p>
                <div className="flex flex-wrap gap-2">
                  {currentCard.assigned_cuppers.map((cupper, index) => (
                    <div
                      key={cupper.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs"
                    >
                      <span className="font-medium text-blue-700 dark:text-blue-400">
                        {index + 1}.
                      </span>
                      <span>{cupper.name}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Scores matched by row position (top to bottom)
                </p>
              </div>
            )}
          </div>

          {/* Right: Score Validation */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold">Cupping Scores</Label>

            {/* Cupper Scores */}
            {cupperScores.map((cupper, cupperIndex) => {
              const cupperConfidence = cupper.confidence || 0
              const lowCupperConfidence = cupperConfidence < 70

              return (
                <div key={cupperIndex} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Cupper {cupperIndex + 1}
                      </Label>
                      <div
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                          lowCupperConfidence
                            ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30'
                            : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30'
                        )}
                      >
                        {lowCupperConfidence ? (
                          <AlertCircle className="h-2.5 w-2.5" />
                        ) : (
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        )}
                        {Math.round(cupperConfidence)}%
                      </div>
                    </div>
                    <Input
                      value={cupper.cupper_name}
                      onChange={(e) =>
                        updateCupperName(cupperIndex, e.target.value)
                      }
                      placeholder="Cupper name"
                      className="h-8 text-sm flex-1"
                    />
                  </div>

                  {/* Score Grid */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {templateAttributes.map((attr: string) => (
                      <div key={attr} className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground truncate block overflow-hidden">
                          {attr.length > 4 ? attr.substring(0, 4) : attr}
                        </Label>
                        <Input
                          type="number"
                          step="0.25"
                          value={cupper.scores[attr] || ''}
                          onChange={(e) =>
                            updateScore(cupperIndex, attr, e.target.value)
                          }
                          className="h-7 text-xs px-1.5"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Defects */}
            <div className="space-y-2">
              <Label className="text-sm">Taints</Label>
              <Textarea
                value={taints}
                onChange={(e) => setTaints(e.target.value)}
                placeholder="Comma-separated taints"
                className="text-sm resize-none"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Faults</Label>
              <Textarea
                value={faults}
                onChange={(e) => setFaults(e.target.value)}
                placeholder="Comma-separated faults"
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
            {allCardsValidated && (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : `Submit All ${extractedCards.length} Cards`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
