'use client';

import { useState, useEffect, useMemo } from 'react';
import BoardSelector from '@/components/BoardSelector';
import { SprintVelocityData, SprintVelocityEntry } from '@/types';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

function shortSprintLabel(name: string): string {
    const m = name.match(/(\d+)$/);
    return m ? `S${m[1]}` : name.slice(-6);
}

function accuracyColor(pct: number): string {
    if (pct >= 80) return 'text-green-400';
    if (pct >= 60) return 'text-yellow-400';
    return 'text-red-400';
}

function CommitLegend({ payload }: { payload?: Array<{ type: string; color: string; value: string }> }) {
    if (!payload) return null;
    return (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2 text-[11px]">
            {payload.map((entry) => {
                const isLine = entry.type === 'line';
                return (
                    <div key={entry.value} className="flex items-center gap-1.5">
                        {isLine ? (
                            <>
                                <svg width="20" height="10" className="flex-shrink-0">
                                    <line x1="0" y1="5" x2="20" y2="5" stroke={entry.color} strokeWidth={2} />
                                    <circle cx="10" cy="5" r="3" fill={entry.color} />
                                </svg>
                                <span style={{ color: entry.color }} className="font-medium">{entry.value}</span>
                            </>
                        ) : (
                            <>
                                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                <span style={{ color: entry.color }} className="font-medium">{entry.value}</span>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function VelocityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; color: string; value: number; payload: { fullName?: string } }>; label?: string }) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl min-w-[180px]">
            <p className="font-bold text-foreground mb-2">{d?.fullName || label}</p>
            <div className="space-y-1">
                {payload.map((p) => (
                    <div key={p.name} className="flex justify-between gap-4">
                        <span style={{ color: p.color }}>{p.name}</span>
                        <span className="font-semibold tabular-nums">{p.value ?? '—'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface VelocityOverviewProps {
    boardId?: number | null;
}

export default function VelocityOverview({ boardId }: VelocityOverviewProps) {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(boardId ?? null);
    const [velocityData, setVelocityData] = useState<SprintVelocityData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync external boardId prop
    useEffect(() => {
        if (boardId !== undefined) setSelectedBoardId(boardId ?? null);
    }, [boardId]);

    useEffect(() => {
        if (!selectedBoardId) {
            setVelocityData(null);
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`/api/planning/sprint-velocity?boardId=${selectedBoardId}&count=6`)
            .then(r => r.json())
            .then(json => {
                if (json.success) setVelocityData(json.data);
                else setError(json.error || 'Unknown error');
            })
            .catch(() => setError('Failed to fetch velocity data'))
            .finally(() => setLoading(false));
    }, [selectedBoardId]);

    const sprints = velocityData?.sprints || [];

    const summary = useMemo(() => {
        if (!sprints.length) return null;
        const n = sprints.length;
        return {
            avgCommitted: Math.round(sprints.reduce((s, e) => s + e.committedPoints, 0) / n),
            avgActual: Math.round(sprints.reduce((s, e) => s + e.actualPoints, 0) / n),
            avgAccuracy: Math.round(sprints.reduce((s, e) => s + e.commitmentAccuracy, 0) / n),
        };
    }, [sprints]);

    const chartData = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        committed: e.committedPoints,
        actual: e.actualPoints,
        accuracy: e.commitmentAccuracy,
    })), [sprints]);

    const pctDomain = useMemo(() => {
        if (!sprints.length) return [0, 150] as [number, number];
        const maxAcc = Math.max(...sprints.map(e => e.commitmentAccuracy));
        return [0, Math.max(150, Math.ceil(maxAcc / 20) * 20 + 20)] as [number, number];
    }, [sprints]);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeLinecap="round" strokeLinejoin="round" />
                            <polyline points="17 6 23 6 23 12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Velocity Overview</h2>
                        <p className="text-sm text-muted-foreground">Last 6 sprints · committed vs delivered</p>
                    </div>
                </div>

                {/* Board selector if not passed as prop */}
                {boardId === undefined && (
                    <div className="min-w-[200px]">
                        <BoardSelector
                            selectedBoardId={selectedBoardId}
                            onBoardChange={setSelectedBoardId}
                        />
                    </div>
                )}
            </div>

            {loading && (
                <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Loading velocity...</span>
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            {!loading && !error && !selectedBoardId && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                    Select a board to view velocity data
                </div>
            )}

            {!loading && !error && sprints.length > 0 && (
                <div className="space-y-4">
                    {/* Mini KPI row */}
                    {summary && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-muted/30 rounded-lg border border-border p-3">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Committed</p>
                                <p className="text-lg font-bold text-indigo-400 mt-0.5">{summary.avgCommitted} <span className="text-xs text-muted-foreground font-normal">pts</span></p>
                            </div>
                            <div className="bg-muted/30 rounded-lg border border-border p-3">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Delivered</p>
                                <p className="text-lg font-bold text-emerald-400 mt-0.5">{summary.avgActual} <span className="text-xs text-muted-foreground font-normal">pts</span></p>
                            </div>
                            <div className="bg-muted/30 rounded-lg border border-border p-3">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Accuracy</p>
                                <p className={`text-lg font-bold mt-0.5 ${accuracyColor(summary.avgAccuracy)}`}>{summary.avgAccuracy}%</p>
                            </div>
                        </div>
                    )}

                    {/* Committed vs Actual chart */}
                    <div className="bg-card border border-border rounded-xl p-4">
                        <ResponsiveContainer width="100%" height={240}>
                            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis yAxisId="pts" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis yAxisId="pct" orientation="right" domain={pctDomain} tickFormatter={(v: number) => `${v}%`}
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip content={<VelocityTooltip />} />
                                <Legend content={<CommitLegend />} />
                                <Bar yAxisId="pts" dataKey="committed" name="Committed" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                <Bar yAxisId="pts" dataKey="actual" name="Delivered" fill="#10b981" radius={[3, 3, 0, 0]} />
                                <Line yAxisId="pct" type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#c084fc"
                                    strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                <ReferenceLine yAxisId="pct" y={80} stroke="#4ade80" strokeDasharray="4 4" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}
