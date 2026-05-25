import type { ContextualTourId } from '../../../shared/contextual-tours'
import type { FeatureInteractionId } from '../../../shared/feature-interactions'
import {
  normalizeFeatureEducationSource,
  type ContextualTourOutcome
} from '../../../shared/feature-education-telemetry'
import { track } from './telemetry'

export function trackContextualTourShown(args: {
  tourId: ContextualTourId
  source: string | null | undefined
  wasFeaturePreviouslyInteracted: boolean
}): void {
  track('contextual_tour_shown', {
    tour_id: args.tourId,
    source: normalizeFeatureEducationSource(args.source),
    was_feature_previously_interacted: args.wasFeaturePreviouslyInteracted
  })
}

export function trackContextualTourOutcome(args: {
  tourId: ContextualTourId
  source: string | null | undefined
  outcome: ContextualTourOutcome
  stepsSeen: number
  totalSteps: number
}): void {
  track('contextual_tour_outcome', {
    tour_id: args.tourId,
    source: normalizeFeatureEducationSource(args.source),
    outcome: args.outcome,
    steps_seen: clampTourStepCount(args.stepsSeen),
    total_steps: clampTourStepCount(args.totalSteps, 1)
  })
}

export function trackFeatureInteractionFirstRecorded(args: {
  featureId: FeatureInteractionId
  source: string | null | undefined
  hadContextualTourSeen: boolean
}): void {
  track('feature_interaction_first_recorded', {
    feature_id: args.featureId,
    source: normalizeFeatureEducationSource(args.source),
    had_contextual_tour_seen: args.hadContextualTourSeen
  })
}

function clampTourStepCount(value: number, min = 0): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(8, Math.max(min, Math.round(value)))
}
