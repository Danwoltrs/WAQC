import { notFound } from 'next/navigation'
import { WheelHarness } from './harness'

// Dev-only: the perf scripts in scripts/perf drive this page. /embed/* is public
// in middleware, so production must 404 it — unless WHEEL_HARNESS=1 is set at
// build AND start time, for measuring a local production build (never on Vercel).
export default function WheelHarnessPage() {
  if (process.env.NODE_ENV === 'production' && process.env.WHEEL_HARNESS !== '1') notFound()
  return <WheelHarness />
}
