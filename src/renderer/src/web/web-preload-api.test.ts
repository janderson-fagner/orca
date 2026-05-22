import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreloadApi } from '../../../preload/api-types'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function installBrowserGlobals(userAgent = 'Linux'): {
  window: Window & typeof globalThis
  storage: MemoryStorage
} {
  const storage = new MemoryStorage()
  const windowStub = {
    localStorage: storage,
    location: {
      protocol: 'http:',
      reload: vi.fn()
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64')
  } as unknown as Window & typeof globalThis
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('navigator', { userAgent, hardwareConcurrency: 8 })
  return { window: windowStub, storage }
}

async function installApi(userAgent?: string): Promise<{
  api: PreloadApi
  storage: MemoryStorage
  window: Window & typeof globalThis
}> {
  const globals = installBrowserGlobals(userAgent)
  const { installWebPreloadApi } = await import('./web-preload-api')
  installWebPreloadApi()
  return {
    api: globals.window.api,
    storage: globals.storage,
    window: globals.window
  }
}

function writeStoredRuntimeEnvironment(storage: Storage): void {
  storage.setItem(
    'orca.web.runtimeEnvironment.v1',
    JSON.stringify({
      id: 'web-env-1',
      name: 'Test runtime',
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
      runtimeId: null,
      preferredEndpointId: 'ws-web-env-1',
      endpoints: [
        {
          id: 'ws-web-env-1',
          kind: 'websocket',
          label: 'WebSocket',
          endpoint: 'ws://127.0.0.1:1234',
          deviceToken: 'token',
          publicKeyB64: 'public-key'
        }
      ]
    })
  )
}

describe('web keybindings preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns snapshots and persists customized bindings in browser storage', async () => {
    const { api, storage } = await installApi('Linux')

    const initial = await api.keybindings.get()
    expect(initial.platform).toBe('linux')
    expect(initial.overrides).toEqual({})

    const updated = await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: ['Ctrl+Alt+J']
    })

    expect(updated.overrides['worktree.palette']).toEqual(['Ctrl+Alt+J'])
    expect(storage.getItem('orca.web.keybindings.v1')).toContain('worktree.palette')

    const disabled = await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: []
    })
    expect(disabled.overrides['worktree.palette']).toEqual([])

    const reset = await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: null
    })
    expect(reset.overrides['worktree.palette']).toBeUndefined()
  })

  it('rejects conflicts before mutating browser storage', async () => {
    const { api } = await installApi('Linux')

    await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: ['Ctrl+Alt+J']
    })

    await expect(
      api.keybindings.setAction({
        actionId: 'worktree.quickOpen',
        bindings: ['Ctrl+Alt+J']
      })
    ).rejects.toThrow('conflicts')

    const snapshot = await api.keybindings.get()
    expect(snapshot.overrides['worktree.palette']).toEqual(['Ctrl+Alt+J'])
    expect(snapshot.overrides['worktree.quickOpen']).toBeUndefined()
  })

  it('notifies listeners when web keybindings change', async () => {
    const { api } = await installApi('Linux')
    const listener = vi.fn()
    const unsubscribe = api.keybindings.onChanged(listener)

    await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: ['Ctrl+Alt+J']
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: expect.objectContaining({ 'worktree.palette': ['Ctrl+Alt+J'] })
      })
    )

    unsubscribe()
  })
})

describe('web GitLab preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('exposes the GitLab task methods used by the shared Tasks page', async () => {
    const runtimeCalls: { method: string; params: unknown }[] = []
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
          runtimeCalls.push({ method, params })
          if (method === 'gitlab.listWorkItems') {
            return Promise.resolve({
              id: `call-${runtimeCalls.length}`,
              ok: true,
              result: {
                items: [
                  { id: 'mr-1', type: 'mr', number: 1 },
                  { id: 'issue-2', type: 'issue', number: 2 }
                ]
              },
              _meta: { runtimeId: 'runtime-1' }
            })
          }
          return Promise.resolve({
            id: `call-${runtimeCalls.length}`,
            ok: true,
            result: { ok: true },
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    const api = globals.window.api

    const mergeRequests = await api.gl.listMRs({
      repoPath: '/workspace/repo',
      state: 'opened',
      page: 1,
      perPage: 50
    })
    const issues = await api.gl.listIssues({
      repoPath: '/workspace/repo',
      state: 'opened',
      limit: 50
    })
    await api.gl.closeMR({ repoPath: '/workspace/repo', iid: 7 })

    expect(mergeRequests.items).toEqual([{ id: 'mr-1', type: 'mr', number: 1 }])
    expect(issues.items).toEqual([{ id: 'issue-2', type: 'issue', number: 2 }])
    expect(runtimeCalls).toEqual([
      {
        method: 'gitlab.listWorkItems',
        params: {
          repoPath: '/workspace/repo',
          repo: '/workspace/repo',
          state: 'opened',
          page: 1,
          perPage: 50
        }
      },
      {
        method: 'gitlab.listWorkItems',
        params: {
          repoPath: '/workspace/repo',
          repo: '/workspace/repo',
          state: 'opened',
          limit: 50
        }
      },
      {
        method: 'gitlab.updateMRState',
        params: {
          repoPath: '/workspace/repo',
          repo: '/workspace/repo',
          iid: 7,
          state: 'closed'
        }
      }
    ])
  })
})
