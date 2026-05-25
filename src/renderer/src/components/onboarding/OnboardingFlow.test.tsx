import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultOnboardingState, getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import OnboardingFlow from './OnboardingFlow'

describe('OnboardingFlow', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState({
      repos: [],
      settings: getDefaultSettings('/tmp')
    })
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
  })

  afterEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    vi.unstubAllGlobals()
  })

  it('renders the tour intro in the standard left-aligned onboarding shell', () => {
    const html = renderToStaticMarkup(
      <OnboardingFlow
        onboarding={{
          ...getDefaultOnboardingState(),
          lastCompletedStep: 5
        }}
        onOnboardingChange={vi.fn()}
      />
    )

    expect(html).toContain('Explore Orca')
    expect(html).toContain('Preview the core workflow.')
    expect(html).toContain('Run agents in isolated workspaces.')
    expect(html).toContain('Coordinate larger tasks with Agent orchestration.')
    expect(html).toContain('Let AI review diffs, check your app in Orca browser, and draft PRs.')
    expect(html).not.toContain('Write and preview Markdown.')
    expect(html).toContain('items-start')
    expect(html).toContain('text-left')
    expect(html).toContain('Continue')
    expect(html).toContain('Skip to project setup')
    expect(html).not.toContain('Skip the tour')
  })
})
