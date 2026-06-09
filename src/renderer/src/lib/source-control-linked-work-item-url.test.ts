import { describe, expect, it } from 'vitest'
import type {
  GlobalSettings,
  GitHubWorkItem,
  LinearConnectionStatus,
  LinearIssue,
  PRInfo,
  Repo,
  Worktree
} from '../../../shared/types'
import type { HostedReviewInfo } from '../../../shared/hosted-review'
import {
  normalizeAbsoluteHttpUrl,
  resolveSourceControlLinkedWorkItemUrl
} from './source-control-linked-work-item-url'

const repo: Pick<Repo, 'id' | 'path' | 'connectionId'> = { id: 'repo-1', path: '/repo' }

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/repo/worktree',
    repoId: 'repo-1',
    path: '/repo/worktree',
    head: 'a'.repeat(40),
    branch: 'feature/test',
    isBare: false,
    isMainWorktree: false,
    displayName: 'Test',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabIssue: null,
    linkedGitLabMR: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

function linearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-id',
    workspaceId: 'workspace-1',
    identifier: 'ORC-123',
    title: 'Fix PR details',
    url: 'https://linear.app/orca/issue/ORC-123/fix-pr-details',
    state: { name: 'Todo', type: 'unstarted', color: '#888' },
    team: { id: 'team-1', name: 'Orca', key: 'ORC' },
    labels: [],
    labelIds: [],
    priority: 0,
    updatedAt: '',
    ...overrides
  }
}

function linearStatus(overrides: Partial<LinearConnectionStatus> = {}): LinearConnectionStatus {
  return {
    connected: true,
    viewer: {
      displayName: 'Test User',
      email: null,
      organizationName: 'Orca',
      organizationUrlKey: 'orca'
    },
    workspaces: [
      {
        id: 'workspace-1',
        displayName: 'Test User',
        email: null,
        organizationId: 'organization-1',
        organizationName: 'Orca',
        organizationUrlKey: 'orca'
      }
    ],
    ...overrides
  }
}

function pullRequest(overrides: Partial<PRInfo> = {}): PRInfo {
  return {
    number: 7,
    title: 'Review',
    state: 'open',
    url: 'https://github.com/o/r/pull/7',
    checksStatus: 'neutral',
    updatedAt: '',
    mergeable: 'UNKNOWN',
    ...overrides
  }
}

function gitHubPullRequestWorkItem(overrides: Partial<GitHubWorkItem> = {}): GitHubWorkItem {
  return {
    id: 'pr-7',
    type: 'pr',
    number: 7,
    title: 'Review',
    state: 'open',
    url: 'https://github.com/o/r/pull/7',
    labels: [],
    updatedAt: '',
    author: null,
    repoId: 'repo-1',
    ...overrides
  }
}

describe('normalizeAbsoluteHttpUrl', () => {
  it('accepts only absolute http and https URLs', () => {
    expect(normalizeAbsoluteHttpUrl(' https://example.com/work ')).toBe('https://example.com/work')
    expect(normalizeAbsoluteHttpUrl('http://example.com/work')).toBe('http://example.com/work')
    expect(normalizeAbsoluteHttpUrl('mailto:test@example.com')).toBeNull()
    expect(normalizeAbsoluteHttpUrl('/issues/1')).toBeNull()
    expect(normalizeAbsoluteHttpUrl('')).toBeNull()
  })
})

describe('resolveSourceControlLinkedWorkItemUrl', () => {
  it('prefers a cached Linear issue URL', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedLinearIssue: 'ORC-123', linkedIssue: 42 }),
        repo,
        linearIssueCache: {
          'all::ORC-123': { data: linearIssue(), fetchedAt: 1 }
        },
        linearStatus: linearStatus(),
        githubIssueCache: {
          'repo-1::42': {
            data: {
              number: 42,
              title: 'GitHub issue',
              state: 'open',
              url: 'https://github.com/o/r/issues/42',
              labels: []
            },
            fetchedAt: 1
          }
        }
      })
    ).toBe('https://linear.app/orca/issue/ORC-123/fix-pr-details')
  })

  it('constructs a Linear issue URL only when organization URL key and identifier exist', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedLinearIssue: 'ORC-123' }),
        repo,
        linearStatus: linearStatus()
      })
    ).toBe('https://linear.app/orca/issue/ORC-123')

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedLinearIssue: 'ORC-123' }),
        repo,
        linearStatus: linearStatus({ viewer: null, workspaces: [] })
      })
    ).toBeNull()
  })

  it('uses cached GitHub issue and PR URLs without inventing bare-number URLs', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedIssue: 42 }),
        repo,
        githubIssueCache: {
          'repo-1::42': {
            data: {
              number: 42,
              title: 'Issue',
              state: 'open',
              url: 'https://github.com/o/r/issues/42',
              labels: []
            },
            fetchedAt: 1
          }
        }
      })
    ).toBe('https://github.com/o/r/issues/42')

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedIssue: 42 }),
        repo
      })
    ).toBeNull()

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedPR: 7 }),
        repo,
        githubWorkItemsCache: {
          'repo-1::20::': {
            data: [gitHubPullRequestWorkItem()],
            fetchedAt: 1
          }
        }
      })
    ).toBe('https://github.com/o/r/pull/7')
  })

  it('uses scoped GitHub PR cache entries instead of stale local entries', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedPR: 7 }),
        repo: { ...repo, connectionId: 'ssh-1' },
        branch: 'refs/heads/feature/test',
        githubPrCache: {
          'repo-1::feature/test': {
            data: pullRequest({ url: 'https://github.com/local/r/pull/7' }),
            fetchedAt: 1
          },
          'ssh:ssh-1::repo-1::feature/test': {
            data: pullRequest({ url: 'https://github.com/ssh/r/pull/7' }),
            fetchedAt: 1
          }
        }
      })
    ).toBe('https://github.com/ssh/r/pull/7')
  })

  it('does not use unscoped GitHub work-item PR URLs for scoped execution contexts', () => {
    const githubWorkItemsCache = {
      'repo-1::20::': {
        data: [gitHubPullRequestWorkItem({ url: 'https://github.com/local/r/pull/7' })],
        fetchedAt: 1
      }
    }

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedPR: 7 }),
        repo: { ...repo, connectionId: 'ssh-1' },
        branch: 'refs/heads/feature/test',
        githubWorkItemsCache
      })
    ).toBeNull()

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedPR: 7 }),
        repo,
        branch: 'refs/heads/feature/test',
        settings: { activeRuntimeEnvironmentId: 'runtime-1' } as GlobalSettings,
        githubWorkItemsCache
      })
    ).toBeNull()

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedPR: 7 }),
        repo,
        branch: 'refs/heads/feature/test',
        settings: { activeRuntimeEnvironmentId: 'runtime-1' } as GlobalSettings,
        githubPrCache: {
          'runtime:runtime-1::repo-1::feature/test': {
            data: pullRequest({ url: 'https://github.com/runtime/r/pull/7' }),
            fetchedAt: 1
          }
        },
        githubWorkItemsCache
      })
    ).toBe('https://github.com/runtime/r/pull/7')
  })

  it('does not use provider-number caches when the active repo is unavailable', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedIssue: 42 }),
        repo: null,
        githubIssueCache: {
          'repo-1::42': {
            data: {
              number: 42,
              title: 'Issue',
              state: 'open',
              url: 'https://github.com/o/r/issues/42',
              labels: []
            },
            fetchedAt: 1
          }
        }
      })
    ).toBeNull()
  })

  it('uses cached hosted GitLab merge request URLs', () => {
    const review: HostedReviewInfo = {
      provider: 'gitlab',
      number: 5,
      title: 'Review',
      state: 'open',
      url: 'https://gitlab.com/o/r/-/merge_requests/5',
      status: 'neutral',
      updatedAt: '',
      mergeable: 'UNKNOWN'
    }

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedGitLabMR: 5 }),
        repo,
        branch: 'feature/test',
        hostedReviewCache: {
          'local::repo-1::feature/test': { data: review, fetchedAt: 1 }
        }
      })
    ).toBe('https://gitlab.com/o/r/-/merge_requests/5')
  })

  it('uses scoped hosted GitLab merge request cache entries', () => {
    const localReview: HostedReviewInfo = {
      provider: 'gitlab',
      number: 5,
      title: 'Review',
      state: 'open',
      url: 'https://gitlab.com/local/r/-/merge_requests/5',
      status: 'neutral',
      updatedAt: '',
      mergeable: 'UNKNOWN'
    }
    const sshReview: HostedReviewInfo = {
      ...localReview,
      url: 'https://gitlab.com/ssh/r/-/merge_requests/5'
    }

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedGitLabMR: 5 }),
        repo: { ...repo, connectionId: 'ssh-1' },
        branch: 'refs/heads/feature/test',
        hostedReviewCache: {
          'local::repo-1::feature/test': { data: localReview, fetchedAt: 1 },
          'ssh:ssh-1::repo-1::feature/test': { data: sshReview, fetchedAt: 1 }
        }
      })
    ).toBe('https://gitlab.com/ssh/r/-/merge_requests/5')

    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedGitLabMR: 5 }),
        repo: { ...repo, connectionId: 'ssh-1' },
        branch: 'refs/heads/feature/test',
        hostedReviewCache: {
          'local::repo-1::feature/test': { data: localReview, fetchedAt: 1 }
        }
      })
    ).toBeNull()
  })

  it('does not invent GitLab issue URLs from bare issue numbers', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedGitLabIssue: 5 }),
        repo
      })
    ).toBeNull()
  })

  it('rejects cached non-http URLs', () => {
    expect(
      resolveSourceControlLinkedWorkItemUrl({
        worktree: worktree({ linkedLinearIssue: 'ORC-123' }),
        repo,
        linearIssueCache: {
          'all::ORC-123': { data: linearIssue({ url: 'javascript:alert(1)' }), fetchedAt: 1 }
        },
        linearStatus: linearStatus()
      })
    ).toBe('https://linear.app/orca/issue/ORC-123')
  })
})
