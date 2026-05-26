import type {
  ClaudeRuntimeAuthPreparation,
  ClaudeRuntimeAuthService
} from '../claude-accounts/runtime-auth-service'
import type { Store } from '../persistence'
import {
  getOrcaManagedClaudeHomePath,
  syncSystemClaudeResourcesIntoManagedHome
} from './claude-home-paths'
import { syncSystemClaudeSettingsIntoRuntimeHome } from './claude-settings-mirror'

export type ClaudeRuntimeHomePreparation =
  | {
      mode: 'runtime'
      status: 'ok'
      configDir: string
      auth: ClaudeRuntimeAuthPreparation
    }
  | {
      mode: 'legacy'
      reason: string
      auth: ClaudeRuntimeAuthPreparation
    }

export class ClaudeRuntimeHomeService {
  constructor(
    private readonly store: Store,
    private readonly runtimeAuth: ClaudeRuntimeAuthService
  ) {}

  async prepareForClaudeLaunch(
    input: { cwd?: string } = {}
  ): Promise<ClaudeRuntimeHomePreparation> {
    const settings = this.store.getSettings()
    if (settings.agentStatusHooksEnabled === false) {
      return {
        mode: 'legacy',
        reason: 'disabled',
        auth: await this.runtimeAuth.prepareForClaudeLaunch()
      }
    }

    const configDir = getOrcaManagedClaudeHomePath()
    try {
      syncSystemClaudeSettingsIntoRuntimeHome(configDir)
      syncSystemClaudeResourcesIntoManagedHome()
      // Reserved for Phase 2b. Keep cwd threaded now so every launch site has
      // the correct shape before MCP project-state mirroring lands.
      void input.cwd
      const auth = await this.runtimeAuth.prepareForClaudeLaunch({ configDir })
      if (auth.configDir !== configDir) {
        return {
          mode: 'legacy',
          reason: 'auth-config-dir-mismatch',
          auth: await this.runtimeAuth.prepareForClaudeLaunch()
        }
      }
      return { mode: 'runtime', status: 'ok', configDir, auth }
    } catch (error) {
      console.warn('[claude-runtime-home] Falling back to legacy Claude launch:', error)
      return {
        mode: 'legacy',
        reason: error instanceof Error ? error.message : String(error),
        auth: await this.runtimeAuth.prepareForClaudeLaunch()
      }
    }
  }
}
