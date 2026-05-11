import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { RuntimeClientError } from './runtime-client-error'
import { resolveMacOSComputerUseAppPath } from './macos-native-provider-paths'
import type {
  ComputerUsePermissionId,
  ComputerUsePermissionSetupResult,
  ComputerUsePermissionStatus,
  ComputerUsePermissionStatusResult
} from '../../shared/computer-use-permissions-types'

export function openComputerUsePermissions(
  permissionId?: ComputerUsePermissionId
): ComputerUsePermissionSetupResult {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      helperAppPath: null,
      permissionId,
      openedSettings: false,
      launchedHelper: false,
      permissions: [
        { id: 'accessibility', status: 'unsupported' },
        { id: 'screenshots', status: 'unsupported' }
      ],
      nextStep: null
    }
  }

  const helperAppPath = resolveMacOSComputerUseAppPath()
  if (!helperAppPath) {
    throw new RuntimeClientError('accessibility_error', 'Orca Computer Use.app was not found')
  }
  const status = getComputerUsePermissionStatus()
  const nextStep = nextPermissionStep(status.permissions)

  if (!permissionId && !nextStep) {
    return {
      platform: process.platform,
      helperAppPath,
      permissionId,
      openedSettings: false,
      launchedHelper: false,
      permissions: status.permissions,
      nextStep
    }
  }

  closeExistingPermissionHelpers()
  const helperArgs = permissionId ? ['--permission', permissionId] : ['--permissions']
  const helper = spawn('/usr/bin/open', ['-n', helperAppPath, '--args', ...helperArgs], {
    detached: true,
    stdio: 'ignore'
  })
  helper.unref()

  return {
    platform: process.platform,
    helperAppPath,
    permissionId,
    openedSettings: permissionId !== undefined,
    launchedHelper: true,
    permissions: status.permissions,
    nextStep
  }
}

function closeExistingPermissionHelpers(): void {
  spawnSync('/usr/bin/pkill', ['-f', 'orca-computer-use-macos --permission'], {
    stdio: 'ignore'
  })
  spawnSync('/usr/bin/pkill', ['-f', 'orca-computer-use-macos --permissions'], {
    stdio: 'ignore'
  })
}

export function getComputerUsePermissionStatus(): ComputerUsePermissionStatusResult {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      permissions: [
        { id: 'accessibility', status: 'unsupported' },
        { id: 'screenshots', status: 'unsupported' }
      ]
    }
  }

  const helperAppPath = resolveMacOSComputerUseAppPath()
  if (!helperAppPath) {
    throw new RuntimeClientError('accessibility_error', 'Orca Computer Use.app was not found')
  }

  const raw = readPermissionStatusFromHelperApp(helperAppPath)

  return {
    platform: process.platform,
    permissions: [
      { id: 'accessibility', status: raw.accessibility ?? 'not-granted' },
      { id: 'screenshots', status: raw.screenshots ?? 'not-granted' }
    ]
  }
}

function readPermissionStatusFromHelperApp(
  helperAppPath: string
): Partial<Record<ComputerUsePermissionId, ComputerUsePermissionStatus>> {
  const directory = mkdtempSync(join(tmpdir(), 'orca-computer-permissions-'))
  const statusPath = join(directory, 'status.json')
  try {
    // Why: TCC can attribute direct executable probes to the parent shell;
    // launch the app bundle so status uses the same identity as real actions.
    const result = spawnSync(
      '/usr/bin/open',
      ['-n', helperAppPath, '--args', '--permission-status-file', statusPath],
      { stdio: 'ignore' }
    )
    if (result.error) {
      throw result.error
    }
    waitForStatusFile(statusPath)
    return JSON.parse(readFileSync(statusPath, 'utf8')) as Partial<
      Record<ComputerUsePermissionId, ComputerUsePermissionStatus>
    >
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

function waitForStatusFile(statusPath: string): void {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (existsSync(statusPath)) {
      return
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
  throw new RuntimeClientError(
    'action_timeout',
    'Orca Computer Use.app did not report permission status'
  )
}

function nextPermissionStep(
  permissions: ComputerUsePermissionStatusResult['permissions']
): string | null {
  const missing = permissions.find((permission) => permission.status !== 'granted')
  if (!missing) {
    return null
  }
  return `Grant ${missing.id === 'accessibility' ? 'Accessibility' : 'Screen Recording'} to Orca Computer Use, then retry get-app-state.`
}
