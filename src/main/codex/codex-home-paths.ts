import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

export function getSystemCodexHomePath(): string {
  return join(homedir(), '.codex')
}

export function getOrcaManagedCodexHomePath(): string {
  const managedHomePath = join(app.getPath('userData'), 'codex-runtime-home', 'home')
  mkdirSync(managedHomePath, { recursive: true })
  return managedHomePath
}
