import { getExecutionHostLabel } from '../../../../shared/execution-host'
import type { ProjectHostSetupState, Repo } from '../../../../shared/types'
import { useAppStore } from '../../store'
import { getProjectHostSetupProjectionFromState } from '../../store/selectors'
import { cn } from '../../lib/utils'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsBadge } from './SettingsFormControls'
import { matchesSettingsSearch } from './settings-search'
import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'

type RepositoryHostSetupsSectionProps = {
  repo: Repo
  forceVisible: boolean
  searchQuery: string
  searchEntries: SettingsSearchEntry[]
}

function getSetupStateLabel(setupState: ProjectHostSetupState): string {
  switch (setupState) {
    case 'ready':
      return translate('auto.components.settings.RepositoryPane.hostSetupStateReady', 'Ready')
    case 'not-set-up':
      return translate(
        'auto.components.settings.RepositoryPane.hostSetupStateNotSetUp',
        'Not set up'
      )
    case 'setting-up':
      return translate(
        'auto.components.settings.RepositoryPane.hostSetupStateSettingUp',
        'Setting up'
      )
    case 'error':
      return translate('auto.components.settings.RepositoryPane.hostSetupStateError', 'Error')
    case 'unsupported':
      return translate(
        'auto.components.settings.RepositoryPane.hostSetupStateUnsupported',
        'Unsupported'
      )
  }
}

export function RepositoryHostSetupsSection({
  repo,
  forceVisible,
  searchQuery,
  searchEntries
}: RepositoryHostSetupsSectionProps): React.JSX.Element | null {
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const projectHostSetupProjection = useAppStore((state) =>
    getProjectHostSetupProjectionFromState(state)
  )
  const selectedProjectHostSetup = projectHostSetupProjection.setups.find(
    (setup) => setup.repoId === repo.id
  )
  const projectHostSetups = selectedProjectHostSetup
    ? projectHostSetupProjection.setups.filter(
        (setup) => setup.projectId === selectedProjectHostSetup.projectId
      )
    : []

  if (
    projectHostSetups.length <= 1 ||
    (!forceVisible && !matchesSettingsSearch(searchQuery, searchEntries))
  ) {
    return null
  }

  return (
    <SearchableSetting
      title={translate('auto.components.settings.RepositoryPane.availableHosts', 'Available Hosts')}
      description={translate(
        'auto.components.settings.RepositoryPane.availableHostsDescription',
        'Hosts where this project is set up.'
      )}
      keywords={[repo.displayName, 'host', 'ssh', 'remote', 'vm', 'path']}
      className="space-y-3"
      forceVisible={forceVisible}
    >
      <div className="space-y-1">
        <Label className="text-sm font-semibold">
          {translate('auto.components.settings.RepositoryPane.availableHosts', 'Available Hosts')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.RepositoryPane.availableHostsHelp',
            'Project paths and worktree settings are host-specific; creating a workspace can target any ready setup.'
          )}
        </p>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {projectHostSetups.map((setup) => {
          const isCurrentSetup = setup.repoId === repo.id
          return (
            <button
              key={setup.id}
              type="button"
              className={cn(
                'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                isCurrentSetup ? 'bg-muted/30' : 'hover:bg-muted/40'
              )}
              onClick={() => {
                openSettingsPage()
                openSettingsTarget({ pane: 'repo', repoId: setup.repoId })
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {getExecutionHostLabel(setup.hostId)}
                  </span>
                  <SettingsBadge tone={setup.setupState === 'ready' ? 'accent' : 'muted'}>
                    {getSetupStateLabel(setup.setupState)}
                  </SettingsBadge>
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {setup.path}
                </p>
              </div>
              {isCurrentSetup ? (
                <SettingsBadge>
                  {translate('auto.components.settings.RepositoryPane.currentSetup', 'Current')}
                </SettingsBadge>
              ) : null}
            </button>
          )
        })}
      </div>
    </SearchableSetting>
  )
}
