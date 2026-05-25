import { describe, expect, it } from 'vitest'
import { CONTEXTUAL_TOUR_IDS } from './contextual-tours'
import { FEATURE_INTERACTION_IDS } from './feature-interactions'
import {
  FEATURE_EDUCATION_CONTEXTUAL_TOUR_IDS,
  FEATURE_EDUCATION_FEATURE_IDS,
  normalizeFeatureEducationSource
} from './feature-education-telemetry'

describe('feature education telemetry constants', () => {
  it('keeps contextual tour telemetry ids aligned with tour definitions', () => {
    expect(FEATURE_EDUCATION_CONTEXTUAL_TOUR_IDS).toEqual(CONTEXTUAL_TOUR_IDS)
  })

  it('keeps feature interaction telemetry ids aligned with interaction definitions', () => {
    expect(FEATURE_EDUCATION_FEATURE_IDS).toEqual(FEATURE_INTERACTION_IDS)
  })

  it('normalizes unknown telemetry sources to a bounded fallback', () => {
    expect(normalizeFeatureEducationSource('tasks_open')).toBe('tasks_open')
    expect(normalizeFeatureEducationSource('https://example.com/private')).toBe('unknown')
    expect(normalizeFeatureEducationSource(null)).toBe('unknown')
  })
})
