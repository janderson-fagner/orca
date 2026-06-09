# Terminal Model/View Contract

## Goal

Terminal output should have one authoritative model path and many disposable
views. A renderer xterm is the fast interactive view, but it must not be the
only place hidden, remote, mobile, SSH, or CLI-visible terminal state exists.

This contract defines the boundary future terminal performance work should move
toward without changing the query-response behavior that real shells and TUIs
depend on.

## Terms

- **PTY stream:** Ordered bytes read from a local PTY, daemon PTY, SSH relay PTY,
  or remote runtime PTY.
- **Terminal model:** Main/runtime-owned state derived from PTY bytes. Today this
  is mostly the headless emulator plus retained read transcript state.
- **Terminal view:** A renderer xterm, mobile subscriber, remote desktop
  subscriber, or CLI read page consuming model state and live output.
- **Snapshot:** A bounded model serialization that can restore a view without
  replaying an unbounded byte log.
- **Transcript:** The retained output contract for `orca terminal read`; it is
  line/cursor oriented and distinct from a screen snapshot.

## Non-Negotiable Invariants

1. PTY reads do not stop to protect renderer performance. Backpressure may bound
   delivery to views, but terminal state, notifications, titles, and agent
   status keep advancing from the PTY stream.
2. Active visible terminal input/output stays on the lowest-latency path. Bulk
   hidden or background output must not delay keystroke-sized foreground redraws.
3. Hidden views do not own unbounded output memory. When a hidden renderer view
   cannot keep up, it becomes stale and restores from the model later.
4. Returning to a hidden or slept terminal must show model-correct output. A
   stale or replaced view may be cleared and replayed from a snapshot, but it
   must not show a warning fallback when model recovery is available.
5. Snapshots and live bytes have ordering metadata. A view restore must not
   duplicate bytes already included in the snapshot or drop bytes that arrived
   after it.
6. Terminal query authority stays with the visible renderer when needed. The
   headless model tracks state but must not answer DA, DSR, OSC 11, or other
   shell/TUI queries that would inject replies into the PTY.
7. The transcript contract stays separate from screen restore. `orca terminal
   read` must preserve bounded previews, cursor pagination, partial-line rules,
   truncation flags, and total counts even if view snapshots change shape.
8. Local, daemon, SSH, remote runtime, mobile, and CLI paths must either satisfy
   the same model/view contract or explicitly report that model recovery is
   unavailable.

## Current Owners

| Responsibility | Current owner |
| --- | --- |
| PTY byte source and local/SSH delivery | `src/main/ipc/pty.ts` |
| Daemon PTY state and headless snapshots | `src/main/daemon/headless-emulator.ts` |
| Runtime headless state, retained reads, mobile/session tabs | `src/main/runtime/orca-runtime.ts` |
| Remote terminal subscribe/multiplex/ACK semantics | `src/main/runtime/rpc/methods/terminal.ts` |
| Renderer xterm view and hidden restore behavior | `src/renderer/src/components/terminal-pane/pty-connection.ts` |
| Remote desktop runtime xterm transport | `src/renderer/src/runtime/remote-runtime-terminal-multiplexer.ts` |

## Snapshot Contract

A model snapshot must include:

- terminal dimensions used to produce the snapshot;
- enough ANSI state to rehydrate xterm before snapshot content;
- bounded screen and scrollback content;
- title and cwd metadata when known;
- source metadata that distinguishes headless/model snapshots from renderer
  fallback snapshots;
- monotonic ordering metadata for live-output reconciliation when available.

A snapshot must not:

- include unbounded transcript history;
- answer terminal queries while replaying into the model;
- overwrite newer live view output with older model output;
- hide that recovery was unavailable for a PTY surface.

## View Contract

A renderer or remote view may:

- write active visible output immediately;
- budget visible inactive output;
- skip hidden renderer writes when the model can recover the state;
- request fresh snapshots for restore, mobile subscription, or explicit remote
  snapshot recovery.

A view must:

- keep live-output buffers bounded while a snapshot is in flight;
- apply generation or sequence checks before replaying a snapshot;
- refresh/repaint after replay when xterm/WebGL needs an explicit paint;
- keep side effects such as title, bell, cwd, and agent status flowing from the
  PTY/model path even while renderer writes are skipped.

## Transcript Contract

The retained read transcript is not a screen dump. It must preserve:

- uncursored bounded latest preview behavior;
- cursor reads over completed retained lines;
- `oldestCursor`, `nextCursor`, `latestCursor`, and `returnedLineCount`;
- partial-line duplication rules;
- `truncated`, `limited`, and total count metadata;
- bounded memory for long partial lines and large output bursts.

Snapshot optimizations must be tested against this transcript contract instead
of assuming xterm scrollback serialization can replace it.

## Required Contract Tests

Before moving more runtime behavior behind the model/view boundary, add or
extend tests that prove:

- headless snapshots rehydrate rich alternate-screen TUI state;
- headless tracking does not answer DA, DSR, OSC 11, or theme-sensitive queries;
- hidden renderer overflow restores from model state without duplicate live
  output;
- sleep/wake and worktree revisit restore from model-correct state;
- SSH-backed PTYs follow the same snapshot and ordering semantics as local PTYs;
- remote runtime multiplex output remains ACK bounded and can request recovery
  snapshots;
- mobile subscribers receive bounded snapshots without unbounded pending live
  output;
- retained terminal reads remain pageable and bounded after large output.

Current coverage is spread across:

- `src/main/daemon/headless-emulator.test.ts`
- `src/main/daemon/session.test.ts`
- `src/main/runtime/mobile-subscribe-integration.test.ts`
- `src/main/runtime/rpc/terminal-subscribe-buffer.test.ts`
- `src/main/runtime/rpc/terminal-multiplex.test.ts`
- `src/main/runtime/orca-runtime.test.ts`
- `src/renderer/src/components/terminal-pane/remote-runtime-pty-transport.test.ts`
- `tests/e2e/terminal-hidden-tui-visual-restore.spec.ts`
- `tests/e2e/terminal-sleep-wake-restore.spec.ts`
- `tests/e2e/terminal-output-scheduler.spec.ts`
- `tests/e2e/artificial-opencode-terminal-load.spec.ts`

## Migration Shape

1. Keep the current green ACK/backpressure and hidden-restore stack intact.
2. Add contract tests for one PTY surface at a time: local, SSH, remote runtime,
   mobile, then CLI reads.
3. Move renderer-only restore authority behind model snapshots only where the
   contract is already executable.
4. Remove renderer fallback paths only after the equivalent model path has
   platform and TUI golden coverage.
5. Treat every hidden/slept/revisited TUI glitch as a contract failure, not as a
   local repaint quirk.
