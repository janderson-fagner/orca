import {
  getTuiAgentDetectCommands,
  isTuiAgent,
  TUI_AGENT_CONFIG
} from '../../shared/tui-agent-config'
import type { TuiAgent } from '../../shared/types'
import {
  getAgentOverrideExecutableToken,
  type AgentDetectionProvenance
} from '../../shared/agent-command-overrides'

export const KNOWN_AGENT_COMMANDS = Object.entries(TUI_AGENT_CONFIG).flatMap(([id, config]) =>
  getTuiAgentDetectCommands(config).map((cmd) => ({
    id,
    cmd
  }))
)

export function getOverrideExecutableChecks(
  overrides: Partial<Record<TuiAgent, string>> | undefined
): { id: TuiAgent; executable: string }[] {
  return Object.entries(overrides ?? {}).flatMap(([id, command]) => {
    if (!isTuiAgent(id) || typeof command !== 'string') {
      return []
    }
    const executable = getAgentOverrideExecutableToken(command)
    return executable ? [{ id, executable }] : []
  })
}

export function buildAgentDetectionProvenance(
  catalogChecks: readonly { id: TuiAgent; installed: boolean }[],
  overrideChecks: readonly { id: TuiAgent; installed: boolean }[]
): AgentDetectionProvenance[] {
  const catalogFound = new Set(catalogChecks.filter((c) => c.installed).map((c) => c.id))
  const overrideFound = new Set(overrideChecks.filter((c) => c.installed).map((c) => c.id))
  return (Object.keys(TUI_AGENT_CONFIG) as TuiAgent[])
    .map((id) => ({
      id,
      catalogFound: catalogFound.has(id),
      overrideFound: overrideFound.has(id)
    }))
    .filter((entry) => entry.catalogFound || entry.overrideFound)
}
