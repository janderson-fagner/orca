import type { HostedReviewInfo } from '../../../shared/hosted-review'
import type {
  GlobalSettings,
  GitHubWorkItem,
  IssueInfo,
  LinearConnectionStatus,
  LinearIssue,
  PRInfo,
  Repo,
  Worktree
} from '../../../shared/types'
import type { CacheEntry } from '@/store/slices/github'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review-cache-identity'

type NullableCache<T> = Record<string, CacheEntry<T>>
type WorkItemsCache = Record<string, CacheEntry<GitHubWorkItem[]>>

export type SourceControlLinkedWorkItemUrlInput = {
  worktree: Worktree | null | undefined
  repo: Pick<Repo, 'id' | 'path' | 'connectionId'> | null | undefined
  branch?: string | null
  settings?: GlobalSettings | null
  linearIssueCache?: NullableCache<LinearIssue>
  linearStatus?: LinearConnectionStatus | null
  githubIssueCache?: NullableCache<IssueInfo>
  githubPrCache?: NullableCache<PRInfo>
  githubWorkItemsCache?: WorkItemsCache
  hostedReviewCache?: NullableCache<HostedReviewInfo>
}

export function normalizeAbsoluteHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function findCachedItem<T>(
  cache: NullableCache<T> | undefined,
  predicate: (item: T, key: string) => boolean
): T | null {
  for (const [key, entry] of Object.entries(cache ?? {})) {
    const item = entry.data
    if (item && predicate(item, key)) {
      return item
    }
  }
  return null
}

function findCachedGitHubWorkItem(args: {
  cache: WorkItemsCache | undefined
  repo: Pick<Repo, 'id' | 'path' | 'connectionId'> | null | undefined
  type: GitHubWorkItem['type']
  number: number | null | undefined
}): GitHubWorkItem | null {
  if (args.number == null) {
    return null
  }
  for (const entry of Object.values(args.cache ?? {})) {
    for (const item of entry.data ?? []) {
      if (item.repoId === args.repo?.id && item.type === args.type && item.number === args.number) {
        return item
      }
    }
  }
  return null
}

function normalizeBranchName(branch: string | null | undefined): string | null {
  const normalized = branch?.replace(/^refs\/heads\//, '').trim()
  return normalized || null
}

function hasScopedExecution(args: SourceControlLinkedWorkItemUrlInput): boolean {
  return Boolean(
    args.settings?.activeRuntimeEnvironmentId?.trim() || args.repo?.connectionId?.trim()
  )
}

function getLinearIssueFromCache(
  cache: NullableCache<LinearIssue> | undefined,
  linkedLinearIssue: string | null | undefined
): LinearIssue | null {
  const linked = linkedLinearIssue?.trim()
  if (!linked) {
    return null
  }
  return findCachedItem(
    cache,
    (issue, key) =>
      issue.id === linked ||
      issue.identifier === linked ||
      key === linked ||
      key.endsWith(`::${linked}`)
  )
}

function getLinearOrganizationUrlKey(
  linearStatus: LinearConnectionStatus | null | undefined,
  issue: LinearIssue | null
): string | null {
  const workspaces = linearStatus?.workspaces ?? []
  const issueWorkspace = issue?.workspaceId
    ? workspaces.find((workspace) => workspace.id === issue.workspaceId)
    : undefined
  const selectedWorkspaceId =
    linearStatus?.selectedWorkspaceId && linearStatus.selectedWorkspaceId !== 'all'
      ? linearStatus.selectedWorkspaceId
      : linearStatus?.activeWorkspaceId
  const selectedWorkspace = selectedWorkspaceId
    ? workspaces.find((workspace) => workspace.id === selectedWorkspaceId)
    : undefined
  return (
    issueWorkspace?.organizationUrlKey?.trim() ||
    selectedWorkspace?.organizationUrlKey?.trim() ||
    linearStatus?.viewer?.organizationUrlKey?.trim() ||
    null
  )
}

function buildLinearIssueUrl(args: {
  linkedLinearIssue: string | null | undefined
  issue: LinearIssue | null
  linearStatus: LinearConnectionStatus | null | undefined
}): string | null {
  const cachedUrl = normalizeAbsoluteHttpUrl(args.issue?.url)
  if (cachedUrl) {
    return cachedUrl
  }

  const identifier = (args.issue?.identifier || args.linkedLinearIssue || '').trim()
  const organizationUrlKey = getLinearOrganizationUrlKey(args.linearStatus, args.issue)
  if (!identifier || !organizationUrlKey) {
    return null
  }
  return normalizeAbsoluteHttpUrl(
    `https://linear.app/${encodeURIComponent(organizationUrlKey)}/issue/${encodeURIComponent(
      identifier
    )}`
  )
}

function getGitHubIssueUrl(args: SourceControlLinkedWorkItemUrlInput): string | null {
  const number = args.worktree?.linkedIssue
  if (number == null || !args.repo) {
    return null
  }
  const item = findCachedGitHubWorkItem({
    cache: args.githubWorkItemsCache,
    repo: args.repo,
    type: 'issue',
    number
  })
  const cachedIssue =
    item ??
    args.githubIssueCache?.[`${args.repo.id}::${number}`]?.data ??
    args.githubIssueCache?.[`${args.repo.path}::${number}`]?.data ??
    null
  return normalizeAbsoluteHttpUrl(cachedIssue?.url)
}

function getGitHubPullRequestUrl(args: SourceControlLinkedWorkItemUrlInput): string | null {
  const number = args.worktree?.linkedPR
  if (number == null || !args.repo) {
    return null
  }
  const branch = normalizeBranchName(args.branch)
  const scopedPR =
    branch && args.githubPrCache
      ? args.githubPrCache[
          getGitHubPRCacheKey(
            args.repo.path,
            args.repo.id,
            branch,
            args.settings,
            args.repo.connectionId
          )
        ]?.data
      : null
  if (scopedPR?.number === number) {
    return normalizeAbsoluteHttpUrl(scopedPR.url)
  }
  if (branch && hasScopedExecution(args)) {
    return null
  }
  const item = findCachedGitHubWorkItem({
    cache: args.githubWorkItemsCache,
    repo: args.repo,
    type: 'pr',
    number
  })
  return normalizeAbsoluteHttpUrl(item?.url)
}

function getGitLabMergeRequestUrl(args: SourceControlLinkedWorkItemUrlInput): string | null {
  const number = args.worktree?.linkedGitLabMR
  const branch = normalizeBranchName(args.branch)
  if (number == null || !args.repo || !branch) {
    return null
  }
  const cacheKey = getHostedReviewCacheKey(
    args.repo.path,
    branch,
    args.settings,
    args.repo.id,
    args.repo.connectionId
  )
  const cachedReview = args.hostedReviewCache?.[cacheKey]?.data ?? null
  if (cachedReview?.provider !== 'gitlab' || cachedReview.number !== number) {
    return null
  }
  return normalizeAbsoluteHttpUrl(cachedReview?.url)
}

export function resolveSourceControlLinkedWorkItemUrl(
  args: SourceControlLinkedWorkItemUrlInput
): string | null {
  const worktree = args.worktree
  if (!worktree) {
    return null
  }

  const linearIssue = getLinearIssueFromCache(args.linearIssueCache, worktree.linkedLinearIssue)
  return (
    buildLinearIssueUrl({
      linkedLinearIssue: worktree.linkedLinearIssue,
      issue: linearIssue,
      linearStatus: args.linearStatus
    }) ??
    getGitHubIssueUrl(args) ??
    getGitLabMergeRequestUrl(args) ??
    getGitHubPullRequestUrl(args)
  )
}
