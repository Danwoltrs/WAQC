'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  X, Check, Coffee, AlertTriangle, Star, ChevronLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Sample {
  id: string
  tracking_number: string
  supplier?: string
  origin?: string
  sample_type?: string
  cups_per_sample: number
}

interface CupScore {
  cupNumber: number
  taints: string[]
  faults: string[]
  attributes: string[]
  score?: number
}

// Common cupping attributes for Q grading
const ATTRIBUTES = [
  'Fragrance/Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Body',
  'Balance', 'Uniformity', 'Clean Cup', 'Sweetness', 'Overall'
]

const COMMON_TAINTS = [
  'Fermented', 'Phenolic', 'Earthy', 'Moldy', 'Musty',
  'Chemical', 'Medicinal', 'Rubber', 'Petroleum'
]

const COMMON_FAULTS = [
  'Sour', 'Overripe', 'Rancid', 'Vinegary', 'Harsh',
  'Astringent', 'Bitter', 'Foreign Matter'
]

export default function CuppingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sampleId = params?.id as string

  const [sample, setSample] = useState<Sample | null>(null)
  const [loading, setLoading] = useState(true)
  const [cupScores, setCupScores] = useState<CupScore[]>([])
  const [selectedCup, setSelectedCup] = useState<number | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    if (sampleId) {
      loadSample()
    }
  }, [sampleId])

  const loadSample = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/samples/${sampleId}`)
      const data = await response.json()

      if (response.ok) {
        setSample(data.sample)
        // Initialize cup scores
        const cupsCount = data.sample.cups_per_sample || 5
        const initialScores: CupScore[] = Array.from({ length: cupsCount }, (_, i) => ({
          cupNumber: i + 1,
          taints: [],
          faults: [],
          attributes: [],
          score: undefined
        }))
        setCupScores(initialScores)
      } else {
        console.error('Failed to load sample:', data.error)
      }
    } catch (error) {
      console.error('Error loading sample:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error)
      setIsFullScreen(true)
    } else {
      document.exitFullscreen().catch(console.error)
      setIsFullScreen(false)
    }
  }

  const handleCupClick = (cupNumber: number) => {
    setSelectedCup(cupNumber)
  }

  const closeCupDialog = () => {
    setSelectedCup(null)
  }

  const addItem = (cupNumber: number, category: 'taints' | 'faults' | 'attributes', item: string) => {
    setCupScores(prev =>
      prev.map(cup =>
        cup.cupNumber === cupNumber
          ? { ...cup, [category]: [...cup[category], item] }
          : cup
      )
    )
  }

  const removeItem = (cupNumber: number, category: 'taints' | 'faults' | 'attributes', item: string) => {
    setCupScores(prev =>
      prev.map(cup =>
        cup.cupNumber === cupNumber
          ? { ...cup, [category]: cup[category].filter(i => i !== item) }
          : cup
      )
    )
  }

  const updateScore = (cupNumber: number, score: number) => {
    setCupScores(prev =>
      prev.map(cup =>
        cup.cupNumber === cupNumber ? { ...cup, score } : cup
      )
    )
  }

  const getCupStatus = (cup: CupScore): 'clean' | 'issues' | 'scored' => {
    if (cup.score !== undefined) return 'scored'
    if (cup.taints.length > 0 || cup.faults.length > 0) return 'issues'
    return 'clean'
  }

  const getCupColor = (status: 'clean' | 'issues' | 'scored'): string => {
    switch (status) {
      case 'scored':
        return 'bg-green-500 hover:bg-green-600'
      case 'issues':
        return 'bg-red-500 hover:bg-red-600'
      case 'clean':
        return 'bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading sample...</div>
      </div>
    )
  }

  if (!sample) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Sample not found</h2>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    )
  }

  const selectedCupData = cupScores.find(c => c.cupNumber === selectedCup)

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullScreen}
          >
            Full Screen
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">{sample.tracking_number}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {sample.supplier && `${sample.supplier} • `}
                  {sample.origin}
                </p>
              </div>
              <Badge variant="outline" className="text-lg px-4 py-2">
                {cupScores.length} Cups
              </Badge>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Cups Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8">
          {cupScores.map((cup) => {
            const status = getCupStatus(cup)
            const color = getCupColor(status)

            return (
              <button
                key={cup.cupNumber}
                onClick={() => handleCupClick(cup.cupNumber)}
                className={cn(
                  'relative aspect-square rounded-full transition-all duration-200 shadow-lg',
                  'flex flex-col items-center justify-center',
                  'border-4 border-white dark:border-gray-800',
                  color
                )}
              >
                <Coffee className="h-12 w-12 md:h-16 md:w-16 text-white mb-2" />
                <span className="text-2xl md:text-3xl font-bold text-white">
                  {cup.cupNumber}
                </span>
                {cup.score !== undefined && (
                  <span className="text-sm text-white mt-1">
                    {cup.score.toFixed(1)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cup Detail Dialog */}
      <Dialog open={selectedCup !== null} onOpenChange={closeCupDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cup {selectedCup} - Evaluation</DialogTitle>
          </DialogHeader>

          {selectedCupData && (
            <div className="space-y-6">
              {/* Taints */}
              <div>
                <Label className="text-base font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Taints
                </Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedCupData.taints.map((taint) => (
                    <Badge
                      key={taint}
                      variant="destructive"
                      className="cursor-pointer"
                      onClick={() => removeItem(selectedCup, 'taints', taint)}
                    >
                      {taint}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMMON_TAINTS.filter(t => !selectedCupData.taints.includes(t)).map((taint) => (
                    <Button
                      key={taint}
                      variant="outline"
                      size="sm"
                      onClick={() => addItem(selectedCup, 'taints', taint)}
                    >
                      {taint}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Faults */}
              <div>
                <Label className="text-base font-semibold mb-3 flex items-center gap-2">
                  <X className="h-4 w-4" />
                  Faults
                </Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedCupData.faults.map((fault) => (
                    <Badge
                      key={fault}
                      variant="destructive"
                      className="cursor-pointer"
                      onClick={() => removeItem(selectedCup, 'faults', fault)}
                    >
                      {fault}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMMON_FAULTS.filter(f => !selectedCupData.faults.includes(f)).map((fault) => (
                    <Button
                      key={fault}
                      variant="outline"
                      size="sm"
                      onClick={() => addItem(selectedCup, 'faults', fault)}
                    >
                      {fault}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Attributes (for Q Grading) */}
              <div>
                <Label className="text-base font-semibold mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Q Grading Attributes
                </Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedCupData.attributes.map((attr) => (
                    <Badge
                      key={attr}
                      variant="default"
                      className="cursor-pointer"
                      onClick={() => removeItem(selectedCup, 'attributes', attr)}
                    >
                      {attr}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ATTRIBUTES.filter(a => !selectedCupData.attributes.includes(a)).map((attr) => (
                    <Button
                      key={attr}
                      variant="outline"
                      size="sm"
                      onClick={() => addItem(selectedCup, 'attributes', attr)}
                    >
                      {attr}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Score */}
              <div>
                <Label htmlFor="score" className="text-base font-semibold mb-2 block">
                  Score (0-100)
                </Label>
                <Input
                  id="score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.25"
                  value={selectedCupData.score || ''}
                  onChange={(e) => updateScore(selectedCup, parseFloat(e.target.value))}
                  placeholder="Enter score"
                  className="max-w-xs"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={closeCupDialog}>
                  Close
                </Button>
                <Button onClick={closeCupDialog}>
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
