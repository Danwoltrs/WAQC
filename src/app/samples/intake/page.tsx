import { SampleIntakeForm } from '@/components/samples/sample-intake-form'

export default function SampleIntakePage() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Sample Intake</h1>
          <p className="text-muted-foreground">
            Create a new coffee sample record in the quality control system
          </p>
        </div>

        <SampleIntakeForm />
      </div>
    </div>
  )
}
