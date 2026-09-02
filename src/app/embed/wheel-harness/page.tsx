import { notFound } from 'next/navigation'
import { WheelHarness } from './harness'

// Dev-only: the perf scripts in scripts/perf drive this page. /embed/* is public
// in middleware, so production must 404 it.
export default function WheelHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <WheelHarness />
}
