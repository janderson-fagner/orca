import { describe, expect, it } from 'vitest'
import {
  buildPullRequestFieldsPrompt,
  parseGeneratedPullRequestFields,
  type PullRequestDraftContext
} from './pull-request-generation'

const context: PullRequestDraftContext = {
  branch: 'feature/pr-details',
  base: 'main',
  branchChangedByPreparation: false,
  currentTitle: 'Feature pr details',
  currentBody: '- Add form',
  currentDraft: false,
  commitSummary: '- feat: add generated PR details',
  changeSummary: 'M\tsrc/file.ts',
  patch: 'diff --git a/src/file.ts b/src/file.ts\n+export const value = true'
}

describe('buildPullRequestFieldsPrompt', () => {
  it('asks for compact JSON and includes PR context', () => {
    const prompt = buildPullRequestFieldsPrompt(context, 'Use conventional PR titles.')

    expect(prompt).toContain('Return ONLY compact JSON')
    expect(prompt).toContain('Head branch: feature/pr-details')
    expect(prompt).toContain('Current base: main')
    expect(prompt).toContain('Additional user prompt:')
    expect(prompt).toContain('Use conventional PR titles.')
  })

  it('includes linked work item context when a URL exists', () => {
    const prompt = buildPullRequestFieldsPrompt(
      { ...context, linkedWorkItemUrl: 'https://linear.app/orca/issue/ORC-123/fix-pr-details' },
      ''
    )

    expect(prompt).toContain(
      'Linked work item URL: https://linear.app/orca/issue/ORC-123/fix-pr-details'
    )
    expect(prompt).toContain('If a linked work item URL is provided')
  })

  it('omits the linked work item section when no URL exists', () => {
    const prompt = buildPullRequestFieldsPrompt(context, '')

    expect(prompt).not.toContain('Linked work item URL:')
  })
})

describe('parseGeneratedPullRequestFields', () => {
  it('parses fenced JSON output', () => {
    const fields = parseGeneratedPullRequestFields(
      '```json\n{"base":"main","title":"fix: add details.","body":"Summary","draft":true}\n```',
      context
    )

    expect(fields).toEqual({
      base: 'main',
      title: 'fix: add details',
      body: 'Summary',
      draft: true
    })
  })

  it('falls back for missing optional values', () => {
    const fields = parseGeneratedPullRequestFields('{"title":""}', context)

    expect(fields).toEqual({
      base: 'main',
      title: 'Feature pr details',
      body: '- Add form',
      draft: false
    })
  })
})
