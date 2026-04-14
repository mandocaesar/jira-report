'use client';

import { useState } from 'react';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';
import CollapsibleSection from '@/components/CollapsibleSection';
import { useFetch } from '@/hooks/useFetch';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIData {
  committedHours: number;
  loggedHours: number;
  capacityHours: number;
  plannedUtilisation: number;
  executionUtilisation: number;
  execVsCommitment: number;
  completionRate: number;
  spPerHour: number;
  avgVelocity: number;
  avgCycleTime: number | null;
  medianCycleTime: number | null;
}

interface VelocityData {
  committedPoints: number;
  actualPoints: number;
  totalPoints: number;
  addedMidSprintPoints: number;
  addedMidSprintCount: number;
  commitmentAccuracy: number;
}

interface CapacityData {
  sprintWorkingDays: number;
  totalCapacityHours: number;
  totalAvailableHours: number;
  totalEffectiveMandays: number;
  teamStandardHours: number;
}

interface EngineerMetric {
  accountId: string;
  name: string;
  role: 'qa' | 'engineer';
  title: string;
  avatarUrl: string;
  storyPoints: number;
  availableHours: number;
  allocatedHours: number;
  loggedHours: number;
  capacityPercent: number;
  effectiveMandays: number;
  plannedUtilisation: number;
  executionUtilisation: number;
  completedIssues: number;
  committedIssues: number;
  completionRate: number;
  cycleTimeAvg: number | null;
  leadTimeAvg: number | null;
}

interface NonDevDay {
  date: string;
  reason: string | null;
}

interface Allocation {
  memberName: string;
  type: string;
  capacityPercent: number;
  startDate: string;
  endDate: string;
}

interface SprintPerfResponse {
  sprint: { id: number; name: string; state: string; startDate: string; endDate: string };
  kpis: KPIData;
  velocity: VelocityData;
  capacity: CapacityData | null;
  engineerMetrics: EngineerMetric[];
  nonDevDays: NonDevDay[];
  allocations: Allocation[];
  jiraDomain: string;
}

interface HistoryRow {
  sprintId: number;
  name: string;
  state: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  committedPoints: number;
  actualPoints: number;
  addedMidSprint: number;
  commitmentAccuracy: number;
  capacityHours: number;
  committedHours: number;
  loggedHours: number;
  plannedUtilisation: number;
  executionUtilisation: number;
  completionRate: number;
  avgCycleTime: number | null;
  totalIssues: number;
  completedIssues: number;
  memberCount: number;
}

// ─── Helper Components ─────────────────────────────────────────────────────────

function KPIStatusBadge({ value }: { value: number }) {
  let color = 'bg-red-500/20 text-red-400';
  if (value >= 90) color = 'bg-emerald-500/20 text-emerald-400';
  else if (value >= 75) color = 'bg-yellow-500/20 text-yellow-400';
  else if (value >= 50) color = 'bg-orange-500/20 text-orange-400';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{value.toFixed(1)}%</span>;
}

function KPICard({ label, value, unit, subtitle, status }: { label: string; value: string; unit?: string; subtitle?: string; status?: number }) {
  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        {status !== undefined && <KPIStatusBadge value={status} />}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/50 rounded-lg ${className}`} />;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SprintPerformancePage() {
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'report' | 'history'>('report');

  const sprintUrl = (selectedBoardId && selectedSprintId && activeTab === 'report')
    ? `/api/sprint-performance?sprintId=${selectedSprintId}&boardId=${selectedBoardId}`
    : null;
  const { data, loading, error } = useFetch<SprintPerfResponse>(sprintUrl);

  const historyUrl = (selectedBoardId && activeTab === 'history')
    ? `/api/sprint-performance/history?boardId=${selectedBoardId}&maxSprints=15`
    : null;
  const { data: historyResult, loading: historyLoading } = useFetch<{ history: HistoryRow[] }>(historyUrl);
  const historyData = historyResult?.history || [];

  const handleBoardChange = (boardId: number | null) => {
    setSelectedBoardId(boardId);
    setSelectedSprintId(null);
  };

  // ─── Export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (activeTab === 'history' && historyData.length > 0) {
      const headers = ['Sprint', 'Start', 'End', 'Working Days', 'Committed SP', 'Actual SP', 'Accuracy %', 'Capacity Hrs', 'Committed Hrs', 'Logged Hrs', 'Planned Util %', 'Exec Util %', 'Completion %', 'Avg Cycle Time', 'Issues', 'Completed', 'Members'];
      const rows = historyData.map(r => [
        r.name, r.startDate.split('T')[0], r.endDate.split('T')[0], r.workingDays,
        r.committedPoints, r.actualPoints, r.commitmentAccuracy, r.capacityHours.toFixed(1),
        r.committedHours.toFixed(1), r.loggedHours.toFixed(1), r.plannedUtilisation.toFixed(1),
        r.executionUtilisation.toFixed(1), r.completionRate.toFixed(1),
        r.avgCycleTime?.toFixed(1) ?? '', r.totalIssues, r.completedIssues, r.memberCount,
      ]);
      downloadCSV('sprint-history.csv', headers, rows);
    } else if (activeTab === 'report' && data?.engineerMetrics.length) {
      const headers = ['Name', 'Role', 'Title', 'SP', 'Available Hrs', 'Allocated Hrs', 'Logged Hrs', 'Capacity %', 'Planned Util %', 'Exec Util %', 'Completion %', 'Cycle Time', 'Lead Time'];
      const rows = data.engineerMetrics.map(e => [
        e.name, e.role, e.title, e.storyPoints, e.availableHours.toFixed(1),
        e.allocatedHours.toFixed(1), e.loggedHours.toFixed(1), e.capacityPercent,
        e.plannedUtilisation.toFixed(1), e.executionUtilisation.toFixed(1),
        e.completionRate.toFixed(1), e.cycleTimeAvg?.toFixed(1) ?? '', e.leadTimeAvg?.toFixed(1) ?? '',
      ]);
      downloadCSV(`sprint-report-${data.sprint.name.replace(/\s+/g, '-')}.csv`, headers, rows);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sprint Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">Detailed sprint metrics, capacity, and team performance</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={activeTab === 'report' ? !data : historyData.length === 0}
          className="px-4 py-2 bg-muted border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export CSV
        </button>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BoardSelector onBoardChange={handleBoardChange} selectedBoardId={selectedBoardId} />
        {activeTab === 'report' && (
          <SprintSelector onSprintChange={setSelectedSprintId} selectedSprintId={selectedSprintId} boardId={selectedBoardId} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['report', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'report' ? 'Sprint Report' : 'History'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'report' ? (
        <ReportTab
          data={data}
          loading={loading}
          error={error}
          selectedBoardId={selectedBoardId}
          selectedSprintId={selectedSprintId}
        />
      ) : (
        <HistoryTab data={historyData} loading={historyLoading} boardId={selectedBoardId} />
      )}
    </div>
  );
}

// ─── Report Tab ────────────────────────────────────────────────────────────────

function ReportTab({ data, loading, error, selectedBoardId, selectedSprintId }: {
  data: SprintPerfResponse | null;
  loading: boolean;
  error: string | null;
  selectedBoardId: number | null;
  selectedSprintId: number | null;
}) {
  if (!selectedBoardId || !selectedSprintId) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <p>Select a board and sprint to view performance data</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
        <p className="font-medium">Error loading sprint data</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, velocity, capacity, engineerMetrics, sprint, nonDevDays, allocations } = data;

  return (
    <div className="space-y-6">
      {/* Sprint Overview Header */}
      <div className="bg-muted/20 border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-lg font-bold text-foreground">{sprint.name}</h2>
          <p className="text-sm text-muted-foreground">
            {new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
            {new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div><span className="text-muted-foreground">State:</span>{' '}
            <span className={`font-medium ${sprint.state === 'active' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
              {sprint.state.charAt(0).toUpperCase() + sprint.state.slice(1)}
            </span>
          </div>
          {capacity && (
            <>
              <div><span className="text-muted-foreground">Working Days:</span> <span className="font-medium text-foreground">{capacity.sprintWorkingDays}</span></div>
              <div><span className="text-muted-foreground">Capacity:</span> <span className="font-medium text-foreground">{capacity.totalCapacityHours.toFixed(0)}h</span></div>
            </>
          )}
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Planned Utilisation" value={kpis.plannedUtilisation.toFixed(1)} unit="%" status={kpis.plannedUtilisation} subtitle={`${kpis.committedHours.toFixed(0)}h / ${kpis.capacityHours.toFixed(0)}h`} />
        <KPICard label="Execution Utilisation" value={kpis.executionUtilisation.toFixed(1)} unit="%" status={kpis.executionUtilisation} subtitle={`${kpis.loggedHours.toFixed(0)}h / ${kpis.capacityHours.toFixed(0)}h`} />
        <KPICard label="Exec vs Commitment" value={kpis.execVsCommitment.toFixed(1)} unit="%" status={kpis.execVsCommitment} subtitle={`${kpis.loggedHours.toFixed(0)}h / ${kpis.committedHours.toFixed(0)}h`} />
        <KPICard label="Completion Rate" value={kpis.completionRate.toFixed(1)} unit="%" status={kpis.completionRate} />
        <KPICard label="SP per Hour" value={kpis.spPerHour.toFixed(2)} subtitle={`${velocity.committedPoints} SP committed`} />
        <KPICard label="Velocity" value={String(velocity.actualPoints)} unit="SP" subtitle={`${velocity.committedPoints} committed, ${velocity.commitmentAccuracy}% accuracy`} />
        <KPICard label="Avg Cycle Time" value={kpis.avgCycleTime?.toFixed(1) ?? '—'} unit="days" />
        <KPICard label="Median Cycle Time" value={kpis.medianCycleTime?.toFixed(1) ?? '—'} unit="days" />
      </div>

      {/* Totals Row */}
      <CollapsibleSection title="Totals & Velocity" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <Stat label="Committed SP" value={velocity.committedPoints} />
          <Stat label="Actual SP" value={velocity.actualPoints} />
          <Stat label="Added Mid-Sprint" value={`${velocity.addedMidSprintPoints} SP (${velocity.addedMidSprintCount} issues)`} />
          <Stat label="Total SP" value={velocity.totalPoints} />
          <Stat label="Commitment Accuracy" value={`${velocity.commitmentAccuracy}%`} />
          {capacity && <Stat label="Effective Mandays" value={capacity.totalEffectiveMandays.toFixed(1)} />}
        </div>
      </CollapsibleSection>

      {/* Non-Dev Days */}
      {nonDevDays.length > 0 && (
        <CollapsibleSection title={`Non-Dev Days (${nonDevDays.length})`} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nonDevDays.map((nd, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-lg">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">{new Date(nd.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <p className="text-xs text-muted-foreground">{nd.reason || 'No reason specified'}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Capacity Allocations */}
      {allocations.length > 0 && (
        <CollapsibleSection title={`Capacity Allocations (${allocations.length})`} defaultOpen={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4">Member</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Capacity</th>
                  <th className="pb-2 pr-4">Period</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">{a.memberName}</td>
                    <td className="py-2 pr-4"><span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">{a.type}</span></td>
                    <td className="py-2 pr-4">{a.capacityPercent}%</td>
                    <td className="py-2 pr-4 text-muted-foreground">{a.startDate} → {a.endDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* Engineer Metrics Table */}
      <CollapsibleSection title="Engineer Metrics">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="pb-2 pr-3">Engineer</th>
                <th className="pb-2 pr-3 text-right">SP</th>
                <th className="pb-2 pr-3 text-right">Alloc Hrs</th>
                <th className="pb-2 pr-3 text-right">Logged Hrs</th>
                <th className="pb-2 pr-3 text-right">Cap %</th>
                <th className="pb-2 pr-3 text-right">Plan Util</th>
                <th className="pb-2 pr-3 text-right">Exec Util</th>
                <th className="pb-2 pr-3 text-right">Completion</th>
                <th className="pb-2 pr-3 text-right">Cycle</th>
                <th className="pb-2 text-right">Lead</th>
              </tr>
            </thead>
            <tbody>
              {engineerMetrics.map(e => (
                <tr key={e.accountId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      {e.avatarUrl ? (
                        <img src={e.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{e.name.charAt(0)}</div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.title} · {e.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium">{e.storyPoints}</td>
                  <td className="py-2.5 pr-3 text-right">{e.allocatedHours.toFixed(1)}</td>
                  <td className="py-2.5 pr-3 text-right">{e.loggedHours.toFixed(1)}</td>
                  <td className="py-2.5 pr-3 text-right">{e.capacityPercent}%</td>
                  <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={e.plannedUtilisation} /></td>
                  <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={e.executionUtilisation} /></td>
                  <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={e.completionRate} /></td>
                  <td className="py-2.5 pr-3 text-right text-muted-foreground">{e.cycleTimeAvg?.toFixed(1) ?? '—'}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{e.leadTimeAvg?.toFixed(1) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ data, loading, boardId }: { data: HistoryRow[]; loading: boolean; boardId: number | null }) {
  const [sortField, setSortField] = useState<keyof HistoryRow>('startDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (!boardId) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Select a board to view sprint history</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>No sprint history found</p>
      </div>
    );
  }

  const toggleSort = (field: keyof HistoryRow) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ field, label }: { field: keyof HistoryRow; label: string }) => (
    <th
      onClick={() => toggleSort(field)}
      className="pb-2 pr-3 text-right cursor-pointer hover:text-foreground transition-colors select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && <span className="text-purple-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border text-xs uppercase tracking-wider">
            <th className="pb-2 pr-3 cursor-pointer" onClick={() => toggleSort('name')}>
              Sprint {sortField === 'name' && <span className="text-purple-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </th>
            <SortHeader field="startDate" label="Period" />
            <SortHeader field="workingDays" label="Days" />
            <SortHeader field="committedPoints" label="Commit" />
            <SortHeader field="actualPoints" label="Actual" />
            <SortHeader field="commitmentAccuracy" label="Accuracy" />
            <SortHeader field="plannedUtilisation" label="Plan Util" />
            <SortHeader field="executionUtilisation" label="Exec Util" />
            <SortHeader field="completionRate" label="Compl" />
            <SortHeader field="avgCycleTime" label="Cycle" />
            <SortHeader field="memberCount" label="Team" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={row.sprintId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <td className="py-2.5 pr-3 font-medium text-foreground max-w-[200px] truncate">{row.name}</td>
              <td className="py-2.5 pr-3 text-right text-muted-foreground whitespace-nowrap">
                {new Date(row.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(row.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
              <td className="py-2.5 pr-3 text-right">{row.workingDays}</td>
              <td className="py-2.5 pr-3 text-right">{row.committedPoints}</td>
              <td className="py-2.5 pr-3 text-right font-medium">{row.actualPoints}</td>
              <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.commitmentAccuracy} /></td>
              <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.plannedUtilisation} /></td>
              <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.executionUtilisation} /></td>
              <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.completionRate} /></td>
              <td className="py-2.5 pr-3 text-right text-muted-foreground">{row.avgCycleTime?.toFixed(1) ?? '—'}</td>
              <td className="py-2.5 text-right">{row.memberCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 bg-muted/20 border border-border rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
