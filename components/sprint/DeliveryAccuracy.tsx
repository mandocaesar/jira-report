'use client';

// Check-view enrichment (UX Phase 1): completion + cycle KPIs and the
// task-accuracy lens, pulled from the existing /api/sprint-performance
// response — no new math, display only.

import { useFetch } from '@/hooks/useFetch';

interface AccuracyRollup {
    totalSp: number;
    totalExpectedHours: number;
    totalLoggedHours: number;
    ratio: number | null;
    issueCount: number;
    issuesWithData: number;
}

interface WorstIssue {
    key: string;
    summary: string;
    assigneeName: string | null;
    sp: number;
    expectedHours: number;
    loggedHours: number | null;
    ratio: number | null;
}

interface PerfResponse {
    kpis: { completionRate: number; avgCycleTime: number | null; medianCycleTime: number | null };
    accuracy: { team: AccuracyRollup; worstIssues: WorstIssue[] } | null;
    jiraDomain: string;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="p-3 bg-muted/20 border border-border rounded-lg">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

export default function DeliveryAccuracy({ boardId, sprintId }: { boardId: number; sprintId: number }) {
    const { data, loading, error } = useFetch<PerfResponse>(
        `/api/sprint-performance?sprintId=${sprintId}&boardId=${boardId}`,
    );

    if (loading) return <div className="animate-pulse bg-muted/40 rounded-lg h-28" role="status" aria-label="Loading delivery metrics" />;
    if (error || !data) return <p className="text-sm text-muted-foreground">Delivery metrics unavailable{error ? ` — ${error}` : ''}.</p>;

    const { kpis, accuracy, jiraDomain } = data;
    const team = accuracy?.team;
    const worst = (accuracy?.worstIssues ?? []).slice(0, 5);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Completion rate" value={`${kpis.completionRate.toFixed(1)}%`} />
                <Stat label="Avg cycle time" value={kpis.avgCycleTime !== null ? `${kpis.avgCycleTime.toFixed(1)} d` : '—'} />
                <Stat label="Median cycle time" value={kpis.medianCycleTime !== null ? `${kpis.medianCycleTime.toFixed(1)} d` : '—'} />
                <Stat
                    label="Task accuracy"
                    value={team?.ratio !== null && team !== undefined ? `${team.ratio.toFixed(2)}×` : '—'}
                    sub={team ? `${team.totalLoggedHours.toFixed(0)}h logged / ${team.totalExpectedHours.toFixed(0)}h expected (${team.issuesWithData} tasks)` : 'no worklog data'}
                />
            </div>
            {worst.length > 0 && (
                <div>
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Worst estimated tasks <span className="normal-case font-normal">(logged vs SP × 6h)</span>
                    </h4>
                    <div className="border border-border rounded-lg divide-y divide-border">
                        {worst.map(w => (
                            <div key={w.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <a
                                    href={`https://${jiraDomain}/browse/${w.key}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-400 hover:underline shrink-0 py-1"
                                >
                                    {w.key}
                                </a>
                                <span className="truncate text-foreground/80 flex-1">{w.summary}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{w.assigneeName ?? '—'}</span>
                                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{w.sp} SP · {w.loggedHours?.toFixed(0)}h/{w.expectedHours.toFixed(0)}h</span>
                                <span className={`text-xs font-bold shrink-0 tabular-nums ${w.ratio !== null && w.ratio > 1.5 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {w.ratio?.toFixed(1)}×
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
