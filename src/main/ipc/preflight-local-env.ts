import { mergePersistedWindowsPath } from '../pty/windows-environment-path'

function cloneProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

export function buildLocalPreflightEnv(): NodeJS.ProcessEnv | undefined {
  if (process.platform !== 'win32') {
    return undefined
  }
  const env = cloneProcessEnv()
  // Why: newly installed CLIs update persisted Windows Path, but the running
  // Electron process keeps its old environment until we merge it explicitly.
  mergePersistedWindowsPath(env)
  return env
}
