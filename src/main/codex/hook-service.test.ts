import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import type * as Os from 'os'
import { join } from 'path'

const { getPathMock, homedirMock } = vi.hoisted(() => ({
  getPathMock: vi.fn<(name: string) => string>(),
  homedirMock: vi.fn<() => string>()
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof Os>()
  return {
    ...actual,
    homedir: homedirMock
  }
})

import { CodexHookService } from './hook-service'

let tmpHome: string
let userDataDir: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'orca-codex-home-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'orca-codex-user-data-'))
  homedirMock.mockReturnValue(tmpHome)
  getPathMock.mockImplementation((name: string) => {
    if (name === 'userData') {
      return userDataDir
    }
    throw new Error(`unexpected app.getPath(${name})`)
  })
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('CodexHookService', () => {
  it('installs PermissionRequest with trust so Codex approval prompts reach Orca', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(
      join(systemCodexHome, 'config.toml'),
      'model = "gpt-5.2-codex"\napproval_policy = "on-request"\n',
      'utf-8'
    )

    const status = new CodexHookService().install()

    expect(status.state).toBe('installed')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    const hooksConfig = JSON.parse(readFileSync(join(managedCodexHome, 'hooks.json'), 'utf-8')) as {
      hooks: Record<string, { hooks?: { command?: string }[] }[]>
    }

    expect(Object.keys(hooksConfig.hooks).sort()).toEqual(
      [
        'PermissionRequest',
        'PostToolUse',
        'PreToolUse',
        'SessionStart',
        'Stop',
        'UserPromptSubmit'
      ].sort()
    )
    expect(hooksConfig.hooks.PermissionRequest?.[0]?.hooks?.[0]?.command).toContain('agent-hooks')
    expect(hooksConfig.hooks.PermissionRequest?.[0]?.hooks?.[0]?.command).toContain('codex-hook')

    const trustConfig = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(trustConfig).toContain('model = "gpt-5.2-codex"')
    expect(trustConfig).toContain('approval_policy = "on-request"')
    expect(trustConfig).toContain(':permission_request:0:0')
  })

  it('keeps hooks isolated by Orca userData instead of mutating system ~/.codex', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    const systemHooksPath = join(systemCodexHome, 'hooks.json')
    const existingSystemHooks = '{"hooks":{"Stop":[{"hooks":[{"command":"user-hook"}]}]}}\n'
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(systemHooksPath, existingSystemHooks, 'utf-8')

    const devUserDataDir = mkdtempSync(join(tmpdir(), 'orca-dev-codex-user-data-'))
    const prodUserDataDir = mkdtempSync(join(tmpdir(), 'orca-prod-codex-user-data-'))
    try {
      getPathMock.mockImplementation((name: string) => {
        if (name === 'userData') {
          return devUserDataDir
        }
        throw new Error(`unexpected app.getPath(${name})`)
      })
      expect(new CodexHookService().install().state).toBe('installed')

      getPathMock.mockImplementation((name: string) => {
        if (name === 'userData') {
          return prodUserDataDir
        }
        throw new Error(`unexpected app.getPath(${name})`)
      })
      expect(new CodexHookService().install().state).toBe('installed')

      const devHooksPath = join(devUserDataDir, 'codex-runtime-home', 'home', 'hooks.json')
      const prodHooksPath = join(prodUserDataDir, 'codex-runtime-home', 'home', 'hooks.json')
      expect(existsSync(devHooksPath)).toBe(true)
      expect(existsSync(prodHooksPath)).toBe(true)
      expect(readFileSync(devHooksPath, 'utf-8')).toContain('codex-hook')
      expect(readFileSync(prodHooksPath, 'utf-8')).toContain('codex-hook')
      expect(readFileSync(systemHooksPath, 'utf-8')).toBe(existingSystemHooks)
    } finally {
      rmSync(devUserDataDir, { recursive: true, force: true })
      rmSync(prodUserDataDir, { recursive: true, force: true })
    }
  })

  it('does not overwrite runtime-only Codex config on hook install', () => {
    const systemCodexHome = join(tmpHome, '.codex')
    mkdirSync(systemCodexHome, { recursive: true })
    writeFileSync(join(systemCodexHome, 'config.toml'), 'model = "system-model"\n', 'utf-8')

    const managedCodexHome = join(userDataDir, 'codex-runtime-home', 'home')
    mkdirSync(managedCodexHome, { recursive: true })
    writeFileSync(
      join(managedCodexHome, 'config.toml'),
      [
        'model = "runtime-model"',
        '',
        '[projects."/workspace/runtime-only"]',
        'trust_level = "trusted"',
        ''
      ].join('\n'),
      'utf-8'
    )

    const status = new CodexHookService().install()

    expect(status.state).toBe('installed')
    const trustConfig = readFileSync(join(managedCodexHome, 'config.toml'), 'utf-8')
    expect(trustConfig).toContain('model = "runtime-model"')
    expect(trustConfig).toContain('[projects."/workspace/runtime-only"]')
    expect(trustConfig).toContain(':permission_request:0:0')
    expect(trustConfig).not.toContain('model = "system-model"')
  })
})
