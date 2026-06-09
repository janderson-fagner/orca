import { describe, expect, it } from 'vitest'
import {
  getCreateReviewDiscoveryHostKey,
  normalizeCreateReviewBaseSearchResults
} from './useCreatePullRequestDialogFields'

describe('normalizeCreateReviewBaseSearchResults', () => {
  it('uses detailed local branch names for base refs from arbitrary remotes', () => {
    expect(
      normalizeCreateReviewBaseSearchResults([
        {
          refName: 'mycorp-fork/main',
          localBranchName: 'main'
        }
      ])
    ).toEqual(['main'])
  })

  it('dedupes equivalent base branches found on multiple remotes', () => {
    expect(
      normalizeCreateReviewBaseSearchResults([
        {
          refName: 'origin/main',
          localBranchName: 'main'
        },
        {
          refName: 'upstream/main',
          localBranchName: 'main'
        },
        {
          refName: 'mycorp-fork/release/1.0',
          localBranchName: 'release/1.0'
        }
      ])
    ).toEqual(['main', 'release/1.0'])
  })
})

describe('getCreateReviewDiscoveryHostKey', () => {
  it('uses runtime scope before SSH connection scope', () => {
    expect(
      getCreateReviewDiscoveryHostKey(
        { activeRuntimeEnvironmentId: 'runtime-1' },
        { connectionId: 'ssh-1' }
      )
    ).toBe('runtime:runtime-1')
  })

  it('uses SSH scope when no runtime environment is active', () => {
    expect(
      getCreateReviewDiscoveryHostKey(
        { activeRuntimeEnvironmentId: null },
        { connectionId: 'ssh-1' }
      )
    ).toBe('ssh:ssh-1')
  })

  it('uses local scope without runtime or SSH context', () => {
    expect(
      getCreateReviewDiscoveryHostKey({ activeRuntimeEnvironmentId: null }, { connectionId: null })
    ).toBe('local')
  })

  it('keeps unknown scope when the repo has not loaded yet', () => {
    expect(getCreateReviewDiscoveryHostKey({ activeRuntimeEnvironmentId: null }, null)).toBe(
      'unknown'
    )
  })
})
