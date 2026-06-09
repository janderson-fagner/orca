import type React from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type CreatePullRequestLinkedWorkItemRowProps = {
  linkedWorkItemUrl: string
}

export function CreatePullRequestLinkedWorkItemRow({
  linkedWorkItemUrl
}: CreatePullRequestLinkedWorkItemRowProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Link2 className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">Linked work item</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Open linked work item"
            onClick={() => window.api.shell.openUrl(linkedWorkItemUrl)}
          >
            <ExternalLink className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open linked work item</TooltipContent>
      </Tooltip>
    </div>
  )
}
