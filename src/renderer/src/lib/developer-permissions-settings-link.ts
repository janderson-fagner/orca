import { useAppStore } from '@/store'

/**
 * Open Settings → Developer Permissions. Used by `MacPermissionsHint` to land
 * on the Superset-shaped DeveloperPermissionsPane (shipped in #1233), whose
 * per-row status polling and `x-apple.systempreferences:` deep-links handle
 * the actual permission flow.
 */
export function openDeveloperPermissionsSettings(): void {
  const state = useAppStore.getState()
  state.openSettingsTarget({
    pane: 'developer-permissions',
    repoId: null,
    sectionId: 'developer-permissions'
  })
  state.openSettingsPage()
}
