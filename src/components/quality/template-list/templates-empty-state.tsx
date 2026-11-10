import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Empty list. The header already carries the filled New template button, so this one is outline. */
export function TemplatesEmptyState({ searching, onCreate }: { searching: boolean; onCreate: () => void }) {
  return (
    <div className="py-16 px-6 text-center">
      <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
      <h3 className="text-sm font-semibold mb-1">No templates found</h3>
      <p className="text-sm text-muted-foreground mb-4">
        {searching ? 'Try adjusting your search criteria' : 'Get started by creating your first quality template'}
      </p>
      {!searching && (
        <Button variant="outline" onClick={onCreate}>
          <Plus /> New template
        </Button>
      )}
    </div>
  )
}
