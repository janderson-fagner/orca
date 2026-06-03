# Agent Detection Paths

## Problem

Orca can miss CLIs that work in a user's terminal because detection runs from a different process environment. This is common on WSL when tools are installed through `nvm`, `asdf`, or similar shell initializers: an interactive WSL terminal can run `codex`, while a non-interactive probe such as `bash -lc 'command -v codex'` cannot see the same PATH.

The wrong fix is to make a detection path automatically become the terminal launch command. If a user enters `/home/axdr/.nvm/versions/node/v20.19.5/bin/codex` only to prove Codex exists, Orca should not start typing that full path into every terminal when plain `codex` already works.

## Goal

Make local agent availability runtime-aware without changing launch behavior by surprise:

1. Users can provide a detection path for an undetected local agent.
2. A valid detection path makes the agent appear in launch and default choices.
3. Detection paths are scoped to Windows/host, WSL default, or a named WSL distro.
4. WSL probes use an interactive shell so `.bashrc`-initialized tools such as `nvm` are detected as plain commands.
5. Launch commands remain clean and backward-compatible: Orca launches the catalog command, or the existing legacy launch override if one is configured.

## Non-Goals

- No filesystem scanning for agent installs.
- No package-manager-specific discovery.
- No SSH-specific detection path editor in this pass.
- No new launch override UX. Existing flat `agentCmdOverrides` launch behavior is preserved.

## Design

### Runtime-Scoped Availability

Add `agentCmdOverridesByRuntime?: Record<string, Partial<Record<TuiAgent, string>>>` to settings.

Runtime keys:

- `host`
- `wsl:default`
- `wsl:<distro>`

The existing flat `agentCmdOverrides` remains the legacy launch override map. Runtime-scoped values are used for availability detection and UI provenance, not for terminal startup command construction.

### Detection

Renderer computes the active local agent runtime and passes the effective detection paths to preflight detection. Main preflight checks:

- catalog detect commands from `TUI_AGENT_CONFIG`
- user-provided detection path executable tokens

The result carries provenance:

```ts
{ id: TuiAgent, catalogFound: boolean, overrideFound: boolean }
```

The renderer still derives the id list for existing launch/default consumers, but the Settings UI can distinguish:

- `Detected`: catalog command was found
- `Detected via path`: detection path was found
- `Not installed`: neither was found
- `Path not found`: a saved detection path no longer resolves

### WSL Shell Mode

WSL probes use interactive bash (`bash -ic`) for command availability. This matches the user's WSL terminal better than `bash -lc`, because `nvm` and similar tools are commonly initialized from `.bashrc`.

Agent detection batches all catalog commands and detection paths into one WSL shell invocation. A cold distro can take several seconds to start; batching avoids racing dozens of `wsl.exe` processes that can collectively time out and cache an empty first result.

This applies to:

- agent preflight detection
- the Codex WSL account availability check that previously produced "Codex CLI is not available in WSL ..."

The actual `codex login` WSL spawn remains the existing explicit login command.

### Launch Separation

Runtime-scoped detection paths do not replace launch commands.

Example:

- Detection path for WSL default: `/home/axdr/.nvm/versions/node/v20.19.5/bin/codex`
- `+` menu label: `Codex`
- terminal startup command: `codex`

If the user has an existing legacy launch override such as `codex --profile work`, launch continues to use that legacy override.

## UI

Detection paths are progressive-disclosure recovery UI, not a primary per-row control.

Copy:

- Undetected row action: `Already installed? Add detection path`
- Saved-path row action: `Edit detection path`
- Editor label: `Detection path for Windows`
- Editor label: `Detection path for WSL default`
- Editor label: `Detection path for WSL <distro>`
- Invalid saved path badge: `Path not found`

Help text:

> Used only to detect Codex. Launch still runs `codex`.

The compact row keeps showing the catalog launch command (`codex`, `claude`, etc.). If a detection path is configured, it is shown separately so the UI does not imply launch replacement.

## Data Flow

1. Settings opens Agents pane.
2. Renderer computes local preflight context from Account/Agent location.
3. Renderer resolves effective detection paths for that context.
4. Renderer calls `preflight.detectAgents({ ...context, agentCmdOverrides })`.
5. Main preflight checks catalog commands plus detection-path executable tokens.
6. Store receives provenance and derives detected ids.
7. Agents pane renders `Detected`, `Detected via path`, `Not installed`, or `Path not found`.
8. Launch paths continue to use legacy flat `agentCmdOverrides` only.

## Test Plan

- Shared helper tests for runtime keys and scoped availability resolution.
- Preflight tests for catalog-only, custom-check-only, both-found, and invalid custom-check cases.
- WSL preflight tests asserting `bash -ic` is used.
- Codex WSL account test asserting the availability check uses `bash -ic`.
- Renderer store tests for runtime-scoped detection cache keys.
- Agents pane tests for detection-path UI states.
- Launch tests proving runtime-scoped detection paths do not replace terminal startup commands.
- Typecheck, lint, format, and Electron UI validation.
