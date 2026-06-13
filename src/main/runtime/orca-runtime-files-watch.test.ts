import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Fs from 'fs'
import type * as FsPromises from 'fs/promises'
import type * as FilesystemAuth from '../ipc/filesystem-auth'

const { resolveAuthorizedPathMock, statMock, subscribeParcelWatcherMock, watchMock } = vi.hoisted(
  () => ({
    resolveAuthorizedPathMock: vi.fn(),
    statMock: vi.fn(),
    subscribeParcelWatcherMock: vi.fn(),
    watchMock: vi.fn()
  })
)

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof Fs>('fs')
  return {
    ...actual,
    watch: watchMock
  }
})

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof FsPromises>('fs/promises')
  return {
    ...actual,
    stat: statMock
  }
})

vi.mock('@parcel/watcher', () => ({
  subscribe: subscribeParcelWatcherMock
}))

vi.mock('../ipc/filesystem-auth', async () => {
  const actual = await vi.importActual<typeof FilesystemAuth>('../ipc/filesystem-auth')
  return {
    ...actual,
    resolveAuthorizedPath: resolveAuthorizedPathMock
  }
})

import { awaitRuntimeFileWatcherUnsubscribes, RuntimeFileCommands } from './orca-runtime-files'

function createRuntimeFileCommands(rootPath: string) {
  const store = { getRepo: vi.fn(() => undefined) }
  const commands = new RuntimeFileCommands({
    getRuntimeId: () => 'runtime-1',
    requireStore: () => store,
    resolveWorktreeSelector: vi.fn(async () => ({
      id: 'wt-1',
      repoId: 'repo-1',
      path: rootPath
    })),
    resolveRuntimeGitTarget: vi.fn(),
    openFile: vi.fn()
  } as never)
  return { commands, store }
}

describe('RuntimeFileCommands file watching', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.useFakeTimers()
    resolveAuthorizedPathMock.mockReset()
    statMock.mockReset()
    subscribeParcelWatcherMock.mockReset()
    watchMock.mockReset()
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: originalPlatform
    })
  })

  afterEach(async () => {
    await awaitRuntimeFileWatcherUnsubscribes()
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: originalPlatform
    })
    vi.useRealTimers()
  })

  it('uses a conservative Node watcher for Windows runtime file watches', async () => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32'
    })

    const close = vi.fn()
    const on = vi.fn()
    let listener: (() => void) | null = null
    watchMock.mockImplementation((_rootPath, _options, callback) => {
      listener = callback
      return { close, on }
    })
    resolveAuthorizedPathMock.mockResolvedValue('C:\\repo')
    statMock.mockResolvedValue({ isDirectory: () => true })
    const { commands } = createRuntimeFileCommands('C:\\repo')
    const onEvents = vi.fn()

    const unsubscribe = await commands.watchFileExplorer('id:wt-1', onEvents)

    expect(watchMock).toHaveBeenCalledWith('C:\\repo', { recursive: true }, expect.any(Function))
    const emit = listener as (() => void) | null
    expect(emit).not.toBeNull()

    emit?.()
    emit?.()
    await vi.advanceTimersByTimeAsync(149)
    expect(onEvents).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(onEvents).toHaveBeenCalledTimes(1)
    expect(onEvents).toHaveBeenCalledWith([{ kind: 'overflow', absolutePath: 'C:\\repo' }])

    unsubscribe()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('tracks native Parcel watcher unsubscribe work so shutdown can await it', async () => {
    resolveAuthorizedPathMock.mockResolvedValue('/repo')
    statMock.mockResolvedValue({ isDirectory: () => true })
    let resolveUnsubscribe: () => void = () => {}
    const unsubscribeMock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUnsubscribe = resolve
        })
    )
    subscribeParcelWatcherMock.mockResolvedValue({ unsubscribe: unsubscribeMock })
    const { commands } = createRuntimeFileCommands('/repo')

    const unsubscribe = await commands.watchFileExplorer('id:wt-1', vi.fn())
    unsubscribe()

    let drained = false
    const drainPromise = awaitRuntimeFileWatcherUnsubscribes().then(() => {
      drained = true
    })
    await Promise.resolve()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(drained).toBe(false)

    resolveUnsubscribe()
    await drainPromise
    expect(drained).toBe(true)
  })

  // Issue #5308: @parcel/watcher's Linux/Windows brute-force backend recursively
  // crawls the whole tree on a libuv threadpool thread before subscribe()
  // resolves. On a huge/slow root (a home dir on NFS opened as a worktree) that
  // crawl can run for minutes, starving all other async fs/crypto work and
  // wedging the serve runtime. The crawl must be time-bounded.
  it('fails the watch if the initial subscribe crawl exceeds the timeout', async () => {
    resolveAuthorizedPathMock.mockResolvedValue('/home5/Brian')
    statMock.mockResolvedValue({ isDirectory: () => true })

    // subscribe() never resolves — simulates an unbounded recursive crawl.
    const unsubscribeMock = vi.fn(async () => {})
    let resolveSubscribe: (sub: { unsubscribe: () => Promise<void> }) => void = () => {}
    subscribeParcelWatcherMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubscribe = resolve
        })
    )
    const { commands } = createRuntimeFileCommands('/home5/Brian')

    const watchPromise = commands.watchFileExplorer('id:wt-1', vi.fn())
    const rejection = expect(watchPromise).rejects.toThrow('watch_subscribe_timeout')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection

    // If the slow crawl ever finishes, its subscription is dropped, not leaked.
    resolveSubscribe({ unsubscribe: unsubscribeMock })
    await vi.runOnlyPendingTimersAsync()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  it('bounds concurrent stat() calls when resolving a watcher event batch', async () => {
    resolveAuthorizedPathMock.mockResolvedValue('/repo')
    statMock.mockResolvedValue({ isDirectory: () => true })

    let onBatch: ((err: Error | null, events: { path: string; type: string }[]) => void) | null =
      null
    subscribeParcelWatcherMock.mockImplementation((_root, cb) => {
      onBatch = cb
      return Promise.resolve({ unsubscribe: vi.fn(async () => {}) })
    })

    // Track how many stat() calls are running concurrently. Each call resolves
    // on the next microtask, so workers immediately pull their next item —
    // peak concurrency reflects the limiter, not artificial gating.
    let inFlight = 0
    let peakInFlight = 0
    statMock.mockImplementation(async (targetPath: string) => {
      // The root directory check at watch setup must report a directory.
      if (targetPath === '/repo') {
        return { isDirectory: () => true }
      }
      inFlight++
      peakInFlight = Math.max(peakInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      return { isDirectory: () => false }
    })

    const onEvents = vi.fn()
    const { commands } = createRuntimeFileCommands('/repo')
    await commands.watchFileExplorer('id:wt-1', onEvents)
    expect(onBatch).not.toBeNull()

    // 50 events in one batch (under the 200 overflow cap) must not run 50 stats
    // at once — the threadpool only has a few threads.
    const events = Array.from({ length: 50 }, (_unused, i) => ({
      path: `/repo/file-${i}`,
      type: 'update'
    }))
    onBatch?.(null, events)
    await vi.runAllTimersAsync()

    expect(onEvents).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ absolutePath: '/repo/file-0', kind: 'update' })
      ])
    )
    // 50 event stats + 1 root-directory check at setup.
    expect(statMock).toHaveBeenCalledTimes(51)
    expect(peakInFlight).toBeLessThanOrEqual(8)
  })
})
