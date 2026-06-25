'use client'

import { Card, CardContent } from '@/components/ui/card'
import { OtherSampleRecipientsPanel } from '@/components/samples/other-sample-recipients-panel'
import type { CertSample } from './use-cert-editor'

export function OtherSections({ sample, onRecipientsChange }: { sample: CertSample; onRecipientsChange: () => void }) {
  const showLogistics = sample.awb_number || sample.courier_name || sample.is_quick_look
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {showLogistics ? (
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">AWB</div>
                <div className="font-medium">{sample.awb_number || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Courier</div>
                <div className="font-medium">{sample.courier_name || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Inspection mode</div>
                <div className="font-medium">{sample.is_quick_look ? 'Quick look' : 'Full SCA'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <OtherSampleRecipientsPanel
        sampleId={sample.id}
        recipients={(sample.sample_recipients as any) || []}
        onChange={onRecipientsChange}
      />
    </div>
  )
}
