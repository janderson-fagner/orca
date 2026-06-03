import { describe, expect, it } from 'vitest'
import {
  clearScopedAgentCmdOverride,
  getAgentCommandOverrideRuntimeKey,
  getAgentOverrideExecutableToken,
  resetEffectiveAgentCmdOverride,
  resolveAgentCmdOverridesForRuntime,
  setAgentCmdOverrideForRuntime
} from './agent-command-overrides'
import type { GlobalSettings } from './types'

function makeSettings(overrides: Partial<GlobalSettings>): GlobalSettings {
  return {
    agentCmdOverrides: {},
    ...overrides
  } as GlobalSettings
}

describe('agent command override runtime helpers', () => {
  it('builds stable runtime keys for host, WSL default, and named distros', () => {
    expect(getAgentCommandOverrideRuntimeKey(undefined)).toBe('host')
    expect(getAgentCommandOverrideRuntimeKey({ wslDefault: true })).toBe('wsl:default')
    expect(getAgentCommandOverrideRuntimeKey({ wslDistro: 'Ubuntu' })).toBe('wsl:Ubuntu')
  })

  it('layers runtime-scoped overrides over legacy flat overrides', () => {
    const settings = makeSettings({
      agentCmdOverrides: { codex: 'codex --profile global', claude: 'claude' },
      agentCmdOverridesByRuntime: {
        'wsl:Ubuntu': { codex: 'codex --profile wsl' }
      }
    })

    expect(resolveAgentCmdOverridesForRuntime(settings, { wslDistro: 'Ubuntu' })).toEqual({
      claude: 'claude',
      codex: 'codex --profile wsl'
    })
    expect(resolveAgentCmdOverridesForRuntime(settings, undefined)).toEqual({
      claude: 'claude',
      codex: 'codex --profile global'
    })
  })

  it('writes and clears only scoped overrides unless reset is requested', () => {
    const settings = makeSettings({
      agentCmdOverrides: { codex: 'codex --profile global' },
      agentCmdOverridesByRuntime: {}
    })

    const saved = setAgentCmdOverrideForRuntime(
      settings,
      { wslDefault: true },
      'codex',
      'codex --profile wsl'
    )
    expect(saved.agentCmdOverridesByRuntime).toEqual({
      'wsl:default': { codex: 'codex --profile wsl' }
    })

    const cleared = clearScopedAgentCmdOverride(
      { ...settings, ...saved },
      { wslDefault: true },
      'codex'
    )
    expect(cleared.agentCmdOverridesByRuntime).toEqual({})
    expect(settings.agentCmdOverrides.codex).toBe('codex --profile global')

    const reset = resetEffectiveAgentCmdOverride(
      { ...settings, ...saved },
      { wslDefault: true },
      'codex'
    )
    expect(reset).toEqual({
      agentCmdOverrides: {},
      agentCmdOverridesByRuntime: {}
    })
  })
})

describe('getAgentOverrideExecutableToken', () => {
  it.each([
    ['codex', 'codex'],
    ['codex --profile work', 'codex'],
    ['"C:\\Program Files\\Codex\\codex.exe" --profile work', 'C:\\Program Files\\Codex\\codex.exe'],
    ["'/opt/codex bin/codex' --profile work", '/opt/codex bin/codex'],
    ['& "C:\\Program Files\\Codex\\codex.exe"', 'C:\\Program Files\\Codex\\codex.exe'],
    ['npx codex', 'npx'],
    ['wsl.exe -e codex', 'wsl.exe'],
    ['cmd /c codex', 'cmd']
  ])('extracts %s', (input, expected) => {
    expect(getAgentOverrideExecutableToken(input)).toBe(expected)
  })

  it('rejects unsupported empty and inline-env commands', () => {
    expect(getAgentOverrideExecutableToken('')).toBeNull()
    expect(getAgentOverrideExecutableToken('FOO=bar codex')).toBeNull()
  })
})
