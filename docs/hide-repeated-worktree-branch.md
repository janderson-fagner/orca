# Restore Compact Worktree Cards

## Problem

The worktree sidebar regressed to the pre-compact card layout for default users even though the compact-card behavior from PR #2843 is the desired baseline.

- `src/renderer/src/components/sidebar/WorktreeCard.tsx:186` derives the rendered branch label.
- `src/renderer/src/components/sidebar/WorktreeCard.tsx:190` only hid the repeated branch when `experimentalCompactWorktreeCards` was enabled, and only on a raw exact match.
- `src/renderer/src/components/sidebar/WorktreeCard.tsx:563` kept the metadata row mounted whenever compact cards were disabled, so a duplicate branch could leave an otherwise-empty row.
- `src/renderer/src/components/sidebar/WorktreeCard.tsx:565` through the title-row metadata flags gated the unread/title-row indicators, primary star, and PR/ports title-row placement behind the same setting.
- `src/renderer/src/components/settings/ExperimentalPane.tsx:160` exposed the compact layout as an experimental toggle even though the product decision is to make it baseline.
- `src/renderer/src/components/sidebar/WorktreeList.tsx:2887` renders nested lineage child branch text directly, bypassing `WorktreeCard`.
- `src/renderer/src/components/sidebar/WorktreeCard.quick-actions.test.tsx:142` currently asserts the old default behavior: duplicate branch rows remain visible unless compact cards are enabled.

## Root Cause

PR #2843 landed the compact card treatment, then PR #3021 added `experimentalCompactWorktreeCards` as a default-off gate and restored the old two-line layout when that gate was disabled. Existing profiles can persist the disabled value, so flipping a default alone would not restore the desired behavior. The nested lineage-child renderer also never adopted the duplicate-branch rule.

## Non-goals

- Do not rename workspaces, branches, or persisted metadata.
- Do not change folder workspace badges.
- Do not change the meaning of PR, issue, Linear, comment, port, cache, conflict, SSH, unread, primary, sparse, or inline-agent metadata.
- Do not change grouping, sorting, virtualized row measurement, or drag behavior.
- Do not add a new replacement setting for the old compact-card gate.

## Design

1. Keep `branchDisplayName` as the `refs/heads/` display normalizer, and add `shouldShowWorktreeBranchLabel(branchLabel, workspaceTitle)` in `WorktreeCardHelpers.tsx`.
   - Input: the already display-normalized branch label and the workspace display name.
   - Trim both inputs for comparison only.
   - Return `false` for blank branch labels and exact trimmed matches.
   - Return `true` for different names, including case-only differences and custom human titles.
   - Do not mutate, persist, or globally replace either label with the trimmed value.
2. Use the helper in `WorktreeCard.tsx`.
   - `showBranch` becomes `!isFolder && shouldShowWorktreeBranchLabel(branch, worktree.displayName)`.
   - Keep `branch` as the existing display-normalized string for cache keys and fetch inputs. Do not use `showBranch` to gate `hostedReviewCacheKey`, issue keys, Linear keys, or fetch effects.
   - The left status column contains only the status dot. The unread toggle lives in the title-row action cluster.
   - Primary worktrees use the title-row star, not the old `primary` pill.
   - PR, issue, Linear, comment, and port details stay in the title-row details trigger so they do not strand an otherwise-empty metadata row.
   - `hasMetaRow` should mount only for visible metadata content: repo badge, folder badge, conflict badge, visible branch, or cache timer.
3. Remove the experimental compact-card setting surface.
   - Stop reading `experimentalCompactWorktreeCards` in `WorktreeCard`; persisted false values must not restore the old layout.
   - Remove the toggle and settings search entry from the Experimental pane.
   - Remove the default/type field, leaving old persisted keys inert through the existing settings spread.
   - Delete the now-obsolete `docs/experimental-compact-worktree-cards.md`.
4. Use the same helper in the nested lineage child renderer in `WorktreeList.tsx`.
   - Compute `childBranchLabel` once from `branchDisplayName(child.worktree.branch)`.
   - Compute `showChildRepoBadge` from the existing rule: `Boolean(child.repo && groupBy !== 'repo')`.
   - Hide the branch span when `shouldShowWorktreeBranchLabel(childBranchLabel, child.worktree.displayName)` is false.
   - Hide only the child repo/branch row when both `showChildRepoBadge` and the visible branch are absent. The separate linked issue/comment row must keep its current behavior.
   - Do not add new folder badges or change repo badge grouping behavior in this lightweight renderer.
5. Update tests.
   - Add direct coverage for `branchDisplayName` handling `refs/heads/...`.
   - Add direct `shouldShowWorktreeBranchLabel` coverage for already-normalized blank labels, trim-only matches, case-only differences, and custom titles.
   - Replace the default-behavior assertion that duplicate branch rows remain visible.
   - Cover duplicate suppression even when stale settings still contain `experimentalCompactWorktreeCards: false`.
   - Cover custom titles still showing branch labels.
   - Update unread/primary assertions so unread and primary are in the title row by default.
   - Cover details or ports remaining visible after a duplicate branch is hidden.
   - Add lineage-child regressions for duplicate suppression when grouped by repo, custom titles still showing the branch, and repo badges still preserving the child metadata row outside repo grouping.
   - Cover removal of the Experimental pane toggle/search entry and the obsolete default-settings field.
   - Do not prove suppression with a raw substring check for the duplicated name; the workspace title still renders. Assert the branch span or metadata-row marker instead.

## Consistency

This is pure renderer derivation from the current `worktree.branch`, `worktree.displayName`, `repo`, card property, and cache state. It adds no IPC, no filesystem access, no persisted metadata changes, and no extra cache invalidation path. Do not store or memoize the hidden/shown result outside render; multi-window updates, external git branch changes, title renames, and SSH reconnect/disconnect states continue through the existing store refreshes and re-render the derived visibility. Old persisted `experimentalCompactWorktreeCards` values become inert because the renderer and settings UI no longer read them.

## Edge Cases

- Branch stored as `refs/heads/foo` and display name `foo`: hide the branch.
- Branch `foo` and display name ` foo `: hide the branch.
- Branch `refs/heads/`, detached HEAD, or any empty branch label: hide the branch span.
- Branch `foo` and display name `Foo`: show the branch, preserving case-sensitive custom title intent.
- Empty branch labels: do not render an empty branch row.
- Folder repositories: continue showing the folder badge, not branch text.
- Cards with repo badges, conflict badges, or cache timers still render their metadata row.
- Cards with details or ports still expose those details from the title-row trigger after the branch row is hidden.
- Nested lineage child cards preserve repo badges when grouped outside repo mode; when grouped by repo, a duplicate branch can remove the child repo/branch row entirely.
- Existing profiles with `experimentalCompactWorktreeCards: false` still get compact cards because the setting is no longer read.
- SSH-backed repos use the same renderer inputs, so no local-path or provider-specific assumptions are introduced.

## Rollout

1. Implement and export the branch visibility helper in `WorktreeCardHelpers.tsx`.
2. Update `WorktreeCard.tsx` to make compact card layout baseline and use visible-content metadata-row gating.
3. Remove the obsolete Experimental setting surface, default field, type field, and docs.
4. Update `WorktreeList.tsx` nested lineage child rendering to use the helper.
5. Update focused sidebar/settings tests and run:
   - `pnpm test src/renderer/src/components/sidebar/WorktreeCard.quick-actions.test.tsx src/renderer/src/components/sidebar/WorktreeList.lineage-child-card.test.ts src/renderer/src/components/settings/ExperimentalPane.test.tsx src/shared/constants.test.ts`
6. Run `pnpm typecheck` and `pnpm lint`.
