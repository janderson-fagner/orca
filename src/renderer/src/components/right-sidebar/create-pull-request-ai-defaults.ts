import { getRuntimeGitScope } from '@/runtime/runtime-git-client'
import { getCommitMessageModelDiscoveryHostKeyForScope } from '../../../../shared/commit-message-host-key'
import {
  DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
  resolveSourceControlAiForOperation,
  resolveSourceControlAiPrCreationDefaults
} from '../../../../shared/source-control-ai'
import type { SourceControlAiPrCreationDefaults } from '../../../../shared/source-control-ai-types'
import type { GlobalSettings, Repo } from '../../../../shared/types'

export function resolveCreatePullRequestAiDefaults({
  settings,
  repo
}: {
  settings: GlobalSettings | null | undefined
  repo: Pick<Repo, 'connectionId' | 'sourceControlAi'> | null | undefined
}): Required<SourceControlAiPrCreationDefaults> {
  if (!settings) {
    return DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
  }
  const hostKey = getCommitMessageModelDiscoveryHostKeyForScope(
    getRuntimeGitScope(settings, repo?.connectionId)
  )
  const resolved = resolveSourceControlAiForOperation({
    settings,
    repo,
    operation: 'pullRequest',
    discoveryHostKey: hostKey,
    prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
  })
  return resolved.ok
    ? resolved.value.prCreationDefaults
    : resolveSourceControlAiPrCreationDefaults({
        settings,
        repo,
        prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
      })
}
