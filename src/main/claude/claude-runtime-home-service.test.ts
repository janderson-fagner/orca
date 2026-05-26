import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as NodeOs from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/types'
import type { ClaudeRuntimeAuthPreparation } from '../claude-accounts/runtime-auth-service'
import { ClaudeRuntimeHomeService } from './claude-runtime-home-service'

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<() => string>()
}))

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof NodeOs>('node:os')
  return {
    ...actual,
    homedir: homedirMock
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-test-user-data'
  }
}))

let fakeHomeDir: string
let userDataDir: string
let previousUserDataPath: string | undefined

function createSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    agentStatusHooksEnabled: true,
    claudeManagedAccounts: [],
    activeClaudeManagedAccountId: null,
    ...overrides
  } as GlobalSettings
}

function createStore(settings: GlobalSettings) {
  return {
    getSettings: vi.fn(() => settings)
  }
}

function createRuntimeAuth() {
  return {
    prepareForClaudeLaunch: vi.fn(
      async (options?: { configDir?: string }): Promise<ClaudeRuntimeAuthPreparation> => {
        const configDir = options?.configDir ?? join(fakeHomeDir, '.claude')
        return {
          configDir,
          envPatch: options?.configDir ? { CLAUDE_CONFIG_DIR: options.configDir } : {},
          stripAuthEnv: false,
          provenance: 'system'
        }
      }
    )
  }
}

beforeEach(() => {
  fakeHomeDir = mkdtempSync(join(tmpdir(), 'orca-claude-runtime-home-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'orca-claude-runtime-user-data-'))
  previousUserDataPath = process.env.ORCA_USER_DATA_PATH
  process.env.ORCA_USER_DATA_PATH = userDataDir
  homedirMock.mockReturnValue(fakeHomeDir)
})

afterEach(() => {
  rmSync(fakeHomeDir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
  if (previousUserDataPath === undefined) {
    delete process.env.ORCA_USER_DATA_PATH
  } else {
    process.env.ORCA_USER_DATA_PATH = previousUserDataPath
  }
  vi.clearAllMocks()
})

describe('ClaudeRuntimeHomeService', () => {
  it('uses legacy auth prep when agent status hooks are disabled', async () => {
    const runtimeAuth = createRuntimeAuth()
    const service = new ClaudeRuntimeHomeService(
      createStore(createSettings({ agentStatusHooksEnabled: false })) as never,
      runtimeAuth as never
    )

    const result = await service.prepareForClaudeLaunch({ cwd: '/repo' })

    expect(result.mode).toBe('legacy')
    expect(runtimeAuth.prepareForClaudeLaunch).toHaveBeenCalledWith()
  })

  it('prepares mirrored runtime home and scoped auth when enabled', async () => {
    mkdirSync(join(fakeHomeDir, '.claude'), { recursive: true })
    writeFileSync(join(fakeHomeDir, '.claude', 'settings.json'), '{ "model": "haiku" }\n')
    const runtimeAuth = createRuntimeAuth()
    const service = new ClaudeRuntimeHomeService(
      createStore(createSettings()) as never,
      runtimeAuth as never
    )

    const result = await service.prepareForClaudeLaunch({ cwd: '/repo' })

    const configDir = join(userDataDir, 'claude-runtime-home', 'home')
    expect(result.mode).toBe('runtime')
    expect(result.auth.configDir).toBe(configDir)
    expect(runtimeAuth.prepareForClaudeLaunch).toHaveBeenCalledWith({ configDir })
    expect(existsSync(join(configDir, 'settings.json'))).toBe(true)
    expect(readFileSync(join(configDir, 'settings.json'), 'utf-8')).toContain('"model": "haiku"')
  })
})
