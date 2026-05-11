# Onboarding "First Repo Required" — Design Rationale

This doc captures the design decisions behind the onboarding repo gate (step 4 of the wizard) as it ships on `brennanb2025/onboarding-first-repo-required`. It is post-implementation: it explains *why* the shipped surface looks the way it does, what alternatives were rejected, and which loose ends are deliberately deferred.

**What the gate does.** Step 4 (the repo step) is hard-required: the wizard only closes after the user adds a project (folder, clone, or SSH-remote repo). The "I'll add one later" affordance is gone, every renderer-side `closeWith('dismissed', ...)` writer was removed, and `useCloseWith` is narrowed to `outcome: 'completed'`.

**What this doc is not.** It does not relitigate "should we gate at all" — that decision is settled. It does not track every bug found during review; bugs are filed separately. It is the design rationale a future contributor needs to understand the gate without re-deriving the constraints.

## Reviewer's quick map

**The four onboarding steps** (`use-onboarding-flow.ts`):

1. `agent` (step index 0)
2. `theme` (step index 1)
3. `notifications` (step index 2)
4. `repo` (step index 3) — the gate

`lastCompletedStep === 3` therefore means "user finished notifications and is sitting on the repo gate." This matters for the legacy migration (item 3).

**Files that carry the design weight:**

- `src/renderer/src/components/onboarding/RepoStep.tsx` — the step UI, three CTAs (Open folder / Clone repo / Connect a remote).
- `src/renderer/src/components/onboarding/RemoteRepoStep.tsx` — in-wizard SSH sub-step, mounted in place of `RepoStep` when the user clicks "Connect a remote (SSH)".
- `src/renderer/src/components/onboarding/OnboardingFlow.tsx` — wizard shell. Owns the `z-[100]` overlay, the `repoSubstep` `'main' | 'remote'` toggle, the `beforeunload` abandonment emitter, and the SSH-CTA reveal latch.
- `src/renderer/src/components/onboarding/use-onboarding-flow.ts` — the flow controller. Hosts `activateRepoForUser`, `completeRepo`, `completeRepoFromRemote`, `retryRemoteAsFolder`.
- `src/renderer/src/components/onboarding/use-onboarding-flow-persistence.ts` — `useCloseWith`, narrowed to `'completed'`-only.
- `src/renderer/src/components/onboarding/should-show-onboarding.ts` — gate predicate; suppresses the wizard for `legacySoftSkipEligible` rows.
- `src/renderer/src/components/sidebar/AddRepoSteps.tsx` — source of `useRemoteRepo` and `RemoteStepBody`, both reused (not duplicated) by the wizard's SSH sub-step.
- `src/main/persistence.ts` — `OnboardingState` parse boundary. Holds `sanitizeOnboardingUpdate` (with the `allowInternal` gate) and the legacy soft-skip migration in `Store.load`.
- `src/main/ipc/onboarding.ts` — strips `_legacySoftSkipMigrationDone` from `onboarding:get` / `onboarding:update` responses so the renderer cannot read it. `legacySoftSkipEligible` is intentionally left in the response because `shouldShowOnboarding` reads it; renderer writes of either field are blocked by the sanitizer's `allowInternal` gate.
- `src/shared/types.ts` — `OnboardingOutcome` (narrowed to `'completed'`), `OnboardingState` (with `legacySoftSkipEligible` and `_legacySoftSkipMigrationDone`).
- `src/shared/constants.ts` — `getDefaultOnboardingState`, which stamps `_legacySoftSkipMigrationDone: true` on new rows.
- `src/shared/telemetry-events.ts` — onboarding event registry (`onboardingPathSchema` includes `'ssh'`; new `onboardingStep4PathRevealedSchema` and `onboardingStep4AbandonedSchema`).

**Architectural note (z-index, applies to future work in this surface).** The wizard at `z-[100]` sits above Radix `Dialog` / `Sheet` / `Command` / `Tooltip` / `HoverCard` (all `z-50`) and `Popover` (`z-[60]`). Sonner toasts at `z-index: 999999999` render above the wizard and are unaffected. Anything that wants to "open a thing inside the wizard" must either bring the wizard into the modal-stack family with explicit z-ordering and Radix portal sibling-DOM-order awareness, or extract portable internals — which is what the SSH sub-step does (item 1). The shipped SSH sub-step is mounted in place of `RepoStep` rather than as a Radix `Dialog` for exactly this reason.

---

## Items

### 1. SSH path: in-wizard `RemoteRepoStep`, not a deep-link

**Implementation.** `RepoStep.tsx` renders three CTAs: Open a folder, Clone a repo, and "Connect a remote (SSH)". Clicking the third CTA flips `repoSubstep` to `'remote'` in `OnboardingFlow.tsx`, swapping `RepoStep` out for `RemoteRepoStep` in the same wizard shell (no overlay change, progress dots untouched). The e2e test in `tests/e2e/onboarding.spec.ts` pins the SSH CTA's presence on the gate page so a regression that drops the third path is caught alongside the no-skip assertions.

**Why an in-wizard sub-step, not a Radix dialog.** Mounting `AddRepoDialog` from inside the wizard would render the dialog UNDER the wizard overlay (z-index trap, see the architectural note). Lifting the wizard's z-index plus rewiring Radix portal stacking is risky; extracting the portable internals is not. `RemoteRepoStep` reuses `useRemoteRepo` and `RemoteStepBody` from `AddRepoSteps.tsx` — same code path, no JSX duplication. The dialog-only chrome (`<DialogHeader>` / `<DialogTitle>` / `<DialogDescription>`) is replaced with plain `<h2>` / `<p>` since Radix's title/description primitives require a `Dialog.Root` ancestor.

**Empty-SSH-targets case.** When the user has no configured SSH targets, `RemoteRepoStep` renders `SshTargetForm` inline (`showAddForm` branch) instead of deep-linking to Settings. A Settings deep-link would render under the wizard overlay; an inline form does not.

**Not-a-git-repo branch.** `retryRemoteAsFolder` in `use-onboarding-flow.ts` mirrors the local "Open a folder" silent fallback — re-adds with `kind: 'folder'`, no confirmation dialog. The user already chose "Connect a remote" on a step they cannot dismiss; a Radix confirm dialog would render under the overlay anyway. The sidebar `AddRepoDialog` keeps its existing confirmation flow because that surface is outside the wizard; the asymmetry is intentional.

**Why this matters.** Without an in-wizard SSH path, the gate excludes Orca's SSH-only audience entirely (their code lives on a remote dev box, not on the laptop). The previous soft-skip used to be their escape hatch; with the gate in place, the SSH sub-step is the substitute. Matches how emdash and t3code present remote/SSH as a peer of local in their first-run flows.

### 2. `activateRepoForUser` primitive

**Implementation.** `activateRepoForUser(repoId)` in `use-onboarding-flow.ts` is the single primitive `completeRepo` calls before `closeWith('completed', ...)`. It branches:

- **Worktree present** (folders via the IPC's synthesized worktree, local git, connected SSH-remote git): `activateAndRevealWorktree(worktreesByRepo[repoId][0].id)`.
- **Empty worktree list** (transient `worktrees:list` failure, SSH disconnect mid-`fetchWorktrees`): `setActiveRepo(repoId)` plus clear `activeWorktreeId`. The user lands on the home view with the repo selected; worktrees populate on reconnect.

**Ordering.** `activateRepoForUser` runs BEFORE `closeWith`. The primitive only mutates store state; it MUST NOT open Radix surfaces directly. Post-`closeWith` openers (the new-workspace composer for git repos) read the freshly-set `activeRepoId` and target the right surface. Opening modals from inside `activateRepoForUser` would re-trigger the wizard z-index trap.

**Why not a per-kind branch.** Folders, local git, and SSH-remote git all hit the worktree-present branch; the empty-list branch is the single degenerate case. Framing this as one primitive (rather than `if (folder) { ... } else if (git) { ... }`) keeps the contract honest: the gate's promise — "add a project and you're in" — has to deliver a usable surface for every kind.

**Why no composer for folders.** `useComposerState` filters to git repos and creates worktrees, which non-git folders can't do. Opening the composer for a folder repo would land the user on a stuck modal with no selectable repo. The composer's git-only contract is intentional; commit `d2448f82` chose to suppress the composer for folders rather than loosen it.

### 3. Legacy soft-skip migration

**The trap.** `shouldShowOnboarding()` previously only checked `closedAt === null`. Anyone who was partway through onboarding under the previous "I'll add one later" build would hit the new hard gate on next launch with no warning. The natural-seeming predicate `lastCompletedStep >= 3 && closedAt === null` does NOT identify legacy users — it is exactly the state of any new-build user sitting on the gate. Auto-skipping on that predicate would let any new user bypass the gate by quitting and relaunching during step 4.

**Implementation.** Two persisted fields, both main-write-only (renderer cannot forge either via the sanitizer's `allowInternal` gate; renderer-read access differs per field — see the threat model below):

- `legacySoftSkipEligible?: boolean` on `OnboardingState` (in `src/shared/types.ts`) marks rows the migration identified as pre-gate. `shouldShowOnboarding` returns `false` for these rows so the wizard is auto-suppressed rather than re-opening on the now-unskippable gate.
- `_legacySoftSkipMigrationDone?: boolean` is the one-shot discriminator. The migration in `Store.load` (in `src/main/persistence.ts`) runs only when this flag is absent. New rows created under the gate-required build are stamped `_legacySoftSkipMigrationDone: true` by `getDefaultOnboardingState` (in `src/shared/constants.ts`), so a user who closes the wizard mid-flow on this build is never marked legacy-eligible on next launch.

**Threat model: the renderer.** Both fields are gated behind an `allowInternal` parameter on `sanitizeOnboardingUpdate` (in `src/main/persistence.ts`). The load path passes `allowInternal: true` to round-trip values off disk; the IPC handler does not, so a renderer that could write `legacySoftSkipEligible: true` cannot auto-suppress the gate, and a renderer that could write `_legacySoftSkipMigrationDone: false` cannot replay the migration. On the read side, the IPC handler in `src/main/ipc/onboarding.ts` strips `_legacySoftSkipMigrationDone` from `onboarding:get` / `onboarding:update` responses (it is a pure main-only discriminator). `legacySoftSkipEligible` is intentionally left exposed because `shouldShowOnboarding` (in `src/renderer/src/components/onboarding/should-show-onboarding.ts`) reads it to drive the auto-suppression branch; the sanitizer's `allowInternal` gate is what keeps the renderer from forging it on writes.

**Why a marker, not a version gate.** A `lastSeenVersion`-based predicate would have required adding `lastSeenVersion` to `settings.json`, which doesn't exist yet. The marker approach is ~10 LOC + two schema fields, contained entirely in the onboarding state.

**Why not just accept the trap.** The asymmetry bites: one trapped SSH-only power user who upgrades mid-flow files the issue that defines the release. PostHog sizing of the affected cohort would have been the precondition for accepting the trap; the marker approach makes that sizing unnecessary.

### 4. Telemetry coverage for the gate

**Implementation.** Two new events on the existing `onboarding_step4_*` namespace, plus `'ssh'` added to `onboardingPathSchema`:

- `onboarding_step4_path_revealed { path: 'ssh' }` — the SSH CTA is currently always rendered on `RepoStep`, so first arrival on step 4 in the `'main'` substep counts as the reveal. Latched via `sshRevealedRef` in `OnboardingFlow.tsx` so the event fires once per wizard run, not on every render. Schema is `path: z.literal('ssh')` rather than the full `onboardingPathSchema` because today's only emitter hardcodes `'ssh'`; widening is one line if a future reveal of `open_folder` / `clone_url` is wanted.
- `onboarding_step4_abandoned { duration_ms?, path_revealed_ssh }` — emitted from a `beforeunload` listener inside `OnboardingFlow.tsx` via sync IPC (`trackSync`). Async fire-and-forget would be cancelled before delivery during a real shutdown. The listener is gated on `currentStep.id === 'repo'` (so completed wizards don't emit a spurious abandonment) and `onboarding.closedAt !== null` (covers the microsecond gap between `closeWith` resolving and React unmounting). Registered with `capture: true` to run before `App.tsx`'s captureAndFlush listener regardless of registration order.

**SSH path failures.** `retryRemoteAsFolder` emits `onboarding_step4_path_failed { path: 'ssh', reason: 'unknown' }` on the not-a-git-repo retry. The `'unknown'` tag (rather than `'invalid_path'`) is deliberate: this branch only runs once the original git-add already failed, and the `kind: 'folder'` retry skips the git check, so any failure here is an SSH connect drop, perm error, or disk fault — not path-shape.

**SSH path clicks.** `onboarding_step4_path_clicked { path: 'ssh' }` rides on the existing `onboardingStep4PathClickedSchema` once `'ssh'` is in `onboardingPathSchema`; no new event needed.

**What this captures, what it doesn't.** Cmd+Q, native window close, and renderer reload all fire `beforeunload`. App crashes, force-kill, and OS shutdown do not — those need a main-process recovery check on next launch (read persisted `lastCompletedStep === 3 && closedAt === null` and emit a delayed event). That recovery path is design intent only; not implemented in this PR.

**Why extend the existing namespace.** Keeps PostHog dashboards and `cohort` injection (in `src/shared/telemetry-events.ts`) working without schema-registry churn. All new events inherit the `cohort` discriminator already present on every onboarding event.

### 5. `OnboardingOutcome` narrowed to `'completed'`

**Implementation.** `OnboardingOutcome` in `src/shared/types.ts` is narrowed to the single literal `'completed'`. `OnboardingState['outcome']` is `OnboardingOutcome | null`, and new writes are `'completed'` or `null`. `useCloseWith` accepts only `outcome: 'completed'` at the type level.

**Legacy `'dismissed'` rows on disk.** The `outcome` branch of `sanitizeOnboardingUpdate` in `src/main/persistence.ts` accepts both `null` and `'dismissed'` at the parse boundary and coerces both to `null`. Pre-#1677 users who dismissed the wizard still count as "wizard closed" via `closedAt`; they just don't carry a winning outcome into the narrowed union. This keeps the type honest without breaking old data.

**Telemetry registry retained.** `onboardingDismissedSchema` and the `onboarding_dismissed` registration in `src/shared/telemetry-events.ts` are intentionally NOT removed yet. Old clients with queued events from before the upgrade need the schema to validate when they retry. Removal is a follow-up release after queued-event drain — tracked as design intent, not a current-PR todo.

**Why narrow at the type level.** Leaving the union as `'completed' | 'dismissed'` while removing every writer invites accidental resurrection. The narrowed type is the contract that the persistence layer's coercion enforces at runtime.

---

## Deferred / not implemented in this PR

### 6. Clone-failure escape

A bad URL, expired credentials, a slow/large repo, or a network blip surfaces as an inline error on `RepoStep` and that's it. The SSH CTA covers most of these users (they can pivot to remote), but a residual case remains: user with no SSH target, only repo they want is failing to clone. A "Having trouble? Open Settings" link or a back-to-previous-step affordance would close the gap. Not implemented; the SSH CTA absorbs most of the population.

### 7. Inline workspace-directory change on RepoStep

"Clone a repo" clones into `settings.workspaceDir`; the path is shown in small grey text but not editable inline. Predates the gate, but the hard gate means a user who dislikes the workspace dir can no longer say "skip, I'll do this manually later." A "Change…" link next to the workspace path would cost little. Not implemented; low value-per-user, design intent only.

### 8. Drag-and-drop folders onto RepoStep

Superset's `StartView` accepts folder drops directly; Orca's `RepoStep` does not. React `onDrop` handlers do NOT fire for OS file drops in Orca — the preload calls `e.preventDefault()` on the document root and routes via the `terminal:file-dropped-from-preload` IPC bridge. Implementation would extend `NativeDropResolution`'s target union, add a `data-native-file-drop-target='onboarding-repo-step'` marker on the drop zone, subscribe via `window.api.ui.onFileDrop` from the wizard, and route the first directory through `repos.add({ kind: 'folder' })`. Pairs naturally with `activateRepoForUser`. ~25 LOC; not implemented.

### 9. Crash-recovery telemetry for step 4

`onboarding_step4_abandoned` covers Cmd+Q and renderer reload. Crashes / force-kill / OS shutdown need a main-process recovery check on next launch (persisted `lastCompletedStep === 3 && closedAt === null && lastQuitWasClean === false` → emit a delayed `onboarding_step4_abandoned_recovered`). Design intent only; not implemented.

### 10. Empty-state home view as the gate (long-term direction)

Superset (the closest comparable Electron desktop competitor) ships a wizard for *preferences* (agent, theme, notifications) and a persistent first-project empty-state on the home view as the gate. This dissolves four classes of issue at once: modal stacking inside the wizard (the architectural note), the empty-worktree-list branch in `activateRepoForUser` (item 2), clone-fail trap (item 6), and the in-flight upgrade trap (item 3). It also matches the standard macOS app pattern. Right long-term direction; structural rewrite of the wizard's terminal step, not "the same fix, refactored." Tracked separately.

## Out of scope

- **Whether to gate at all.** Settled. This doc explains the shipped gate; it does not relitigate the decision.
- **Soft-skip with reminder.** Considered and rejected once the SSH path landed — the strongest "I want to skip" case (SSH user trapped) is gone, and the remaining "let me poke around" case is weak for a workspace-orchestrator app.
- **Empty-state home view.** See item 10 in the deferred section.
