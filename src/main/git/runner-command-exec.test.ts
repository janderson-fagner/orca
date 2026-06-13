import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, execFileSyncMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  execFileSync: execFileSyncMock,
  spawn: spawnMock
}))

import { commandExecFileAsync, gitExecFileAsync, GIT_DEFAULT_TIMEOUT_MS } from './runner'

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: ReturnType<typeof vi.fn>
  unref?: ReturnType<typeof vi.fn>
}

function createMockChildProcess(pid: number): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = pid
  child.kill = vi.fn()
  return child
}

function createMockTaskkillProcess(): MockChildProcess {
  const child = createMockChildProcess(9000)
  child.unref = vi.fn()
  return child
}

async function withPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  try {
    return await fn()
  } finally {
    Object.defineProperty(process, 'platform', { configurable: true, value: original })
  }
}

describe('commandExecFileAsync Windows command shims', () => {
  const originalComSpec = process.env.ComSpec

  beforeEach(() => {
    process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe'
    execFileMock.mockReset()
    execFileSyncMock.mockReset()
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalComSpec === undefined) {
      delete process.env.ComSpec
    } else {
      process.env.ComSpec = originalComSpec
    }
  })

  it('kills aborted Windows .cmd shim executions as a process tree', async () => {
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      const taskkill = createMockTaskkillProcess()
      spawnMock.mockImplementation((cmd: string) => (cmd === 'taskkill' ? taskkill : command))

      const controller = new AbortController()
      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['--version'], {
        cwd: 'C:\\repo',
        signal: controller.signal
      })
      const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()

      await rejection
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/t', '/f'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true })
      )
      expect(command.kill).not.toHaveBeenCalled()
    })
  })

  it('kills timed-out Windows .cmd shim executions as a process tree', async () => {
    vi.useFakeTimers()
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      const taskkill = createMockTaskkillProcess()
      spawnMock.mockImplementation((cmd: string) => (cmd === 'taskkill' ? taskkill : command))

      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['store', 'prune'], {
        cwd: 'C:\\repo',
        timeout: 1000
      })
      const rejection = expect(promise).rejects.toThrow('C:\\tools\\pnpm.cmd timed out.')
      await vi.advanceTimersByTimeAsync(1000)

      await rejection
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/t', '/f'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true })
      )
      expect(command.kill).not.toHaveBeenCalled()
      expect(command.stdout.listenerCount('data')).toBe(0)
      expect(command.stderr.listenerCount('data')).toBe(0)
      expect(command.listenerCount('error')).toBe(0)
      expect(command.listenerCount('close')).toBe(0)
    })
  })

  it('kills over-buffer Windows .cmd shim executions as a process tree', async () => {
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      const taskkill = createMockTaskkillProcess()
      spawnMock.mockImplementation((cmd: string) => (cmd === 'taskkill' ? taskkill : command))

      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['store', 'prune'], {
        cwd: 'C:\\repo',
        maxBuffer: 2
      })
      const rejection = expect(promise).rejects.toThrow(
        'C:\\tools\\pnpm.cmd stdout exceeded maxBuffer.'
      )
      command.stdout.emit('data', Buffer.from('too much output'))

      await rejection
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/t', '/f'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true })
      )
      expect(command.kill).not.toHaveBeenCalled()
      expect(command.stdout.listenerCount('data')).toBe(0)
      expect(command.stderr.listenerCount('data')).toBe(0)
      expect(command.listenerCount('error')).toBe(0)
      expect(command.listenerCount('close')).toBe(0)
    })
  })

  it('removes listeners after successful Windows .cmd shim executions', async () => {
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      spawnMock.mockReturnValue(command)

      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['--version'], {
        cwd: 'C:\\repo'
      })
      command.stdout.emit('data', Buffer.from('9.1.0\n'))
      command.stderr.emit('data', Buffer.from('notice\n'))
      command.emit('close', 0)

      await expect(promise).resolves.toEqual({ stdout: '9.1.0\n', stderr: 'notice\n' })
      expect(command.stdout.listenerCount('data')).toBe(0)
      expect(command.stderr.listenerCount('data')).toBe(0)
      expect(command.listenerCount('error')).toBe(0)
      expect(command.listenerCount('close')).toBe(0)
    })
  })
})

describe('runner execFile timeout handling', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execFileSyncMock.mockReset()
    spawnMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects command executions when execFile never calls back after timeout', async () => {
    const child = createMockChildProcess(1234)
    execFileMock.mockReturnValue(child)

    const promise = commandExecFileAsync('git', ['status'], {
      cwd: '/repo',
      timeout: 1000
    })
    const rejection = expect(promise).rejects.toThrow('git timed out.')
    await vi.advanceTimersByTimeAsync(1000)

    await rejection
    expect(child.kill).toHaveBeenCalled()
  })

  it('rejects git executions when execFile never calls back after timeout', async () => {
    const child = createMockChildProcess(1234)
    execFileMock.mockReturnValue(child)

    const promise = gitExecFileAsync(['status'], {
      cwd: '/repo',
      timeout: 1000
    })
    const rejection = expect(promise).rejects.toThrow('git timed out.')
    await vi.advanceTimersByTimeAsync(1000)

    await rejection
    expect(child.kill).toHaveBeenCalled()
  })

  // Issue #5308: a hung read-path git command (non-git folder on a wedged NFS
  // mount, or git waiting on a credential prompt) with NO explicit timeout must
  // still self-resolve at the default ceiling instead of hanging forever and
  // wedging the serve runtime for all clients.
  it('rejects a hung read-path git command at the default timeout when none is set', async () => {
    const child = createMockChildProcess(1234)
    execFileMock.mockReturnValue(child)

    const promise = gitExecFileAsync(['worktree', 'list', '--porcelain', '-z'], {
      cwd: '/home5/Brian'
    })
    const rejection = expect(promise).rejects.toThrow('git timed out.')
    await vi.advanceTimersByTimeAsync(GIT_DEFAULT_TIMEOUT_MS)

    await rejection
    expect(child.kill).toHaveBeenCalled()
  })

  // Long-running network subcommands opt out of the default ceiling so large
  // clones/fetches aren't killed mid-transfer.
  it('does not apply the default timeout to network subcommands', async () => {
    const child = createMockChildProcess(1234)
    let execCallback: ((err: Error | null, stdout: string, stderr: string) => void) | undefined
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      execCallback = cb
      return child
    })

    let settled = false
    const promise = gitExecFileAsync(['fetch', '--prune'], { cwd: '/repo' })
      .catch(() => undefined)
      .finally(() => {
        settled = true
      })
    // Advance well past the read-path ceiling; fetch must still be running.
    await vi.advanceTimersByTimeAsync(GIT_DEFAULT_TIMEOUT_MS * 5)
    expect(settled).toBe(false)
    expect(child.kill).not.toHaveBeenCalled()

    // Let the fetch "finish" so the test doesn't leak a pending promise.
    execCallback?.(null, '', '')
    await promise
    expect(settled).toBe(true)
  })
})
