import type { GlobalSettings, TuiAgent } from './types'

export type AgentCommandOverrideRuntimeContext =
  | {
      wslDistro?: string | null
      wslDefault?: boolean
    }
  | undefined

export type AgentDetectionProvenance = {
  id: TuiAgent
  catalogFound: boolean
  overrideFound: boolean
}

export type AgentCommandOverrideSettings = {
  agentCmdOverrides?: Partial<Record<TuiAgent, string>>
  agentCmdOverridesByRuntime?: Record<string, Partial<Record<TuiAgent, string>>>
}

export function getAgentCommandOverrideRuntimeKey(
  context?: AgentCommandOverrideRuntimeContext
): string {
  const distro = context?.wslDistro?.trim()
  if (distro) {
    return `wsl:${distro}`
  }
  return context?.wslDefault ? 'wsl:default' : 'host'
}

export function resolveAgentCmdOverridesForRuntime(
  settings: AgentCommandOverrideSettings | null | undefined,
  context?: AgentCommandOverrideRuntimeContext
): Partial<Record<TuiAgent, string>> {
  const legacy = settings?.agentCmdOverrides ?? {}
  const scoped =
    settings?.agentCmdOverridesByRuntime?.[getAgentCommandOverrideRuntimeKey(context)] ?? {}
  return { ...legacy, ...scoped }
}

export function setAgentCmdOverrideForRuntime(
  settings: Pick<GlobalSettings, 'agentCmdOverridesByRuntime'> | AgentCommandOverrideSettings,
  context: AgentCommandOverrideRuntimeContext,
  agent: TuiAgent,
  command: string
): Pick<GlobalSettings, 'agentCmdOverridesByRuntime'> {
  return updateScopedAgentCmdOverride(settings, context, agent, command.trim() || null)
}

export function clearScopedAgentCmdOverride(
  settings: Pick<GlobalSettings, 'agentCmdOverridesByRuntime'> | AgentCommandOverrideSettings,
  context: AgentCommandOverrideRuntimeContext,
  agent: TuiAgent
): Pick<GlobalSettings, 'agentCmdOverridesByRuntime'> {
  return updateScopedAgentCmdOverride(settings, context, agent, null)
}

export function resetEffectiveAgentCmdOverride(
  settings: AgentCommandOverrideSettings,
  context: AgentCommandOverrideRuntimeContext,
  agent: TuiAgent
): Pick<GlobalSettings, 'agentCmdOverrides' | 'agentCmdOverridesByRuntime'> {
  const scopedUpdate = clearScopedAgentCmdOverride(settings, context, agent)
  const nextLegacy = { ...settings.agentCmdOverrides }
  delete nextLegacy[agent]
  return {
    ...scopedUpdate,
    agentCmdOverrides: nextLegacy
  }
}

export function getAgentOverrideExecutableToken(command: string): string | null {
  let input = command.trim()
  if (!input) {
    return null
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(input)) {
    return null
  }
  if (input.startsWith('&')) {
    input = input.slice(1).trimStart()
  }
  const quote = input[0]
  if (quote === '"' || quote === "'") {
    const end = input.indexOf(quote, 1)
    if (end <= 1) {
      return null
    }
    return input.slice(1, end)
  }
  const token = input.split(/\s+/, 1)[0]?.trim()
  return token || null
}

function updateScopedAgentCmdOverride(
  settings: Pick<GlobalSettings, 'agentCmdOverridesByRuntime'> | AgentCommandOverrideSettings,
  context: AgentCommandOverrideRuntimeContext,
  agent: TuiAgent,
  command: string | null
): Pick<GlobalSettings, 'agentCmdOverridesByRuntime'> {
  const runtimeKey = getAgentCommandOverrideRuntimeKey(context)
  const byRuntime = { ...settings.agentCmdOverridesByRuntime }
  const scoped = { ...byRuntime[runtimeKey] }
  if (command) {
    scoped[agent] = command
  } else {
    delete scoped[agent]
  }
  if (Object.keys(scoped).length > 0) {
    byRuntime[runtimeKey] = scoped
  } else {
    delete byRuntime[runtimeKey]
  }
  return { agentCmdOverridesByRuntime: byRuntime }
}
