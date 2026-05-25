import type { ContextualTourId } from './contextual-tours'
import type { FeatureInteractionId } from './feature-interactions'

export const FEATURE_EDUCATION_CONTEXTUAL_TOUR_IDS = [
  'right-sidebar',
  'workspace-board',
  'browser',
  'tasks',
  'automations',
  'workspace-creation'
] as const satisfies readonly ContextualTourId[]

export const FEATURE_EDUCATION_FEATURE_IDS = [
  'right-sidebar',
  'workspace-board',
  'browser',
  'tasks',
  'automations',
  'workspace-creation',
  'voice-dictation'
] as const satisfies readonly FeatureInteractionId[]

export const FEATURE_EDUCATION_SOURCES = [
  'right_sidebar_visible',
  'workspace_board_visible',
  'browser_visible',
  'tasks_open',
  'automations_open',
  'workspace_creation_visible',
  'workspace_creation_modal',
  'workspace_creation_add_project',
  'dictation_session',
  'unknown'
] as const

export const CONTEXTUAL_TOUR_OUTCOMES = ['completed', 'skipped', 'cancelled'] as const

export type FeatureEducationSource = (typeof FEATURE_EDUCATION_SOURCES)[number]
export type ContextualTourOutcome = (typeof CONTEXTUAL_TOUR_OUTCOMES)[number]

export function normalizeFeatureEducationSource(
  value: string | null | undefined
): FeatureEducationSource {
  return FEATURE_EDUCATION_SOURCES.includes(value as FeatureEducationSource)
    ? (value as FeatureEducationSource)
    : 'unknown'
}
