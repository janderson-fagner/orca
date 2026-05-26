import { describe, expect, it, vi } from 'vitest'
import type { IFilesystemProvider, FileStat } from '../providers/types'
import { prepareRemoteClaudeRuntimeHome } from './claude-remote-runtime-home'

function createMissingPathError(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, stat '${path}'`), {
    code: 'ENOENT'
  })
}

function createRemoteProvider(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles))
  const mtimes = new Map<string, number>()
  let nextMtime = 1
  for (const path of files.keys()) {
    mtimes.set(path, nextMtime++)
  }
  const copied: { source: string; destination: string }[] = []
  const provider = {
    realpath: vi.fn(async () => '/home/dev'),
    createDir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content)
      mtimes.set(path, nextMtime++)
    }),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path)
      if (content === undefined) {
        throw createMissingPathError(path)
      }
      return { content, isBinary: false }
    }),
    stat: vi.fn(async (path: string): Promise<FileStat> => {
      const content = files.get(path)
      if (content === undefined) {
        throw createMissingPathError(path)
      }
      return { size: content.length, type: 'file', mtime: mtimes.get(path) ?? 0 }
    }),
    copy: vi.fn(async (source: string, destination: string) => {
      copied.push({ source, destination })
      files.set(destination, files.get(source) ?? '')
      mtimes.set(destination, nextMtime++)
    })
  } as unknown as IFilesystemProvider
  return { provider, files, copied }
}

describe('prepareRemoteClaudeRuntimeHome', () => {
  it('mirrors remote Claude settings and installs managed hooks into a remote runtime home', async () => {
    const { provider, files } = createRemoteProvider({
      '/home/dev/.claude/settings.json': '{ "model": "sonnet" }\n',
      '/home/dev/.claude/.credentials.json': '{ "token": "abc" }\n',
      '/home/dev/.claude.json': '{ "oauthAccount": { "email": "dev@example.com" } }\n'
    })

    const result = await prepareRemoteClaudeRuntimeHome(provider)

    expect(result.configDir).toBe('/home/dev/.orca/claude-runtime-home/home')
    expect(files.get('/home/dev/.orca/agent-hooks/claude-hook.sh')).toContain('#!/bin/sh')
    const settings = JSON.parse(
      files.get('/home/dev/.orca/claude-runtime-home/home/settings.json') ?? '{}'
    ) as { model?: string; hooks?: Record<string, { hooks: { command: string }[] }[]> }
    expect(settings.model).toBe('sonnet')
    expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.command).toBe(
      "sh '/home/dev/.orca/agent-hooks/claude-hook.sh'"
    )
    expect(files.get('/home/dev/.orca/claude-runtime-home/home/.credentials.json')).toContain(
      '"token"'
    )
    expect(files.get('/home/dev/.orca/claude-runtime-home/home/.claude.json')).toContain(
      'dev@example.com'
    )
  })

  it('does not overwrite newer runtime auth material', async () => {
    const { provider, files } = createRemoteProvider({
      '/home/dev/.claude/settings.json': '{}',
      '/home/dev/.claude/.credentials.json': '{ "token": "old" }\n',
      '/home/dev/.orca/claude-runtime-home/home/.credentials.json': '{ "token": "fresh" }\n'
    })

    await prepareRemoteClaudeRuntimeHome(provider)

    expect(files.get('/home/dev/.orca/claude-runtime-home/home/.credentials.json')).toContain(
      'fresh'
    )
  })
})
