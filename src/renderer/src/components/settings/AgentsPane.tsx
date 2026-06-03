/* eslint-disable max-lines -- Why: the Agents pane keeps catalog rows, default
   selection, per-agent controls, and runtime location together so settings
   reconciliation stays visible in one file. */
import { useMemo, useRef, useState } from 'react'
import { Check, ExternalLink, RefreshCw, Terminal } from 'lucide-react'
import type { GlobalSettings, TuiAgent } from '../../../../shared/types'
import { AGENT_CATALOG, AgentIcon } from '@/lib/agent-catalog'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { useAppStore } from '@/store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '@/lib/utils'
import { AgentAwakeSetting } from './AgentAwakeSetting'
import {
  AGENT_GENERATED_TAB_TITLES_DESCRIPTION,
  AGENT_GENERATED_TAB_TITLES_TITLE
} from './agent-generated-tab-title-copy'
import { AgentLocationSetting } from './AgentLocationSetting'
import { AGENT_STATUS_HOOKS_DESCRIPTION, AGENT_STATUS_HOOKS_TITLE } from './agent-status-hooks-copy'
import {
  SettingsBadge,
  SettingsSegmentedControl,
  SettingsSubsectionHeader,
  SettingsSwitchRow
} from './SettingsFormControls'
import {
  isTuiAgentEnabled,
  normalizeDisabledTuiAgents
} from '../../../../shared/tui-agent-selection'
import {
  resolveAgentCmdOverridesForRuntime,
  resetEffectiveAgentCmdOverride,
  setAgentCmdOverrideForRuntime
} from '../../../../shared/agent-command-overrides'
import {
  getLocalAgentPreflightContext,
  type LocalPreflightContext
} from '@/lib/local-preflight-context'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'

export { AGENTS_PANE_SEARCH_ENTRIES } from './agents-search'

const EMPTY_WSL_DISTROS: string[] = []

type AgentsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
}

type AgentAvailabilityUpdateQueueOptions = {
  getSettings: () => GlobalSettings | null | undefined
  fallbackSettings: GlobalSettings
  updateSettings: AgentsPaneProps['updateSettings']
  agentId: TuiAgent
  enabled: boolean
}

type AgentRowProps = {
  agentId: TuiAgent
  label: string
  homepageUrl: string
  defaultCmd: string
  isAvailable: boolean
  catalogFound: boolean
  overrideFound: boolean
  isEnabled: boolean
  isDefault: boolean
  cmdOverride: string | undefined
  detectionPathScopeLabel: string
  detectionPathScopeName: string
  onSetDefault: () => void
  onSetEnabled: (enabled: boolean) => void
  onSaveOverride: (value: string) => void
  onResetOverride: () => void
}

type AgentAvailability = 'enabled' | 'disabled'

type AgentAvailabilityControlProps = {
  label: string
  isEnabled: boolean
  onSetEnabled: (enabled: boolean) => void
}

export function buildAgentAvailabilitySettingsUpdate(
  settings: Pick<GlobalSettings, 'defaultTuiAgent' | 'disabledTuiAgents'>,
  id: TuiAgent,
  enabled: boolean
): Pick<GlobalSettings, 'disabledTuiAgents'> & Partial<Pick<GlobalSettings, 'defaultTuiAgent'>> {
  const latestDisabled = normalizeDisabledTuiAgents(settings.disabledTuiAgents)
  const nextDisabled = enabled
    ? latestDisabled.filter((agent) => agent !== id)
    : latestDisabled.includes(id)
      ? latestDisabled
      : [...latestDisabled, id]

  return {
    disabledTuiAgents: nextDisabled,
    ...(settings.defaultTuiAgent === id && !enabled ? { defaultTuiAgent: null } : {})
  }
}

export function createAgentAvailabilityUpdateQueue(): (
  options: AgentAvailabilityUpdateQueueOptions
) => Promise<void> {
  let pendingUpdate: Promise<unknown> = Promise.resolve()

  return ({ getSettings, fallbackSettings, updateSettings, agentId, enabled }) => {
    // Why: serialize full-array replacements so each write sees the store after
    // the previous IPC has reconciled, while preserving the user's requested state.
    pendingUpdate = pendingUpdate
      .catch(() => {})
      .then(() =>
        updateSettings(
          buildAgentAvailabilitySettingsUpdate(getSettings() ?? fallbackSettings, agentId, enabled)
        )
      )
    return pendingUpdate.then(() => undefined)
  }
}

const enqueueAgentAvailabilityUpdate = createAgentAvailabilityUpdateQueue()

export function AgentAvailabilityControl({
  label,
  isEnabled,
  onSetEnabled
}: AgentAvailabilityControlProps): React.JSX.Element {
  const value: AgentAvailability = isEnabled ? 'enabled' : 'disabled'

  return (
    <SettingsSegmentedControl<AgentAvailability>
      value={value}
      onChange={(next) => {
        if (next !== value) {
          onSetEnabled(next === 'enabled')
        }
      }}
      ariaLabel={`${label} availability`}
      size="sm"
      options={[
        { value: 'enabled', label: 'Enabled' },
        { value: 'disabled', label: 'Disabled' }
      ]}
    />
  )
}

type AgentCommandOverrideInputProps = {
  label: string
  defaultCmd: string
  cmdOverride: string | undefined
  detectionPathScopeLabel: string
  onSaveOverride: (value: string) => void
  onResetOverride: () => void
}

function AgentCommandOverrideInput({
  label,
  defaultCmd,
  cmdOverride,
  detectionPathScopeLabel,
  onSaveOverride,
  onResetOverride
}: AgentCommandOverrideInputProps): React.JSX.Element {
  const draftSeed = cmdOverride ?? ''
  const [cmdDraft, setCmdDraft] = useState(draftSeed)
  const isCancelingRef = useRef(false)

  const commitCmd = (): void => {
    if (isCancelingRef.current) {
      isCancelingRef.current = false
      return
    }
    const trimmed = cmdDraft.trim()
    if (!trimmed || trimmed === defaultCmd) {
      onResetOverride()
      setCmdDraft('')
    } else {
      onSaveOverride(trimmed)
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="block text-xs text-muted-foreground">{detectionPathScopeLabel}</span>
      <Input
        value={cmdDraft}
        onChange={(e) => setCmdDraft(e.target.value)}
        onBlur={commitCmd}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            // Why: set ref to prevent the synchronous blur event from committing the canceled draft.
            isCancelingRef.current = true
            setCmdDraft(draftSeed)
            e.currentTarget.blur()
          }
        }}
        placeholder={defaultCmd}
        spellCheck={false}
        className="h-8 font-mono text-xs"
      />
      {cmdOverride && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            onResetOverride()
            setCmdDraft('')
          }}
          className="h-auto p-0 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Reset
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Used only to detect {label}. Launch still runs{' '}
        <span className="font-mono text-foreground/80">{defaultCmd}</span>.
      </p>
    </div>
  )
}

function AgentRow({
  agentId,
  label,
  homepageUrl,
  defaultCmd,
  isAvailable,
  catalogFound,
  overrideFound,
  isEnabled,
  isDefault,
  cmdOverride,
  detectionPathScopeLabel,
  detectionPathScopeName,
  onSetDefault,
  onSetEnabled,
  onSaveOverride,
  onResetOverride
}: AgentRowProps): React.JSX.Element {
  const [cmdOpen, setCmdOpen] = useState(Boolean(cmdOverride && !overrideFound))
  const availabilityDescription = isEnabled
    ? isAvailable
      ? 'Shown in launch and default choices.'
      : null
    : isAvailable
      ? 'Hidden from launch and default choices.'
      : 'Hidden from launch and default choices if installed.'
  const statusBadge = cmdOverride ? (
    overrideFound ? (
      <SettingsBadge tone="accent">Detected via path</SettingsBadge>
    ) : (
      <SettingsBadge tone="destructive">Path not found</SettingsBadge>
    )
  ) : catalogFound ? (
    <SettingsBadge tone="accent">Detected</SettingsBadge>
  ) : (
    <SettingsBadge tone="muted">Not installed</SettingsBadge>
  )
  const showAddDetectionPathLink = isEnabled && !cmdOverride && !isAvailable
  const showEditDetectionPathLink = Boolean(cmdOverride)
  const detectionPathActionLabel = cmdOpen
    ? 'Hide detection path'
    : showEditDetectionPathLink
      ? 'Edit detection path'
      : 'Already installed? Add detection path'

  return (
    <div className={cn('py-3', !isAvailable && 'opacity-70')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/50">
          <AgentIcon agent={agentId} size={16} />
        </div>

        <div className="min-w-0 flex-1 sm:min-w-[12rem]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium leading-none">{label}</span>
            {statusBadge}
            {!isEnabled && <SettingsBadge tone="muted">Disabled</SettingsBadge>}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {defaultCmd}
          </div>
          {cmdOverride && (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              Detection path: <span className="font-mono text-foreground/80">{cmdOverride}</span>
            </div>
          )}
          {availabilityDescription && (
            <div className="mt-1 text-[11px] text-muted-foreground">{availabilityDescription}</div>
          )}
          {(showAddDetectionPathLink || showEditDetectionPathLink) && (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => setCmdOpen((prev) => !prev)}
              aria-expanded={cmdOpen}
              className="mt-1 h-auto p-0 text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              {detectionPathActionLabel}
            </Button>
          )}
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <AgentAvailabilityControl
            label={label}
            isEnabled={isEnabled}
            onSetEnabled={onSetEnabled}
          />

          {isAvailable && isEnabled && (
            <Button
              type="button"
              variant={isDefault ? 'secondary' : 'ghost'}
              size="xs"
              onClick={onSetDefault}
              title={isDefault ? 'Default agent' : 'Set as default'}
              className="h-7 gap-1 text-xs"
            >
              {isDefault && <Check className="size-3" />}
              {isDefault ? 'Default' : 'Set default'}
            </Button>
          )}

          <a
            href={homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={isAvailable ? 'Docs' : 'Install'}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {cmdOpen && (
        <div className="mt-3 pl-10">
          {/* Why: key by the persisted seed so settings changes reset the draft during reconciliation, not in a follow-up effect commit. */}
          <AgentCommandOverrideInput
            key={cmdOverride ?? defaultCmd}
            label={label}
            defaultCmd={defaultCmd}
            cmdOverride={cmdOverride}
            detectionPathScopeLabel={detectionPathScopeLabel}
            onSaveOverride={onSaveOverride}
            onResetOverride={onResetOverride}
          />
          {cmdOverride && !overrideFound && (
            <p className="mt-1 text-[11px] text-destructive">
              Path not found. Paste the result of which {defaultCmd} from {detectionPathScopeName}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

type DefaultAgentPillProps = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function DefaultAgentPill({ active, onClick, children }: DefaultAgentPillProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active
          ? 'border-muted-foreground/40 bg-accent font-medium text-accent-foreground'
          : 'border-border bg-background/50 text-muted-foreground hover:border-muted-foreground/35 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function getDetectionPathScopeName(context: LocalPreflightContext): string {
  if (context?.wslDistro) {
    return `WSL ${context.wslDistro}`
  }
  if (context?.wslDefault) {
    return 'WSL default'
  }
  return CLIENT_PLATFORM === 'win32' ? 'Windows' : 'this computer'
}

function getDetectionPathScopeLabel(context: LocalPreflightContext): string {
  return `Detection path for ${getDetectionPathScopeName(context)}`
}

export function AgentsPane({
  settings,
  updateSettings,
  wslSupportedPlatform = false,
  wslAvailable = false,
  wslDistros = EMPTY_WSL_DISTROS,
  wslCapabilitiesLoading = false
}: AgentsPaneProps): React.JSX.Element {
  const { detectedIds: detectedList, detectedResults, isRefreshing, refresh } = useDetectedAgents()
  const localAgentContext = useAppStore(getLocalAgentPreflightContext)
  // Why: refresh re-spawns the user's login shell to re-capture PATH
  // (preflight:refreshAgents on the main side). This handles the
  // "installed a new CLI, Orca doesn't see it yet" case without a restart.
  const handleRefresh = (): void => {
    void refresh()
  }
  const detectedIds = useMemo<Set<string> | null>(
    () => (detectedList ? new Set(detectedList) : null),
    [detectedList]
  )
  const detectedByAgent = useMemo(
    () => new Map((detectedResults ?? []).map((entry) => [entry.id, entry])),
    [detectedResults]
  )

  const defaultAgent = settings.defaultTuiAgent
  const cmdOverrides = resolveAgentCmdOverridesForRuntime(settings, localAgentContext)
  const detectionPathScopeName = getDetectionPathScopeName(localAgentContext)
  const detectionPathScopeLabel = getDetectionPathScopeLabel(localAgentContext)
  const disabledAgents = normalizeDisabledTuiAgents(settings.disabledTuiAgents)

  const setDefault = (id: TuiAgent | 'blank' | null): void => {
    updateSettings({ defaultTuiAgent: id })
  }

  const setAgentEnabled = (id: TuiAgent, enabled: boolean): void => {
    void enqueueAgentAvailabilityUpdate({
      getSettings: () => useAppStore.getState().settings,
      fallbackSettings: settings,
      updateSettings,
      agentId: id,
      enabled
    })
  }

  const saveOverride = (id: TuiAgent, value: string): void => {
    updateSettings(setAgentCmdOverrideForRuntime(settings, localAgentContext, id, value))
  }

  const resetOverride = (id: TuiAgent): void => {
    updateSettings(resetEffectiveAgentCmdOverride(settings, localAgentContext, id))
  }

  // Why: null means detection is in flight, not "all agents are installed".
  // Showing the full catalog here makes the default-agent picker flash invalid
  // options while switching between Windows and WSL detection contexts.
  const availableAgents =
    detectedIds === null ? [] : AGENT_CATALOG.filter((agent) => detectedIds.has(agent.id))
  const enabledAvailableAgents = availableAgents.filter((agent) =>
    isTuiAgentEnabled(agent.id, disabledAgents)
  )
  const undetectedAgents = AGENT_CATALOG.filter(
    (a) => detectedIds !== null && !detectedIds.has(a.id)
  )

  // Why: 'blank' is an explicit no-agent preference, not an auto fallback,
  // so the Auto pill should only light up when the default is null OR when a
  // selected agent id is no longer detected on PATH.
  const isAutoDefault =
    defaultAgent === null ||
    (defaultAgent !== 'blank' &&
      (!detectedIds?.has(defaultAgent) || !isTuiAgentEnabled(defaultAgent, disabledAgents)))
  const isBlankDefault = defaultAgent === 'blank'

  return (
    <div className="space-y-8">
      <AgentLocationSetting
        settings={settings}
        updateSettings={updateSettings}
        refresh={refresh}
        wslSupportedPlatform={wslSupportedPlatform}
        wslAvailable={wslAvailable}
        wslDistros={wslDistros}
        wslCapabilitiesLoading={wslCapabilitiesLoading}
      />

      <section className="space-y-4">
        <SettingsSubsectionHeader
          title="Default Agent"
          description="Pre-selected agent when opening a new workspace."
        />

        <div className="flex flex-wrap gap-2">
          <DefaultAgentPill active={isAutoDefault} onClick={() => setDefault(null)}>
            {isAutoDefault && <Check className="size-3.5" />}
            Auto
          </DefaultAgentPill>

          {/* Why: users who prefer to open a raw shell by default need a
              first-class "no agent" choice here - without it, the Auto pill
              is the closest option but silently launches the first detected
              agent, which is the opposite of what they want. */}
          <DefaultAgentPill active={isBlankDefault} onClick={() => setDefault('blank')}>
            <Terminal className="size-3.5" />
            No agent (blank terminal)
            {isBlankDefault && <Check className="size-3.5" />}
          </DefaultAgentPill>

          {enabledAvailableAgents.map((agent) => {
            const isActive = defaultAgent === agent.id
            return (
              <DefaultAgentPill
                key={agent.id}
                active={isActive}
                onClick={() => setDefault(agent.id)}
              >
                <AgentIcon agent={agent.id} size={14} />
                {agent.label}
                {isActive && <Check className="size-3.5" />}
              </DefaultAgentPill>
            )
          })}
        </div>
      </section>

      <AgentStatusHooksSetting settings={settings} updateSettings={updateSettings} />

      <AgentGeneratedTabTitlesSetting settings={settings} updateSettings={updateSettings} />

      <AgentAwakeSetting settings={settings} updateSettings={updateSettings} />

      {availableAgents.length > 0 && (
        <section className="space-y-3">
          <SettingsSubsectionHeader
            title={
              <span className="flex items-center gap-2">
                Available
                <SettingsBadge tone="accent">{availableAgents.length} available</SettingsBadge>
              </span>
            }
            action={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Re-read your shell PATH and re-detect installed agents"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            }
          />

          <div className="divide-y divide-border/40">
            {availableAgents.map((agent) => {
              const detection = detectedByAgent.get(agent.id)
              return (
                <AgentRow
                  key={agent.id}
                  agentId={agent.id}
                  label={agent.label}
                  homepageUrl={agent.homepageUrl}
                  defaultCmd={agent.cmd}
                  isAvailable
                  catalogFound={detection?.catalogFound ?? true}
                  overrideFound={detection?.overrideFound ?? false}
                  isEnabled={isTuiAgentEnabled(agent.id, disabledAgents)}
                  isDefault={defaultAgent === agent.id}
                  cmdOverride={cmdOverrides[agent.id]}
                  detectionPathScopeLabel={detectionPathScopeLabel}
                  detectionPathScopeName={detectionPathScopeName}
                  onSetDefault={() => setDefault(agent.id)}
                  onSetEnabled={(enabled) => setAgentEnabled(agent.id, enabled)}
                  onSaveOverride={(v) => saveOverride(agent.id, v)}
                  onResetOverride={() => resetOverride(agent.id)}
                />
              )
            })}
          </div>
        </section>
      )}

      {undetectedAgents.length > 0 && (
        <section className="space-y-3">
          <SettingsSubsectionHeader
            title={
              <span className="flex items-center gap-2 text-muted-foreground">
                Available to install
                <SettingsBadge tone="muted">{undetectedAgents.length} agents</SettingsBadge>
              </span>
            }
          />

          <div className="divide-y divide-border/40">
            {undetectedAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agentId={agent.id}
                label={agent.label}
                homepageUrl={agent.homepageUrl}
                defaultCmd={agent.cmd}
                isAvailable={false}
                catalogFound={false}
                overrideFound={false}
                isEnabled={isTuiAgentEnabled(agent.id, disabledAgents)}
                isDefault={false}
                cmdOverride={cmdOverrides[agent.id]}
                detectionPathScopeLabel={detectionPathScopeLabel}
                detectionPathScopeName={detectionPathScopeName}
                onSetDefault={() => {}}
                onSetEnabled={(enabled) => setAgentEnabled(agent.id, enabled)}
                onSaveOverride={(v) => saveOverride(agent.id, v)}
                onResetOverride={() => resetOverride(agent.id)}
              />
            ))}
          </div>
        </section>
      )}

      {detectedIds === null && (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border/50 py-6 text-sm text-muted-foreground">
          Detecting installed agents...
        </div>
      )}
    </div>
  )
}

export function AgentStatusHooksSetting({
  settings,
  updateSettings
}: AgentsPaneProps): React.JSX.Element {
  const enabled = settings.agentStatusHooksEnabled !== false
  return (
    <section className="space-y-3">
      <SettingsSwitchRow
        label={AGENT_STATUS_HOOKS_TITLE}
        description={AGENT_STATUS_HOOKS_DESCRIPTION}
        checked={enabled}
        onChange={() =>
          updateSettings({
            agentStatusHooksEnabled: !enabled
          })
        }
        ariaLabel={AGENT_STATUS_HOOKS_TITLE}
      />
    </section>
  )
}

export function AgentGeneratedTabTitlesSetting({
  settings,
  updateSettings
}: AgentsPaneProps): React.JSX.Element {
  const enabled = settings.tabAutoGenerateTitle === true
  return (
    <section className="space-y-3">
      <SettingsSwitchRow
        label={AGENT_GENERATED_TAB_TITLES_TITLE}
        description={AGENT_GENERATED_TAB_TITLES_DESCRIPTION}
        checked={enabled}
        onChange={() =>
          updateSettings({
            tabAutoGenerateTitle: !enabled
          })
        }
        ariaLabel={AGENT_GENERATED_TAB_TITLES_TITLE}
      />
    </section>
  )
}
