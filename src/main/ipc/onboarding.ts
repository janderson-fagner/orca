import { ipcMain } from 'electron'
import { sanitizeOnboardingUpdate, type Store } from '../persistence'
import type { OnboardingState } from '../../shared/types'

// Why: `_legacySoftSkipMigrationDone` is a main-only persistence
// discriminator. The shared type still carries it so persistence.ts can
// read/write it, but the renderer must never see it — leaking it widens
// the contract beyond what the comments promise. Strip before crossing
// the IPC boundary on both `get` and `update` responses.
function toRendererSafe(state: OnboardingState): OnboardingState {
  const { _legacySoftSkipMigrationDone: _omit, ...rendererSafe } = state
  return rendererSafe
}

export function registerOnboardingHandlers(store: Store): void {
  ipcMain.removeHandler('onboarding:get')
  ipcMain.removeHandler('onboarding:update')

  ipcMain.handle('onboarding:get', (): OnboardingState => toRendererSafe(store.getOnboarding()))
  // Why: never trust renderer input — a compromised/buggy caller could send
  // unknown keys or wrong-typed values that would poison persisted state.
  // Run every update through the shared whitelist sanitizer.
  ipcMain.handle('onboarding:update', (_event, updates: unknown): OnboardingState => {
    return toRendererSafe(store.updateOnboarding(sanitizeOnboardingUpdate(updates)))
  })
}
