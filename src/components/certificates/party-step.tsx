'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PartyChoice } from '@/components/certificates/party-choice'
import type { PartyOption } from '@/lib/approval-notification/certificate-parties'
import type { CertificateParty } from '@/lib/approval-notification/types'

interface Props {
  options: PartyOption[]
  onContinue: (parties: CertificateParty[]) => void
}

/**
 * First step of a single-lot send: which of the lot's parties get the email.
 * Every party a certificate is owed to starts ticked; the shipper is opt-in.
 * Any of them can be left out, but not all.
 */
export function PartyStep({ options, onContinue }: Props) {
  const [parties, setParties] = useState<CertificateParty[]>(
    options.map((o) => o.party).filter((p) => p !== 'shipper'),
  )
  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h3 className="text-sm font-semibold">Who should receive it</h3>
      <p className="mt-1 text-xs opacity-60">Each party gets its own email. Earlier sends are shown before you send again.</p>
      <div className="mt-4">
        <PartyChoice value={parties} onChange={setParties} options={options} />
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={() => onContinue(parties)} disabled={parties.length === 0}>
          Continue
        </Button>
      </div>
    </div>
  )
}
