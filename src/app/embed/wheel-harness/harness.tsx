'use client'

import { useCallback, useState } from 'react'
import { DescribeOverlay } from '@/components/cupping/cva/wheel/DescribeOverlay'
import { createEmptyAssessment, type CvaDescribe, type DescribeGroup } from '@/types/cva'

export function WheelHarness() {
  const [describe, setDescribe] = useState<CvaDescribe>(() => createEmptyAssessment().describe)
  const [group, setGroup] = useState<DescribeGroup>('aroma')
  const onDescribe = useCallback((m: (d: CvaDescribe) => CvaDescribe) => setDescribe((d) => m(d)), [])
  const noop = useCallback(() => {}, [])
  return (
    <div className="cva-root" style={{ ['--cva-accent' as string]: '#556b2f' }}>
      <DescribeOverlay open group={group} onGroupChange={setGroup} describe={describe} onDescribe={onDescribe} onClose={noop} />
    </div>
  )
}
