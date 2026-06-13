// Reproduction harness for issue #5308: a hung git subprocess on the
// worktree-resolution / status read path (e.g. a non-git folder on a wedged
// NFS mount, or git waiting on a credential/stdin prompt) must not hang
// forever. Without a default timeout the promise never settles, the libuv
// subprocess slot is held, and the serve runtime stops answering every client.
import { describe, expect, it } from 'vitest'
import { resolveGitDefaultTimeoutMs, GIT_DEFAULT_TIMEOUT_MS } from './runner'

describe('resolveGitDefaultTimeoutMs', () => {
  it('honors an explicit caller timeout verbatim', () => {
    expect(resolveGitDefaultTimeoutMs(['status'], 1234)).toBe(1234)
    // Explicit 0 means "caller opted out" — never override it.
    expect(resolveGitDefaultTimeoutMs(['status'], 0)).toBe(0)
  })

  it('applies the default timeout to read-path commands with no explicit value', () => {
    // These are the commands on the hot worktree-resolution / status path that
    // wedged the runtime in #5308. They should never run unbounded.
    for (const args of [
      ['worktree', 'list', '--porcelain', '-z'],
      ['status', '--porcelain'],
      ['rev-parse', '--show-toplevel'],
      ['symbolic-ref', '--short', 'HEAD'],
      ['config', '--get', 'user.name']
    ]) {
      expect(resolveGitDefaultTimeoutMs(args, undefined)).toBe(GIT_DEFAULT_TIMEOUT_MS)
    }
  })

  it('exempts long-running network subcommands from the default timeout', () => {
    // Clone/fetch/pull/push are legitimately slow and must not be capped by the
    // generic read-path default — capping them would break large-repo workflows.
    for (const args of [
      ['clone', 'https://example.com/repo.git'],
      ['fetch', '--prune'],
      ['pull', '--rebase', 'origin', 'main'],
      ['push', 'origin', 'HEAD'],
      ['remote', 'update'],
      ['submodule', 'update', '--init'],
      ['lfs', 'pull']
    ]) {
      expect(resolveGitDefaultTimeoutMs(args, undefined)).toBeUndefined()
    }
  })

  it('looks past global flags to find the subcommand', () => {
    // `git -c key=val -C /path fetch` is still a fetch.
    expect(
      resolveGitDefaultTimeoutMs(['-c', 'gc.auto=0', '-C', '/repo', 'fetch'], undefined)
    ).toBeUndefined()
    expect(
      resolveGitDefaultTimeoutMs(['-c', 'core.pager=cat', 'status', '--porcelain'], undefined)
    ).toBe(GIT_DEFAULT_TIMEOUT_MS)
  })
})
