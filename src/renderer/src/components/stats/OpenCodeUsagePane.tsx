import { useEffect } from 'react'
import { Activity, Brain, Coins, DatabaseZap, FolderKanban, Sparkles } from 'lucide-react'
import type {
  OpenCodeUsageRange,
  OpenCodeUsageScope
} from '../../../../shared/opencode-usage-types'
import { useAppStore } from '../../store'
import { ClaudeUsageLoadingState } from './ClaudeUsageLoadingState'
import { OpenCodeUsageDetails } from './OpenCodeUsageDetails'
import { StatCard } from './StatCard'
import { UsagePaneFilterControls } from './UsagePaneFilterControls'
import { UsageTrackingDisabledCard } from './UsageTrackingDisabledCard'
import { formatCost, formatTokens, formatUpdatedAt } from './usage-display-formatting'
import { translate } from '@/i18n/i18n'

const RANGE_OPTIONS: OpenCodeUsageRange[] = ['7d', '30d', '90d', 'all']
const SCOPE_OPTIONS: { value: OpenCodeUsageScope; label: string }[] = [
  {
    value: 'orca',
    get label() {
      return translate('auto.components.stats.OpenCodeUsagePane.e04c58327c', 'Orca worktrees only')
    }
  },
  {
    value: 'all',
    get label() {
      return translate(
        'auto.components.stats.OpenCodeUsagePane.144a6050e9',
        'All local OpenCode usage'
      )
    }
  }
]
const RANGE_LABELS: Record<OpenCodeUsageRange, string> = {
  get '7d'() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeLast7Days', 'Last 7 days')
  },
  get '30d'() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeLast30Days', 'Last 30 days')
  },
  get '90d'() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeLast90Days', 'Last 90 days')
  },
  get all() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeAllTime', 'All time')
  }
}

export function OpenCodeUsagePane(): React.JSX.Element {
  const scanState = useAppStore((state) => state.openCodeUsageScanState)
  const summary = useAppStore((state) => state.openCodeUsageSummary)
  const daily = useAppStore((state) => state.openCodeUsageDaily)
  const modelBreakdown = useAppStore((state) => state.openCodeUsageModelBreakdown)
  const projectBreakdown = useAppStore((state) => state.openCodeUsageProjectBreakdown)
  const recentSessions = useAppStore((state) => state.openCodeUsageRecentSessions)
  const scope = useAppStore((state) => state.openCodeUsageScope)
  const range = useAppStore((state) => state.openCodeUsageRange)
  const fetchOpenCodeUsage = useAppStore((state) => state.fetchOpenCodeUsage)
  const setOpenCodeUsageEnabled = useAppStore((state) => state.setOpenCodeUsageEnabled)
  const refreshOpenCodeUsage = useAppStore((state) => state.refreshOpenCodeUsage)
  const setOpenCodeUsageScope = useAppStore((state) => state.setOpenCodeUsageScope)
  const setOpenCodeUsageRange = useAppStore((state) => state.setOpenCodeUsageRange)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)

  useEffect(() => {
    void fetchOpenCodeUsage()
  }, [fetchOpenCodeUsage])

  const handleSetEnabled = (enabled: boolean): void => {
    recordFeatureInteraction('usage-tracking')
    void setOpenCodeUsageEnabled(enabled)
  }

  if (!scanState?.enabled) {
    return (
      <UsageTrackingDisabledCard
        title={translate(
          'auto.components.stats.OpenCodeUsagePane.bea80ceae0',
          'OpenCode Usage Tracking'
        )}
        description={translate(
          'auto.components.stats.OpenCodeUsagePane.b8b3522436',
          'Reads local OpenCode usage logs to show token, model, and session stats.'
        )}
        enableLabel={translate(
          'auto.components.stats.OpenCodeUsagePane.f04131b3be',
          'Enable OpenCode usage analytics'
        )}
        onEnable={() => handleSetEnabled(true)}
      />
    )
  }

  if (!summary && (scanState.isScanning || scanState.lastScanCompletedAt === null)) {
    return (
      <ClaudeUsageLoadingState
        title={translate(
          'auto.components.stats.OpenCodeUsagePane.bea80ceae0',
          'OpenCode Usage Tracking'
        )}
        summaryCardCount={6}
        summaryGridClassName="md:grid-cols-3"
      />
    )
  }

  const hasAnyData = summary?.hasAnyOpenCodeData ?? scanState.hasAnyOpenCodeData

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate(
              'auto.components.stats.OpenCodeUsagePane.bea80ceae0',
              'OpenCode Usage Tracking'
            )}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatUpdatedAt(scanState.lastScanCompletedAt)}
            {scanState.lastScanError
              ? translate(
                  'auto.components.stats.OpenCodeUsagePane.6cc7782458',
                  ' • Last scan error: {{value0}}',
                  { value0: scanState.lastScanError }
                )
              : ''}
          </p>
        </div>
        <UsagePaneFilterControls
          scope={scope}
          range={range}
          scopeOptions={SCOPE_OPTIONS}
          rangeOptions={RANGE_OPTIONS}
          rangeLabels={RANGE_LABELS}
          isScanning={scanState.isScanning}
          optionsLabel={translate(
            'auto.components.stats.OpenCodeUsagePane.230d6de108',
            'OpenCode usage options'
          )}
          filtersLabel={translate('auto.components.stats.OpenCodeUsagePane.01583b30aa', 'Filters')}
          scopeLabel={translate('auto.components.stats.OpenCodeUsagePane.40d283c837', 'Scope')}
          rangeLabel={translate('auto.components.stats.OpenCodeUsagePane.b5ed5c9fd0', 'Range')}
          refreshLabel={translate('auto.components.stats.OpenCodeUsagePane.603cd138dc', 'Refresh')}
          enableLabel={translate(
            'auto.components.stats.OpenCodeUsagePane.f04131b3be',
            'Enable OpenCode usage analytics'
          )}
          onScopeChange={(value) => void setOpenCodeUsageScope(value)}
          onRangeChange={(value) => void setOpenCodeUsageRange(value)}
          onRefresh={() => void refreshOpenCodeUsage()}
          onDisable={() => handleSetEnabled(false)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {SCOPE_OPTIONS.find((option) => option.value === scope)?.label} • {RANGE_LABELS[range]}
        </p>
      </div>

      {!hasAnyData ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.stats.OpenCodeUsagePane.bb6363e08c',
            'No local OpenCode usage found yet for this scope.'
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label={translate(
                'auto.components.stats.OpenCodeUsagePane.d637a892ed',
                'Input tokens'
              )}
              value={formatTokens(summary?.inputTokens ?? 0)}
              icon={<Sparkles className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.OpenCodeUsagePane.7aa4d8ce35',
                'Output tokens'
              )}
              value={formatTokens(summary?.outputTokens ?? 0)}
              icon={<Activity className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.OpenCodeUsagePane.603504ee3b',
                'Cached input'
              )}
              value={formatTokens(summary?.cachedInputTokens ?? 0)}
              icon={<DatabaseZap className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.OpenCodeUsagePane.5a65d68b77',
                'Reasoning output'
              )}
              value={formatTokens(summary?.reasoningOutputTokens ?? 0)}
              icon={<Brain className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.OpenCodeUsagePane.7e9433469a',
                'Sessions / Events'
              )}
              value={`${(summary?.sessions ?? 0).toLocaleString()} / ${(summary?.events ?? 0).toLocaleString()}`}
              icon={<FolderKanban className="size-4" />}
            />
            <StatCard
              label={translate(
                'auto.components.stats.OpenCodeUsagePane.15c34d4b08',
                'Recorded cost'
              )}
              value={formatCost(summary?.estimatedCostUsd ?? null)}
              icon={<Coins className="size-4" />}
            />
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {translate(
              'auto.components.stats.OpenCodeUsagePane.e5bb23d85e',
              'Cost comes from the local OpenCode database when the assistant message recorded one.'
            )}
          </p>

          <OpenCodeUsageDetails
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
