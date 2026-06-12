import { useEffect } from 'react'
import {
  Activity,
  Coins,
  DatabaseZap,
  FolderKanban,
  Gauge,
  Sparkles,
  Waypoints
} from 'lucide-react'
import type { ClaudeUsageRange, ClaudeUsageScope } from '../../../../shared/claude-usage-types'
import { useAppStore } from '../../store'
import { ClaudeUsageDetails } from './ClaudeUsageDetails'
import { ClaudeUsageLoadingState } from './ClaudeUsageLoadingState'
import { ShareUsageButton } from './ShareUsageButton'
import { StatCard } from './StatCard'
import { UsagePaneFilterControls } from './UsagePaneFilterControls'
import { UsageTrackingDisabledCard } from './UsageTrackingDisabledCard'
import { formatCost, formatTokens, formatUpdatedAt } from './usage-display-formatting'
import { translate } from '@/i18n/i18n'

const RANGE_OPTIONS: ClaudeUsageRange[] = ['7d', '30d', '90d', 'all']
const SCOPE_OPTIONS: { value: ClaudeUsageScope; label: string }[] = [
  {
    value: 'orca',
    get label() {
      return translate('auto.components.stats.ClaudeUsagePane.4f8368c272', 'Orca worktrees only')
    }
  },
  {
    value: 'all',
    get label() {
      return translate('auto.components.stats.ClaudeUsagePane.5ce4842c2c', 'All local Claude usage')
    }
  }
]
const RANGE_LABELS: Record<ClaudeUsageRange, string> = {
  get '7d'() {
    return translate('auto.components.stats.ClaudeUsagePane.rangeLast7Days', 'Last 7 days')
  },
  get '30d'() {
    return translate('auto.components.stats.ClaudeUsagePane.rangeLast30Days', 'Last 30 days')
  },
  get '90d'() {
    return translate('auto.components.stats.ClaudeUsagePane.rangeLast90Days', 'Last 90 days')
  },
  get all() {
    return translate('auto.components.stats.ClaudeUsagePane.rangeAllTime', 'All time')
  }
}

export function ClaudeUsagePane(): React.JSX.Element {
  const scanState = useAppStore((state) => state.claudeUsageScanState)
  const summary = useAppStore((state) => state.claudeUsageSummary)
  const daily = useAppStore((state) => state.claudeUsageDaily)
  const modelBreakdown = useAppStore((state) => state.claudeUsageModelBreakdown)
  const projectBreakdown = useAppStore((state) => state.claudeUsageProjectBreakdown)
  const recentSessions = useAppStore((state) => state.claudeUsageRecentSessions)
  const scope = useAppStore((state) => state.claudeUsageScope)
  const range = useAppStore((state) => state.claudeUsageRange)
  const fetchClaudeUsage = useAppStore((state) => state.fetchClaudeUsage)
  const setClaudeUsageEnabled = useAppStore((state) => state.setClaudeUsageEnabled)
  const refreshClaudeUsage = useAppStore((state) => state.refreshClaudeUsage)
  const setClaudeUsageScope = useAppStore((state) => state.setClaudeUsageScope)
  const setClaudeUsageRange = useAppStore((state) => state.setClaudeUsageRange)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)

  useEffect(() => {
    void fetchClaudeUsage()
  }, [fetchClaudeUsage])

  const handleSetEnabled = (enabled: boolean): void => {
    recordFeatureInteraction('usage-tracking')
    void setClaudeUsageEnabled(enabled)
  }

  if (!scanState?.enabled) {
    return (
      <UsageTrackingDisabledCard
        title={translate(
          'auto.components.stats.ClaudeUsagePane.6afacbee37',
          'Claude Usage Tracking'
        )}
        description={translate(
          'auto.components.stats.ClaudeUsagePane.0cb1a36d7d',
          'Reads local Claude usage logs to show token, model, and session stats.'
        )}
        enableLabel={translate(
          'auto.components.stats.ClaudeUsagePane.424cd50412',
          'Enable Claude usage analytics'
        )}
        onEnable={() => handleSetEnabled(true)}
      />
    )
  }

  if (!summary && (scanState.isScanning || scanState.lastScanCompletedAt === null)) {
    return <ClaudeUsageLoadingState />
  }

  const hasAnyData = summary?.hasAnyClaudeData ?? scanState.hasAnyClaudeData

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.stats.ClaudeUsagePane.6afacbee37', 'Claude Usage Tracking')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatUpdatedAt(scanState.lastScanCompletedAt)}
            {scanState.lastScanError
              ? translate(
                  'auto.components.stats.ClaudeUsagePane.2d41fd45c6',
                  ' • Last scan error: {{value0}}',
                  { value0: scanState.lastScanError }
                )
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          {summary && daily.length > 0 && (
            <ShareUsageButton provider="claude" summary={summary} daily={daily} range={range} />
          )}
          <UsagePaneFilterControls
            scope={scope}
            range={range}
            scopeOptions={SCOPE_OPTIONS}
            rangeOptions={RANGE_OPTIONS}
            rangeLabels={RANGE_LABELS}
            isScanning={scanState.isScanning}
            optionsLabel={translate(
              'auto.components.stats.ClaudeUsagePane.e9bf9fce0e',
              'Claude usage options'
            )}
            filtersLabel={translate('auto.components.stats.ClaudeUsagePane.dd29209b21', 'Filters')}
            scopeLabel={translate('auto.components.stats.ClaudeUsagePane.f61cffb9c8', 'Scope')}
            rangeLabel={translate('auto.components.stats.ClaudeUsagePane.505be9aac4', 'Range')}
            refreshLabel={translate('auto.components.stats.ClaudeUsagePane.8d18bbb771', 'Refresh')}
            enableLabel={translate(
              'auto.components.stats.ClaudeUsagePane.424cd50412',
              'Enable Claude usage analytics'
            )}
            onScopeChange={(value) => void setClaudeUsageScope(value)}
            onRangeChange={(value) => void setClaudeUsageRange(value)}
            onRefresh={() => void refreshClaudeUsage()}
            onDisable={() => handleSetEnabled(false)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {SCOPE_OPTIONS.find((option) => option.value === scope)?.label} • {RANGE_LABELS[range]}
        </p>
      </div>

      {!hasAnyData ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.stats.ClaudeUsagePane.7dde9331fd',
            'No local Claude usage found yet for this scope.'
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={translate('auto.components.stats.ClaudeUsagePane.ea71fae8fc', 'Input tokens')}
              value={formatTokens(summary?.inputTokens ?? 0)}
              icon={<Sparkles className="size-4" />}
            />
            <StatCard
              label={translate('auto.components.stats.ClaudeUsagePane.2b8a2f14aa', 'Output tokens')}
              value={formatTokens(summary?.outputTokens ?? 0)}
              icon={<Activity className="size-4" />}
            />
            <StatCard
              label={translate('auto.components.stats.ClaudeUsagePane.268cf0af51', 'Cache read')}
              value={formatTokens(summary?.cacheReadTokens ?? 0)}
              icon={<DatabaseZap className="size-4" />}
            />
            <StatCard
              label={translate('auto.components.stats.ClaudeUsagePane.b786fb4a70', 'Cache write')}
              value={formatTokens(summary?.cacheWriteTokens ?? 0)}
              icon={<Waypoints className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.ClaudeUsagePane.1634c4f404',
                'Cache reuse rate'
              )}
              value={
                summary?.cacheReuseRate !== null && summary?.cacheReuseRate !== undefined
                  ? `${Math.round(summary.cacheReuseRate * 100)}%`
                  : 'n/a'
              }
              icon={<Gauge className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.ClaudeUsagePane.8cc23be4a3',
                'Zero-cache-read turns'
              )}
              value={
                summary && summary.turns > 0
                  ? `${Math.round((summary.zeroCacheReadTurns / summary.turns) * 100)}%`
                  : 'n/a'
              }
              icon={<DatabaseZap className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.ClaudeUsagePane.0f3e696ca9',
                'Sessions / Turns'
              )}
              value={`${(summary?.sessions ?? 0).toLocaleString()} / ${(summary?.turns ?? 0).toLocaleString()}`}
              icon={<FolderKanban className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.ClaudeUsagePane.b26d4ddb58',
                'Est. API-equivalent cost'
              )}
              value={formatCost(summary?.estimatedCostUsd ?? null)}
              icon={<Coins className="size-4" />}
            />
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {translate(
              'auto.components.stats.ClaudeUsagePane.51ae85fa00',
              'Cache reuse rate is calculated as cache read tokens / (input tokens + cache read tokens).'
            )}
          </p>

          <ClaudeUsageDetails
            daily={daily}
            modelBreakdown={modelBreakdown}
            projectBreakdown={projectBreakdown}
            recentSessions={recentSessions}
            summary={summary}
          />
        </>
      )}
    </div>
  )
}
