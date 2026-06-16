import { readFile } from 'fs/promises'
import { join } from 'path'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { joinWorktreeRelativePath } from '../runtime/runtime-relative-paths'

const PULL_REQUEST_TEMPLATE_CANDIDATES = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.azuredevops/pull_request_template.md',
  '.azuredevops/PULL_REQUEST_TEMPLATE.md',
  '.gitea/pull_request_template.md',
  '.gitea/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'docs/PULL_REQUEST_TEMPLATE.md'
]

export async function readHostedPullRequestTemplate(
  repoPath: string,
  connectionId?: string | null
): Promise<string> {
  const remoteProvider = connectionId ? getSshFilesystemProvider(connectionId) : undefined
  if (connectionId && !remoteProvider) {
    return ''
  }
  for (const relativeCandidate of PULL_REQUEST_TEMPLATE_CANDIDATES) {
    try {
      if (remoteProvider) {
        const result = await remoteProvider.readFile(
          joinWorktreeRelativePath(repoPath, relativeCandidate)
        )
        if (result.isBinary) {
          continue
        }
        return result.content
      }
      return await readFile(join(repoPath, relativeCandidate), 'utf8')
    } catch {
      // Try the next conventional pull-request template path.
    }
  }
  return ''
}
