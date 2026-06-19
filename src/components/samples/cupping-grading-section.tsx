'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Edit, Save, X, Lock, Coffee, Beaker, Loader2
} from 'lucide-react'
import { FLAVOR_DESCRIPTORS } from '@/types/cupping-templates'

// Dynamic key-value map for cupping scores (keys come from cupping templates)
type CuppingScores = Record<string, number>

interface DefectEntry {
  name: string
  count: number
}

interface DefectsData {
  total_primary?: number
  primary?: number
  total_secondary?: number
  secondary?: number
  total?: number
  defect_list?: DefectEntry[]
  [key: string]: any
}

interface GradingData {
  green_bean_data?: {
    moisture?: number
    moisture_percentage?: number
    humidity?: number
    density?: number
    aspect?: string
    green_aspect?: string
    quakers?: number
    screen_analysis?: Record<string, number>
    screen_sizes?: Record<string, number>
    defects?: DefectsData | DefectEntry[]
  }
  roast_data?: {
    quakers?: number
    roast_aspect?: string
    roast_color?: string
    notes?: string
  }
}

interface EditHistory {
  edited_at: string
  edited_by: string
  reason: string
  changes: Record<string, { old: any; new: any }>
}

interface EditPermission {
  canEdit: boolean
  reason: 'not_locked' | 'within_7_days' | 'locked_after_scan' | 'locked_after_7_days'
  lockExpiresAt: string | null
  message: string
}

interface UserProfile {
  email?: string
  full_name?: string
  is_master_cupper?: boolean | null
  is_global_admin?: boolean | null
  qc_role?: string | null
}

interface TaintFaultEntry {
  name: string
  intensity?: number | null
}

interface SampleData {
  id: string
  certificate_id?: string | null
  quality_spec_id?: string | null
  sample_type?: string | null
}

export interface CuppingGradingSectionProps {
  sample: SampleData
  profile: UserProfile | null
  editPermission: EditPermission | null
  onDataChanged?: () => void
}

export function CuppingGradingSection({
  sample,
  profile,
  editPermission,
  onDataChanged,
}: CuppingGradingSectionProps) {
  const [cuppingScores, setCuppingScores] = useState<CuppingScores | null>(null)
  const [gradingData, setGradingData] = useState<GradingData | null>(null)
  const [editHistory, setEditHistory] = useState<EditHistory[]>([])
  const [isEditingCuppingGrading, setIsEditingCuppingGrading] = useState(false)
  const [cuppingGradingFormData, setCuppingGradingFormData] = useState<{ cupping?: CuppingScores; grading?: GradingData }>({})
  const [editReason, setEditReason] = useState('')
  const [savingCuppingGrading, setSavingCuppingGrading] = useState(false)

  const [cleanCup, setCleanCup] = useState<boolean | null>(null)
  const [uniformCup, setUniformCup] = useState<boolean | null>(null)
  const [cuppingComments, setCuppingComments] = useState<string | null>(null)
  const [gradingComments, setGradingComments] = useState<string | null>(null)
  // Cup profile (Flavor descriptor): current effective value + edit-mode draft
  const [cupProfile, setCupProfile] = useState<string | null>(null)
  const [editCupProfile, setEditCupProfile] = useState<string>('')

  // Taints & faults from cupping aggregate
  const [taintsData, setTaintsData] = useState<TaintFaultEntry[]>([])
  const [faultsData, setFaultsData] = useState<TaintFaultEntry[]>([])
  // Edit-mode copies
  const [editTaints, setEditTaints] = useState<TaintFaultEntry[]>([])
  const [editFaults, setEditFaults] = useState<TaintFaultEntry[]>([])
  // Editable individual defects
  const [editDefects, setEditDefects] = useState<DefectEntry[]>([])
  // Quality spec: show quakers?
  const [showQuakers, setShowQuakers] = useState(true)
  // Available defect names from quality spec template
  const [availableDefectNames, setAvailableDefectNames] = useState<string[]>([])

  useEffect(() => {
    if (sample?.id) {
      loadCuppingGradingData(sample.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample?.id])

  // Fetch quality spec to determine if quakers should be shown + available defect names
  useEffect(() => {
    // Default SCA defect names as fallback
    const SCA_DEFAULTS = ['Fermented', 'Earthy', 'Phenolic', 'Chemical', 'Musty', 'Woody', 'Rancid', 'Moldy', 'Sour', 'Stinker', 'Sour/Acetic', 'Green', 'Quaker', 'Musty/Moldy', 'Harsh', 'Grassy/green', 'Past crop', 'Fruity', 'Dirty']
    if (sample?.quality_spec_id) {
      fetch(`/api/client-qualities/${sample.quality_spec_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            const params = data.client_quality?.template?.parameters
            setShowQuakers(
              params?.require_quaker_count === true ||
              params?.max_quakers != null ||
              sample?.sample_type === 'type'
            )
            // Extract defect names from taint_fault_configuration
            const tfConfig = params?.taint_fault_configuration
            if (tfConfig?.defects?.length > 0) {
              setAvailableDefectNames(tfConfig.defects.map((d: any) => d.name))
            } else {
              setAvailableDefectNames(SCA_DEFAULTS)
            }
          }
        })
        .catch(() => {
          setShowQuakers(true)
          setAvailableDefectNames(SCA_DEFAULTS)
        })
    } else {
      setShowQuakers(sample?.sample_type === 'type')
      setAvailableDefectNames(SCA_DEFAULTS)
    }
  }, [sample?.quality_spec_id, sample?.sample_type])

  const loadCuppingGradingData = async (sampleUuid: string) => {
    try {
      // Load cupping scores from aggregate endpoint
      let aggregateTaints: TaintFaultEntry[] = []
      let aggregateFaults: TaintFaultEntry[] = []

      let aggregateFlavorDescriptor: string | null = null

      const cuppingRes = await fetch(`/api/cupping/scores/aggregate?sample_id=${sampleUuid}`)
      if (cuppingRes.ok) {
        const cuppingData = await cuppingRes.json()
        if (cuppingData.aggregated?.attributes) {
          const scores: CuppingScores = {}
          Object.entries(cuppingData.aggregated.attributes).forEach(([key, value]: [string, any]) => {
            scores[key as keyof CuppingScores] = value.finalScore
          })
          setCuppingScores(scores)
        }
        if (typeof cuppingData.aggregated?.flavor_descriptor === 'string') {
          aggregateFlavorDescriptor = cuppingData.aggregated.flavor_descriptor
        }
        // Extract taints/faults from aggregate
        if (cuppingData.aggregated?.defects) {
          const d = cuppingData.aggregated.defects
          const levels = cuppingData.aggregated.defect_levels || []
          aggregateTaints = (d.taints || []).map((name: string) => {
            const lvl = levels.find((dl: any) => dl.defectName === name && dl.type === 'taint')
            const vals = lvl?.levels ? Object.values(lvl.levels) as number[] : []
            const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
            return { name, intensity: avg ? Math.round(avg * 10) / 10 : undefined }
          })
          aggregateFaults = (d.faults || []).map((name: string) => {
            const lvl = levels.find((dl: any) => dl.defectName === name && dl.type === 'fault')
            const vals = lvl?.levels ? Object.values(lvl.levels) as number[] : []
            const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
            return { name, intensity: avg ? Math.round(avg * 10) / 10 : undefined }
          })
        }
      } else {
        // Aggregate may return 404 if no cupping_scores records but
        // quality_assessment may still have cupping data via certificate flow
        // We handle this below
      }

      const gradingRes = await fetch(`/api/samples/${sampleUuid}/quality-assessment`)
      if (gradingRes.ok) {
        const gradingDataRes = await gradingRes.json()
        if (gradingDataRes.assessment) {
          setGradingData({
            green_bean_data: gradingDataRes.assessment.green_bean_data,
            roast_data: gradingDataRes.assessment.roast_data
          })
          if (gradingDataRes.assessment.edit_history) {
            setEditHistory(gradingDataRes.assessment.edit_history)
          }
          setCleanCup(gradingDataRes.assessment.clean_cup ?? null)
          setUniformCup(gradingDataRes.assessment.uniform_cup ?? null)
          setCuppingComments(gradingDataRes.assessment.cupping_comments ?? null)
          setGradingComments(gradingDataRes.assessment.grading_comments ?? null)
          // Cup profile: master-cupper override (green_bean_data.cup_profile) wins,
          // else the descriptor aggregated across cuppers.
          const override = gradingDataRes.assessment.green_bean_data?.cup_profile
          setCupProfile((typeof override === 'string' && override.trim()) ? override : aggregateFlavorDescriptor)

          // If aggregate endpoint failed but assessment has cupping scores in green_bean_data
          // try to extract cupping totals from the assessment
          if (!cuppingRes.ok && gradingDataRes.assessment.green_bean_data?.cupping_scores) {
            const cs = gradingDataRes.assessment.green_bean_data.cupping_scores
            if (typeof cs === 'object' && !Array.isArray(cs)) {
              setCuppingScores(cs as CuppingScores)
            }
          }

          // Prefer stored taints/faults overrides in roast_data, else use aggregate
          const rd = gradingDataRes.assessment.roast_data
          if (rd?.taints && Array.isArray(rd.taints)) {
            setTaintsData(rd.taints)
          } else {
            setTaintsData(aggregateTaints)
          }
          if (rd?.faults && Array.isArray(rd.faults)) {
            setFaultsData(rd.faults)
          } else {
            setFaultsData(aggregateFaults)
          }
        } else {
          // No assessment - use aggregate taints/faults
          setTaintsData(aggregateTaints)
          setFaultsData(aggregateFaults)
          setCupProfile(aggregateFlavorDescriptor)
        }
      }
    } catch (error) {
      console.error('Error loading cupping/grading data:', error)
    }
  }

  const isMasterCupperOrAdmin = profile?.is_master_cupper || profile?.is_global_admin
  const canEditCuppingGrading = isMasterCupperOrAdmin &&
    editPermission?.canEdit &&
    (editPermission.reason === 'not_locked' || editPermission.reason === 'within_7_days')

  const handleEnterCuppingGradingEdit = () => {
    if (!canEditCuppingGrading) return
    // Deep-clone grading data and normalize screen_sizes key
    const grading = JSON.parse(JSON.stringify(gradingData || {}))
    if (grading.green_bean_data) {
      // Normalize screen_analysis -> screen_sizes
      const raw = grading.green_bean_data.screen_sizes || grading.green_bean_data.screen_analysis || {}
      // Normalize keys: "Screen 18" -> "18", "screen_18" -> "18", keep "Pan"/"18" as-is
      const normalized: Record<string, number> = {}
      for (const [key, val] of Object.entries(raw)) {
        const clean = key.replace(/^screen[_ ]?/i, '').trim()
        normalized[clean] = val as number
      }
      grading.green_bean_data.screen_sizes = normalized
    }
    setCuppingGradingFormData({
      cupping: cuppingScores ? { ...cuppingScores } : {},
      grading,
    })
    // Pre-fill defects list for per-defect editing
    const gb = gradingData?.green_bean_data
    const defects = gb?.defects
    const list: DefectEntry[] = []
    if (defects) {
      if (Array.isArray(defects)) {
        defects.forEach(d => list.push({ name: d.name, count: d.count }))
      } else if (typeof defects === 'object') {
        const d = defects as DefectsData
        if (d.defect_list) d.defect_list.forEach(e => list.push({ name: e.name, count: e.count }))
        else if (d.counts) Object.entries(d.counts).forEach(([n, c]) => list.push({ name: n, count: c as number }))
      }
    }
    setEditDefects(list)
    // Pre-fill taints/faults
    setEditTaints([...taintsData])
    setEditFaults([...faultsData])
    setEditCupProfile(cupProfile ?? '')
    setEditReason('')
    setIsEditingCuppingGrading(true)
  }

  const handleCancelCuppingGradingEdit = () => {
    setIsEditingCuppingGrading(false)
    setCuppingGradingFormData({})
    setEditReason('')
  }

  const handleSaveCuppingGrading = async () => {
    if (!sample || !editReason.trim()) {
      alert('Please provide a reason for the edit')
      return
    }

    try {
      setSavingCuppingGrading(true)

      const changes: Record<string, { old: any; new: any }> = {}

      if (cuppingGradingFormData.cupping && cuppingScores) {
        Object.keys(cuppingGradingFormData.cupping).forEach(key => {
          const oldVal = cuppingScores[key as keyof CuppingScores]
          const newVal = cuppingGradingFormData.cupping![key as keyof CuppingScores]
          if (oldVal !== newVal) {
            changes[`cupping_${key}`] = { old: oldVal, new: newVal }
          }
        })
      }

      if (cuppingGradingFormData.grading && gradingData) {
        if (JSON.stringify(cuppingGradingFormData.grading.green_bean_data) !== JSON.stringify(gradingData.green_bean_data)) {
          changes.green_bean_data = { old: gradingData.green_bean_data, new: cuppingGradingFormData.grading.green_bean_data }
        }
        if (JSON.stringify(cuppingGradingFormData.grading.roast_data) !== JSON.stringify(gradingData.roast_data)) {
          changes.roast_data = { old: gradingData.roast_data, new: cuppingGradingFormData.grading.roast_data }
        }
      }

      const editEntry: EditHistory = {
        edited_at: new Date().toISOString(),
        edited_by: profile?.email || profile?.full_name || 'Unknown',
        reason: editReason.trim(),
        changes
      }

      // Build defects from edit state
      const PRIMARY_NAMES_SAVE = ['full black', 'full sour', 'pod/cherry', 'pod', 'cherry',
        'large husk', 'large stone', 'stone/stick', 'stone', 'stick', 'foreign material', 'foreign matter', 'foreign']
      const isPrimarySave = (n: string) => PRIMARY_NAMES_SAVE.some(p => n.toLowerCase().includes(p))
      const filteredDefects = editDefects.filter(d => d.name.trim())
      const primaryTotal = filteredDefects.filter(d => isPrimarySave(d.name)).reduce((s, d) => s + d.count, 0)
      const secondaryTotal = filteredDefects.filter(d => !isPrimarySave(d.name)).reduce((s, d) => s + d.count, 0)
      // Cup profile (Flavor descriptor) override — authoritative on the certificate.
      const newCupProfile = editCupProfile.trim() || null
      if (newCupProfile !== (cupProfile ?? null)) {
        changes.cup_profile = { old: cupProfile ?? null, new: newCupProfile }
      }

      const greenBeanWithDefects = {
        ...cuppingGradingFormData.grading?.green_bean_data,
        cup_profile: newCupProfile,
        defects: {
          defect_list: filteredDefects,
          primary: primaryTotal,
          secondary: secondaryTotal,
          total: primaryTotal + secondaryTotal,
        }
      }

      // Build roast_data with taints/faults
      const roastDataWithTF = {
        ...cuppingGradingFormData.grading?.roast_data,
        taints: editTaints.filter(t => t.name.trim()),
        faults: editFaults.filter(f => f.name.trim()),
      }

      const response = await fetch(`/api/samples/${sample.id}/quality-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          green_bean_data: greenBeanWithDefects,
          roast_data: roastDataWithTF,
          edit_history: [...editHistory, editEntry],
          clean_cup: cleanCup,
          uniform_cup: uniformCup,
          cupping_comments: cuppingComments,
          grading_comments: gradingComments,
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      await loadCuppingGradingData(sample.id)
      setIsEditingCuppingGrading(false)
      setCuppingGradingFormData({})
      setEditReason('')
      onDataChanged?.()
    } catch (error) {
      console.error('Error saving cupping/grading:', error)
      alert(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setSavingCuppingGrading(false)
    }
  }

  return (
    <Card className={`relative ${!canEditCuppingGrading && sample.certificate_id ? 'border-muted' : ''}`}>
      {canEditCuppingGrading && !isEditingCuppingGrading && (
        <Button variant="ghost" size="icon" className="absolute top-0.5 right-0.5 h-7 w-7" onClick={handleEnterCuppingGradingEdit} title="Edit">
          <Edit className="h-3.5 w-3.5" />
        </Button>
      )}
      <CardContent className="pt-4 space-y-6">
        {/* Lock indicator */}
        {!canEditCuppingGrading && sample.certificate_id && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Lock className="h-3 w-3" />
              {editPermission?.message || 'Locked after 7 days from certification'}
            </span>
            {editPermission?.reason === 'within_7_days' && (
              <Badge variant="outline" className="text-xs">7-day edit window</Badge>
            )}
          </div>
        )}
        {/* Edit Mode Audit Fields */}
        {isEditingCuppingGrading && (
          <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Edit className="h-4 w-4" />
              Audit Trail Required
            </div>
            <div>
              <label className="text-sm font-medium">Reason for Edit *</label>
              <Textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Please provide a reason for this edit (required)"
                className="mt-1"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">{editReason.length}/500 characters</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Edited by:</label>
              <span className="text-sm ml-2">{profile?.email || profile?.full_name || 'Unknown'}</span>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={handleCancelCuppingGradingEdit} disabled={savingCuppingGrading}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveCuppingGrading}
                disabled={savingCuppingGrading || !editReason.trim()}
              >
                {savingCuppingGrading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}

        {/* Cup Profile (Flavor descriptor) */}
        {(cupProfile || isEditingCuppingGrading) && (
          <div className="mb-3">
            <h4 className="text-sm font-medium mb-1">Cup Profile</h4>
            {isEditingCuppingGrading ? (
              <Select value={editCupProfile || '__none__'} onValueChange={(v) => setEditCupProfile(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm w-48"><SelectValue placeholder="Select cup profile..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {FLAVOR_DESCRIPTORS.map(desc => (
                    <SelectItem key={desc} value={desc}>{desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm font-medium">{cupProfile || '-'}</span>
            )}
          </div>
        )}

        {/* Cupping Scores Grid */}
        {cuppingScores && Object.keys(cuppingScores).length > 0 ? (
          <div>
            <h4 className="text-sm font-medium mb-3">Cupping Scores</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(cuppingScores).map(([key, value]) => (
                <div key={key} className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">{key.replace(/_/g, ' ')}</div>
                  {isEditingCuppingGrading ? (
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={cuppingGradingFormData.cupping?.[key] || ''}
                      onChange={(e) => setCuppingGradingFormData(prev => ({
                        ...prev,
                        cupping: { ...prev.cupping, [key]: parseFloat(e.target.value) || 0 }
                      }))}
                      className="h-7 text-sm text-center"
                    />
                  ) : (
                    <div className={`text-lg font-semibold ${!canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''}`}>
                      {typeof value === 'number' && !isNaN(value) ? value.toFixed(1) : '-'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No cupping scores available</p>
        )}

        {/* Clean Cup / Uniform Cup Status */}
        {(cleanCup !== null || uniformCup !== null) && (
          <div className="mt-3">
            <h4 className="text-sm font-medium mb-2">Cup Status</h4>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Clean Cup:</span>
                {isEditingCuppingGrading ? (
                  <Checkbox
                    checked={cleanCup === true}
                    onCheckedChange={(checked) => setCleanCup(checked === true)}
                  />
                ) : (
                  <span className={`text-sm font-medium ${cleanCup ? 'text-green-600' : 'text-red-600'}`}>
                    {cleanCup === true ? 'Yes' : cleanCup === false ? 'No' : '-'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Uniform Cup:</span>
                {isEditingCuppingGrading ? (
                  <Checkbox
                    checked={uniformCup === true}
                    onCheckedChange={(checked) => setUniformCup(checked === true)}
                  />
                ) : (
                  <span className={`text-sm font-medium ${uniformCup ? 'text-green-600' : 'text-red-600'}`}>
                    {uniformCup === true ? 'Yes' : uniformCup === false ? 'No' : '-'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cupping Comments */}
        {(cuppingComments || isEditingCuppingGrading) && (
          <div className="mt-3">
            <h4 className="text-sm font-medium mb-1">Cupping Comments</h4>
            {isEditingCuppingGrading ? (
              <Textarea
                value={cuppingComments || ''}
                onChange={(e) => setCuppingComments(e.target.value || null)}
                placeholder="Cupping notes..."
                className="text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{cuppingComments}</p>
            )}
          </div>
        )}

        {/* Grading Comments */}
        {(gradingComments || isEditingCuppingGrading) && (
          <div className="mt-3">
            <h4 className="text-sm font-medium mb-1">Grading Comments</h4>
            {isEditingCuppingGrading ? (
              <Textarea
                value={gradingComments || ''}
                onChange={(e) => setGradingComments(e.target.value || null)}
                placeholder="Grading notes..."
                className="text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{gradingComments}</p>
            )}
          </div>
        )}

        {/* Grading Data */}
        {(gradingData?.green_bean_data || isEditingCuppingGrading) && (() => {
          const gb = gradingData?.green_bean_data || {}
          const moistureVal = gb.moisture_percentage ?? gb.moisture ?? gb.humidity ?? null
          const greenAspect = gb.green_aspect ?? gb.aspect ?? null
          const roastAspect = gradingData?.roast_data?.roast_aspect ?? gradingData?.roast_data?.roast_color ?? null
          const quakers = gb.quakers ?? gradingData?.roast_data?.quakers ?? null
          const screenSizes = gb.screen_sizes ?? gb.screen_analysis ?? null
          const lockedStyle = !canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''

          const updateGreenBean = (field: string, value: any) => {
            setCuppingGradingFormData(prev => ({
              ...prev,
              grading: {
                ...prev.grading,
                green_bean_data: { ...prev.grading?.green_bean_data, [field]: value }
              }
            }))
          }

          const updateRoast = (field: string, value: any) => {
            setCuppingGradingFormData(prev => ({
              ...prev,
              grading: {
                ...prev.grading,
                roast_data: { ...prev.grading?.roast_data, [field]: value }
              }
            }))
          }

          const updateScreenSize = (sizeKey: string, grams: number) => {
            setCuppingGradingFormData(prev => {
              const current = prev.grading?.green_bean_data?.screen_sizes || screenSizes || {}
              return {
                ...prev,
                grading: {
                  ...prev.grading,
                  green_bean_data: {
                    ...prev.grading?.green_bean_data,
                    screen_sizes: { ...current, [sizeKey]: grams }
                  }
                }
              }
            })
          }

          const updateDefectField = (field: string, value: number) => {
            setCuppingGradingFormData(prev => {
              const currentDefects = prev.grading?.green_bean_data?.defects as DefectsData || {}
              return {
                ...prev,
                grading: {
                  ...prev.grading,
                  green_bean_data: {
                    ...prev.grading?.green_bean_data,
                    defects: { ...currentDefects, [field]: value }
                  }
                }
              }
            })
          }

          // Parse defect data
          const defects = gb.defects
          let defectPrimary: number | null = null
          let defectSecondary: number | null = null
          let defectTotal: number | null = null
          let defectCounts: Record<string, number> | null = null
          let defectList: DefectEntry[] | null = null

          if (defects) {
            if (Array.isArray(defects)) {
              defectList = defects
            } else if (typeof defects === 'object') {
              const d = defects as DefectsData
              defectPrimary = d.total_primary ?? d.primary ?? null
              defectSecondary = d.total_secondary ?? d.secondary ?? null
              defectTotal = d.total ?? (defectPrimary != null && defectSecondary != null ? defectPrimary + defectSecondary : null)
              defectCounts = d.counts ?? null
              defectList = d.defect_list ?? null
            }
          }

          // Build sorted screen size entries
          const screenEntries = screenSizes
            ? Object.entries(screenSizes)
                .filter(([, v]) => v > 0)
                .sort(([a], [b]) => {
                  const na = parseInt(a.replace(/\D/g, ''))
                  const nb = parseInt(b.replace(/\D/g, ''))
                  if (isNaN(na) && isNaN(nb)) return a.localeCompare(b)
                  if (isNaN(na)) return 1
                  if (isNaN(nb)) return -1
                  return nb - na
                })
            : []
          const screenTotal = screenEntries.reduce((sum, [, v]) => sum + v, 0)

          return (
            <>
              <Separator />
              <div>
                {/* Moisture, Density, Quakers, Green Aspect, Roast Aspect */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Moisture</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        type="number" step="0.1"
                        value={cuppingGradingFormData.grading?.green_bean_data?.moisture_percentage ?? moistureVal ?? ''}
                        onChange={(e) => updateGreenBean('moisture_percentage', parseFloat(e.target.value) || 0)}
                        className="h-7 text-sm mt-1"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>
                        {moistureVal != null ? `${moistureVal}%` : '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Density</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        type="number" step="0.01"
                        value={cuppingGradingFormData.grading?.green_bean_data?.density ?? gb.density ?? ''}
                        onChange={(e) => updateGreenBean('density', parseFloat(e.target.value) || 0)}
                        className="h-7 text-sm mt-1"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{gb.density ? gb.density.toFixed(3) : '-'}</div>
                    )}
                  </div>
                  {(showQuakers || quakers != null) && (
                    <div>
                      <div className="text-xs text-muted-foreground">Quakers</div>
                      {isEditingCuppingGrading && showQuakers ? (
                        <Input
                          type="number" step="1" min="0"
                          value={cuppingGradingFormData.grading?.green_bean_data?.quakers ?? quakers ?? ''}
                          onChange={(e) => updateGreenBean('quakers', parseInt(e.target.value) || 0)}
                          className="h-7 text-sm mt-1"
                        />
                      ) : (
                        <div className={`text-sm font-medium ${lockedStyle}`}>{quakers ?? '-'}</div>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground">Green Aspect</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        value={cuppingGradingFormData.grading?.green_bean_data?.green_aspect ?? greenAspect ?? ''}
                        onChange={(e) => updateGreenBean('green_aspect', e.target.value || null)}
                        className="h-7 text-sm mt-1"
                        placeholder="e.g., Good, Fair"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{greenAspect || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Roast Aspect</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        value={cuppingGradingFormData.grading?.roast_data?.roast_aspect ?? roastAspect ?? ''}
                        onChange={(e) => updateRoast('roast_aspect', e.target.value || null)}
                        className="h-7 text-sm mt-1"
                        placeholder="e.g., Good, Fair"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{roastAspect || '-'}</div>
                    )}
                  </div>
                </div>

                {/* Screen Sizes */}
                {(screenEntries.length > 0 || isEditingCuppingGrading) && (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Screen Size (grams)</div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {isEditingCuppingGrading ? (
                        // In edit mode show all standard screen sizes
                        <>
                          {['20', '19', '18', '17', '16', '15', '14', '13', '12', '11', '10', 'Pan'].map(size => {
                            const editScreens = cuppingGradingFormData.grading?.green_bean_data?.screen_sizes || screenSizes || {}
                            return (
                              <div key={size} className="text-center">
                                <div className="text-xs text-muted-foreground mb-1">{size}</div>
                                <Input
                                  type="number" step="0.1" min="0"
                                  value={editScreens[size] ?? ''}
                                  onChange={(e) => updateScreenSize(size, parseFloat(e.target.value) || 0)}
                                  className="h-7 text-sm text-center"
                                />
                              </div>
                            )
                          })}
                        </>
                      ) : (
                        screenEntries.map(([size, grams]) => (
                          <div key={size} className="text-center p-1.5 bg-muted/30 rounded">
                            <div className="text-xs text-muted-foreground">{size}</div>
                            <div className={`text-sm font-medium ${lockedStyle}`}>{grams}g</div>
                            {screenTotal > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {Math.round((grams / screenTotal) * 100)}%
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Defects */}
                {(defectTotal != null || defectPrimary != null || (defectCounts && Object.keys(defectCounts).length > 0) || (defectList && defectList.length > 0) || isEditingCuppingGrading) && (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Defects</div>
                    {(() => {
                      const PRIMARY_NAMES = ['full black', 'full sour', 'pod/cherry', 'pod', 'cherry',
                        'large husk', 'large stone', 'stone/stick', 'stone', 'stick', 'foreign material', 'foreign matter', 'foreign']
                      const isPrimary = (name: string) => PRIMARY_NAMES.some(p => name.toLowerCase().includes(p))

                      // In edit mode, use editDefects state; in view mode, parse from data
                      let allItems: Array<{ name: string; count: number; idx: number }>
                      if (isEditingCuppingGrading) {
                        allItems = editDefects.map((d, i) => ({ ...d, idx: i }))
                      } else {
                        const raw: Array<{ name: string; count: number }> = []
                        if (defectCounts) Object.entries(defectCounts).forEach(([name, count]) => raw.push({ name, count }))
                        if (defectList) defectList.forEach(d => raw.push({ name: d.name, count: d.count }))
                        allItems = raw.map((d, i) => ({ ...d, idx: i }))
                      }

                      const primaryItems = allItems.filter(d => isPrimary(d.name))
                      const secondaryItems = allItems.filter(d => !isPrimary(d.name))
                      const pTotal = primaryItems.reduce((s, d) => s + d.count, 0)
                      const sTotal = secondaryItems.reduce((s, d) => s + d.count, 0)
                      const secMid = Math.ceil(secondaryItems.length / 2)
                      const secCol1 = secondaryItems.slice(0, secMid)
                      const secCol2 = secondaryItems.slice(secMid)
                      const maxRows = Math.max(primaryItems.length, secCol1.length, secCol2.length)

                      const updateCount = (idx: number, count: number) => {
                        setEditDefects(prev => prev.map((d, i) => i === idx ? { ...d, count } : d))
                      }
                      const removeDefect = (idx: number) => {
                        setEditDefects(prev => prev.filter((_, i) => i !== idx))
                      }

                      const renderCell = (item: typeof allItems[0] | undefined) => {
                        if (!item) return null
                        if (isEditingCuppingGrading) {
                          return (
                            <span className="flex items-center gap-1">
                              <span className="text-muted-foreground truncate">{item.name}</span>
                              <Input
                                type="number" min="0" step="1"
                                value={item.count || ''}
                                onChange={(e) => updateCount(item.idx, parseInt(e.target.value) || 0)}
                                className="h-6 w-16 text-xs text-center ml-auto shrink-0"
                              />
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeDefect(item.idx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </span>
                          )
                        }
                        return (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">{item.name}</span>
                            <span className="font-medium text-foreground ml-auto">{item.count}</span>
                          </span>
                        )
                      }

                      return (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="py-1.5 px-2 text-left font-medium" colSpan={3}>
                                  Total: {isEditingCuppingGrading ? pTotal + sTotal : (defectTotal ?? '-')}
                                  <span className="ml-3 font-normal text-muted-foreground">Primary: {isEditingCuppingGrading ? pTotal : (defectPrimary ?? '-')}</span>
                                  <span className="ml-3 font-normal text-muted-foreground">Secondary: {isEditingCuppingGrading ? sTotal : (defectSecondary ?? '-')}</span>
                                </th>
                              </tr>
                              {(primaryItems.length > 0 || secondaryItems.length > 0) && (
                                <tr className="border-b">
                                  <th className="py-1 px-2 text-left font-medium text-muted-foreground">Primary</th>
                                  <th className="py-1 px-2 text-left font-medium text-muted-foreground" colSpan={2}>Secondary</th>
                                </tr>
                              )}
                            </thead>
                            {maxRows > 0 && (
                              <tbody>
                                {Array.from({ length: maxRows }, (_, i) => (
                                  <tr key={i} className={i > 0 ? 'border-t' : ''}>
                                    <td className="py-1 px-2 align-top">{renderCell(primaryItems[i])}</td>
                                    <td className="py-1 px-2 align-top">{renderCell(secCol1[i])}</td>
                                    <td className="py-1 px-2 align-top">{renderCell(secCol2[i])}</td>
                                  </tr>
                                ))}
                              </tbody>
                            )}
                            {isEditingCuppingGrading && (
                              <tfoot>
                                <tr className="border-t">
                                  <td colSpan={3} className="py-1 px-2">
                                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setEditDefects(prev => [...prev, { name: '', count: 0 }])}>
                                      + Add Defect
                                    </Button>
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      )
                    })()}
                  </div>
                )}
                {/* Taints & Faults */}
                {(taintsData.length > 0 || faultsData.length > 0 || isEditingCuppingGrading) && (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Taints & Faults</div>
                    {isEditingCuppingGrading ? (
                      <div className="grid grid-cols-2 gap-4">
                        {/* Taints edit */}
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Taints ({editTaints.length})</div>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <tbody>
                                {editTaints.map((t, idx) => (
                                  <tr key={idx} className={idx > 0 ? 'border-t' : ''}>
                                    <td className="py-1 px-2">
                                      <Select value={t.name || '__empty__'} onValueChange={(v) => setEditTaints(prev => prev.map((x, i) => i === idx ? { ...x, name: v === '__empty__' ? '' : v } : x))}>
                                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__empty__">Select...</SelectItem>
                                          {availableDefectNames.filter(n => !editTaints.some((et, ei) => ei !== idx && et.name === n)).map(n => (
                                            <SelectItem key={n} value={n}>{n}</SelectItem>
                                          ))}
                                          {t.name && !availableDefectNames.includes(t.name) && (
                                            <SelectItem value={t.name}>{t.name}</SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="py-1 px-2 w-20">
                                      <Input type="number" step="0.5" min="0" value={t.intensity ?? ''} onChange={(e) => setEditTaints(prev => prev.map((x, i) => i === idx ? { ...x, intensity: parseFloat(e.target.value) || 0 } : x))} className="h-7 w-20 text-xs text-center" placeholder="Lvl" />
                                    </td>
                                    <td className="py-1 px-2 w-8">
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditTaints(prev => prev.filter((_, i) => i !== idx))}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                                <tr className={editTaints.length > 0 ? 'border-t' : ''}>
                                  <td colSpan={3} className="py-1 px-2">
                                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setEditTaints(prev => [...prev, { name: '', intensity: undefined }])}>
                                      + Add Taint
                                    </Button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                        {/* Faults edit */}
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Faults ({editFaults.length})</div>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <tbody>
                                {editFaults.map((f, idx) => (
                                  <tr key={idx} className={idx > 0 ? 'border-t' : ''}>
                                    <td className="py-1 px-2">
                                      <Select value={f.name || '__empty__'} onValueChange={(v) => setEditFaults(prev => prev.map((x, i) => i === idx ? { ...x, name: v === '__empty__' ? '' : v } : x))}>
                                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__empty__">Select...</SelectItem>
                                          {availableDefectNames.filter(n => !editFaults.some((ef, ei) => ei !== idx && ef.name === n)).map(n => (
                                            <SelectItem key={n} value={n}>{n}</SelectItem>
                                          ))}
                                          {f.name && !availableDefectNames.includes(f.name) && (
                                            <SelectItem value={f.name}>{f.name}</SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="py-1 px-2 w-20">
                                      <Input type="number" step="0.5" min="0" value={f.intensity ?? ''} onChange={(e) => setEditFaults(prev => prev.map((x, i) => i === idx ? { ...x, intensity: parseFloat(e.target.value) || 0 } : x))} className="h-7 w-20 text-xs text-center" placeholder="Lvl" />
                                    </td>
                                    <td className="py-1 px-2 w-8">
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditFaults(prev => prev.filter((_, i) => i !== idx))}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                                <tr className={editFaults.length > 0 ? 'border-t' : ''}>
                                  <td colSpan={3} className="py-1 px-2">
                                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setEditFaults(prev => [...prev, { name: '', intensity: undefined }])}>
                                      + Add Fault
                                    </Button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-6 flex-wrap">
                        {taintsData.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Taints: </span>
                            <span className="text-xs">
                              {taintsData.map((t, i) => (
                                <span key={i}>{i > 0 ? ', ' : ''}{t.name}{t.intensity != null ? ` (${t.intensity})` : ''}</span>
                              ))}
                            </span>
                          </div>
                        )}
                        {faultsData.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">Faults: </span>
                            <span className="text-xs">
                              {faultsData.map((f, i) => (
                                <span key={i}>{i > 0 ? ', ' : ''}{f.name}{f.intensity != null ? ` (${f.intensity})` : ''}</span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )
        })()}

        {/* Edit History */}
        {editHistory.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-3">Edit History</h4>
              <div className="space-y-2">
                {editHistory.map((entry, i) => (
                  <div key={i} className="text-xs border-l-2 border-border pl-3 py-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{entry.edited_by}</span>
                      <span className="text-muted-foreground">{new Date(entry.edited_at).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground">{entry.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
