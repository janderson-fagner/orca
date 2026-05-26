import type { HooksConfig } from '../agent-hooks/installer-utils'
import { isPlainObject } from '../agent-hooks/installer-utils'
import type { IFilesystemProvider } from '../providers/types'
import { applyManagedHooks, removeManagedHooks } from './hook-settings'
import { getClaudeManagedScript } from './hook-service'

const REMOTE_CLAUDE_RESOURCE_ENTRIES = [
  'agents',
  'commands',
  'skills',
  'plugins',
  'output-styles'
] as const

const REMOTE_CLAUDE_AUTH_ENTRIES = ['.credentials.json'] as const
const REMOTE_CLAUDE_CONFIG_FILE_NAME = '.claude.json'
const REMOTE_MANAGED_HOOK_SCRIPT_NAME = 'claude-hook.sh'

export type RemoteClaudeRuntimeHomePreparation = {
  configDir: string
}

export async function prepareRemoteClaudeRuntimeHome(
  provider: IFilesystemProvider,
  input: { remoteHome?: string | null } = {}
): Promise<RemoteClaudeRuntimeHomePreparation> {
  const remoteHome = stripTrailingSlash(input.remoteHome ?? (await provider.realpath('~')))
  const systemClaudeHome = remoteJoin(remoteHome, '.claude')
  const runtimeHome = getRemoteClaudeRuntimeHomePath(remoteHome)
  const scriptPath = remoteJoin(remoteHome, '.orca', 'agent-hooks', REMOTE_MANAGED_HOOK_SCRIPT_NAME)

  await provider.createDir(runtimeHome)
  await provider.createDir(remoteJoin(remoteHome, '.orca', 'agent-hooks'))
  await provider.writeFile(scriptPath, getClaudeManagedScript('posix'))

  const systemSettingsPath = remoteJoin(systemClaudeHome, 'settings.json')
  const runtimeSettingsPath = remoteJoin(runtimeHome, 'settings.json')
  const systemConfig = await readRemoteClaudeSettings(provider, systemSettingsPath)
  const { config: cleanedConfig } = removeManagedHooks(
    systemConfig,
    REMOTE_MANAGED_HOOK_SCRIPT_NAME
  )
  const nextConfig = applyManagedHooks(
    cleanedConfig,
    `sh ${quotePosix(scriptPath)}`,
    REMOTE_MANAGED_HOOK_SCRIPT_NAME
  )
  await writeJsonIfChanged(provider, runtimeSettingsPath, nextConfig)

  await mirrorNewerRemoteTextFile(
    provider,
    getRemoteClaudeConfigPath(provider, remoteHome, systemClaudeHome),
    remoteJoin(runtimeHome, REMOTE_CLAUDE_CONFIG_FILE_NAME)
  )
  for (const entryName of REMOTE_CLAUDE_AUTH_ENTRIES) {
    await mirrorNewerRemoteTextFile(
      provider,
      remoteJoin(systemClaudeHome, entryName),
      remoteJoin(runtimeHome, entryName)
    )
  }
  for (const entryName of REMOTE_CLAUDE_RESOURCE_ENTRIES) {
    await copyRemoteResourceIfMissing(
      provider,
      remoteJoin(systemClaudeHome, entryName),
      remoteJoin(runtimeHome, entryName)
    )
  }

  return { configDir: runtimeHome }
}

export function getRemoteClaudeRuntimeHomePath(remoteHome: string): string {
  return remoteJoin(stripTrailingSlash(remoteHome), '.orca', 'claude-runtime-home', 'home')
}

async function readRemoteClaudeSettings(
  provider: IFilesystemProvider,
  settingsPath: string
): Promise<HooksConfig> {
  const content = await readRemoteTextFileIfExists(provider, settingsPath)
  if (content === null) {
    return {}
  }
  const parsed: unknown = JSON.parse(content)
  if (!isPlainObject(parsed)) {
    throw new Error(`Claude settings must be a JSON object: ${settingsPath}`)
  }
  return parsed
}

async function getRemoteClaudeConfigPath(
  provider: IFilesystemProvider,
  remoteHome: string,
  systemClaudeHome: string
): Promise<string> {
  const colocatedPath = remoteJoin(systemClaudeHome, REMOTE_CLAUDE_CONFIG_FILE_NAME)
  if (await remotePathExists(provider, colocatedPath)) {
    return colocatedPath
  }
  return remoteJoin(remoteHome, REMOTE_CLAUDE_CONFIG_FILE_NAME)
}

async function writeJsonIfChanged(
  provider: IFilesystemProvider,
  targetPath: string,
  config: HooksConfig
): Promise<void> {
  const serialized = `${JSON.stringify(config, null, 2)}\n`
  const existing = await readRemoteTextFileIfExists(provider, targetPath)
  if (existing === serialized) {
    return
  }
  await provider.writeFile(targetPath, serialized)
}

async function mirrorNewerRemoteTextFile(
  provider: IFilesystemProvider,
  sourcePathPromise: Promise<string> | string,
  targetPath: string
): Promise<void> {
  const sourcePath = await sourcePathPromise
  const sourceStat = await statIfExists(provider, sourcePath)
  if (!sourceStat || sourceStat.type !== 'file') {
    return
  }
  const targetStat = await statIfExists(provider, targetPath)
  if (targetStat && targetStat.mtime >= sourceStat.mtime) {
    return
  }
  const source = await provider.readFile(sourcePath)
  if (source.isBinary) {
    return
  }
  // Why: remote Claude auth/config can refresh inside the runtime home. Only a
  // newer system file should replace it, so token refreshes are not rolled back.
  await provider.writeFile(targetPath, source.content)
}

async function copyRemoteResourceIfMissing(
  provider: IFilesystemProvider,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  const sourceStat = await statIfExists(provider, sourcePath)
  if (!sourceStat) {
    return
  }
  if (await remotePathExists(provider, targetPath)) {
    return
  }
  await provider.copy(sourcePath, targetPath)
}

async function readRemoteTextFileIfExists(
  provider: IFilesystemProvider,
  filePath: string
): Promise<string | null> {
  try {
    const result = await provider.readFile(filePath)
    return result.isBinary ? null : result.content
  } catch (error) {
    if (isMissingRemotePathError(error)) {
      return null
    }
    throw error
  }
}

async function remotePathExists(provider: IFilesystemProvider, filePath: string): Promise<boolean> {
  return (await statIfExists(provider, filePath)) !== null
}

async function statIfExists(
  provider: IFilesystemProvider,
  filePath: string
): Promise<Awaited<ReturnType<IFilesystemProvider['stat']>> | null> {
  try {
    return await provider.stat(filePath)
  } catch (error) {
    if (isMissingRemotePathError(error)) {
      return null
    }
    throw error
  }
}

function isMissingRemotePathError(error: unknown): boolean {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
  if (code === 'ENOENT') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /\bENOENT\b|no such file or directory|not found/i.test(message)
}

function remoteJoin(base: string, ...parts: string[]): string {
  const normalizedBase = stripTrailingSlash(base)
  const suffix = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.length > 0)
    .join('/')
  if (!suffix) {
    return normalizedBase
  }
  return normalizedBase === '/' ? `/${suffix}` : `${normalizedBase}/${suffix}`
}

function stripTrailingSlash(value: string): string {
  const stripped = value.replace(/\/+$/g, '')
  return stripped.length > 0 ? stripped : '/'
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
