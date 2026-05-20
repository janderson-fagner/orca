import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ChildProcess from 'child_process'
import type * as RepoModule from './repo'

const execSyncMock = vi.hoisted(() => vi.fn())
const execFileSyncMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof ChildProcess>('child_process')
  return {
    ...actual,
    execSync: execSyncMock,
    execFileSync: execFileSyncMock
  }
})

describe('getGitUsername', () => {
  let gitConfig: Record<string, string>
  let getGitUsername: typeof RepoModule.getGitUsername

  beforeEach(async () => {
    vi.resetModules()
    execSyncMock.mockReset()
    execFileSyncMock.mockReset()
    gitConfig = {}

    execFileSyncMock.mockImplementation((_binary: string, args: string[]) => {
      if (args[0] === 'config' && args[1] === '--get') {
        const value = gitConfig[args[2]]
        if (value !== undefined) {
          return `${value}\n`
        }
        throw new Error(`missing config ${args[2]}`)
      }
      throw new Error(`unexpected git args: ${args.join(' ')}`)
    })

    ;({ getGitUsername } = await import('./repo'))
  })

  it('uses repo-local email before checking GitHub CLI login', () => {
    gitConfig['user.email'] = 'demo@example.com'
    gitConfig['user.name'] = 'Demo User'

    expect(getGitUsername('/repo')).toBe('demo')
    expect(execSyncMock).not.toHaveBeenCalled()
  })

  it('bounds and caches failed GitHub CLI lookup', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('gh unavailable')
    })

    expect(getGitUsername('/repo')).toBe('')
    expect(getGitUsername('/repo')).toBe('')

    expect(execSyncMock).toHaveBeenCalledTimes(2)
    for (const [, options] of execSyncMock.mock.calls) {
      expect(options).toMatchObject({ timeout: 1500 })
    }
  })
})
