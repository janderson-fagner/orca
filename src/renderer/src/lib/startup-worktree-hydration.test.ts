import { describe, expect, it } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type { Repo, WorkspaceSessionState } from '../../../shared/types'
import { shouldDeferSessionHydrationUntilWorktreesLoaded } from './startup-worktree-hydration'

const localRepo: Repo = {
  id: 'repo-local',
  path: '/repos/local',
  displayName: 'local',
  badgeColor: '#000',
  addedAt: 0
}

const sshRepo: Repo = {
  id: 'repo-ssh',
  path: '/repos/ssh',
  displayName: 'ssh',
  badgeColor: '#111',
  addedAt: 0,
  connectionId: 'ssh-target'
}

function makeSession(overrides: Partial<WorkspaceSessionState> = {}): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    ...overrides
  }
}

describe('shouldDeferSessionHydrationUntilWorktreesLoaded', () => {
  it('allows hydration after worktree lists are complete', () => {
    const session = makeSession({
      activeWorktreeId: 'repo-local::/repos/local/wt',
      tabsByWorktree: { 'repo-local::/repos/local/wt': [] }
    })

    expect(
      shouldDeferSessionHydrationUntilWorktreesLoaded({
        repos: [localRepo],
        session,
        worktreeHydration: { canHydrateSession: true }
      })
    ).toBe(false)
  })

  it('defers hydration when a saved local workspace would be validated against incomplete lists', () => {
    const session = makeSession({
      activeWorktreeId: 'repo-local::/repos/local/wt',
      tabsByWorktree: { 'repo-local::/repos/local/wt': [] }
    })

    expect(
      shouldDeferSessionHydrationUntilWorktreesLoaded({
        repos: [localRepo],
        session,
        worktreeHydration: { canHydrateSession: false }
      })
    ).toBe(true)
  })

  it('defers hydration for editor and browser state keyed by local worktrees', () => {
    const session = makeSession({
      openFilesByWorktree: { 'repo-local::/repos/local/wt': [] },
      browserTabsByWorktree: { 'repo-local::/repos/local/wt': [] },
      unifiedTabs: { 'repo-local::/repos/local/wt': [] }
    })

    expect(
      shouldDeferSessionHydrationUntilWorktreesLoaded({
        repos: [localRepo],
        session,
        worktreeHydration: { canHydrateSession: false }
      })
    ).toBe(true)
  })

  it('allows incomplete startup lists for SSH and floating terminal session state', () => {
    const session = makeSession({
      activeWorktreeId: 'repo-ssh::/srv/app',
      tabsByWorktree: {
        'repo-ssh::/srv/app': [],
        [FLOATING_TERMINAL_WORKTREE_ID]: []
      }
    })

    expect(
      shouldDeferSessionHydrationUntilWorktreesLoaded({
        repos: [sshRepo],
        session,
        worktreeHydration: { canHydrateSession: false }
      })
    ).toBe(false)
  })
})
