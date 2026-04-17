'use client';

import { useState, useMemo } from 'react';
import { SquadOverview } from '@/types';
import { useFetch } from '@/hooks/useFetch';

type RankingMetric = 'velocity' | 'accuracy' | 'completion' | 'composite';

interface ScorecardSquad {
    id: string;
    name: string;
    velocity: number;
    accuracy: number;
    completion: number;
    compositeScore: number;
    engineerCount: number;
    qaCount: number;
    trend: 'up' | 'down' | 'stable';
}

function computeComposite(velocity: number, accuracy: number, completion: number, maxVelocity: number): number {
    // Weighted average: velocity (normalized) 40%, accuracy 35%, completion 25%
    const normVelocity = maxVelocity > 0 ? (velocity / maxVelocity) * 100 : 0;
    return Math.round(normVelocity * 0.4 + accuracy * 0.35 + completion * 0.25);
}

function metricLabel(metric: RankingMetric): string {
    return { velocity: 'Velocity', accuracy: 'Accuracy', completion: 'Completion', composite: 'Composite Score' }[metric];
}

function metricValue(squad: ScorecardSquad, metric: RankingMetric): string {
    switch (metric) {
        case 'velocity': return `${squad.velocity} pts`;
        case 'accuracy': return `${squad.accuracy}%`;
        case 'completion': return `${squad.completion}%`;
        case 'composite': return `${squad.compositeScore}`;
    }
}

function metricColor(squad: ScorecardSquad, metric: RankingMetric): string {
    const val = metric === 'velocity' ? 100 : // velocity always uses composite color
        metric === 'accuracy' ? squad.accuracy :
        metric === 'completion' ? squad.completion :
        squad.compositeScore;
    if (val >= 80) return 'text-green-400';
    if (val >= 60) return 'text-yellow-400';
    return 'text-red-400';
}

function trendIcon(trend: 'up' | 'down' | 'stable') {
    if (trend === 'up') return <span className="text-green-500 text-xs">▲</span>;
    if (trend === 'down') return <span className="text-red-500 text-xs">▼</span>;
    return <span className="text-muted-foreground text-xs">━</span>;
}

export default function TeamScorecard() {
    const { data: squads, loading } = useFetch<SquadOverview[]>('/api/squads', { ttl: 5 * 60_000 });
    const [rankBy, setRankBy] = useState<RankingMetric>('composite');

    const scorecardData = useMemo((): ScorecardSquad[] => {
        if (!squads || squads.length === 0) return [];

        const mapped = squads.map(s => ({
            id: s.id,
            name: s.name,
            velocity: s.recentVelocity?.avgActual ?? 0,
            accuracy: s.recentVelocity?.avgAccuracy ?? 0,
            completion: s.currentSprint?.completionPercent ?? 0,
            compositeScore: 0,
            engineerCount: s.engineerCount,
            qaCount: s.qaCount,
            trend: s.recentVelocity?.trend ?? 'stable',
        }));

        const maxVelocity = Math.max(...mapped.map(m => m.velocity), 1);
        return mapped.map(m => ({
            ...m,
            compositeScore: computeComposite(m.velocity, m.accuracy, m.completion, maxVelocity),
        }));
    }, [squads]);

    const { top3, bottom3, averages } = useMemo(() => {
        if (scorecardData.length === 0) return { top3: [], bottom3: [], averages: null };

        const sorted = [...scorecardData].sort((a, b) => {
            const valA = rankBy === 'velocity' ? a.velocity : rankBy === 'accuracy' ? a.accuracy : rankBy === 'completion' ? a.completion : a.compositeScore;
            const valB = rankBy === 'velocity' ? b.velocity : rankBy === 'accuracy' ? b.accuracy : rankBy === 'completion' ? b.completion : b.compositeScore;
            return valB - valA;
        });

        const top3 = sorted.slice(0, 3);
        const bottom3 = sorted.length > 3 ? sorted.slice(-3).reverse() : [];

        const n = scorecardData.length;
        const averages = {
            velocity: Math.round(scorecardData.reduce((s, d) => s + d.velocity, 0) / n),
            accuracy: Math.round(scorecardData.reduce((s, d) => s + d.accuracy, 0) / n),
            completion: Math.round(scorecardData.reduce((s, d) => s + d.completion, 0) / n),
            composite: Math.round(scorecardData.reduce((s, d) => s + d.compositeScore, 0) / n),
        };

        return { top3, bottom3, averages };
    }, [scorecardData, rankBy]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (scorecardData.length === 0) return null;

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.875 14.25v4.5m8.625 0h.008v.008h-.008v-.008zm-5.25 0h.008v.008h-.008v-.008z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Team Scorecard</h2>
                        <p className="text-sm text-muted-foreground">Weighted averages across all squads</p>
                    </div>
                </div>

                {/* Rank By Selector */}
                <div className="flex items-center gap-1 bg-muted/30 rounded-lg border border-border p-0.5">
                    {(['composite', 'velocity', 'accuracy', 'completion'] as RankingMetric[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setRankBy(m)}
                            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                                rankBy === m
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {metricLabel(m)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Averages Row */}
            {averages && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-muted/30 rounded-xl border border-border p-4">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Velocity</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{averages.velocity}<span className="text-sm text-muted-foreground ml-1">pts</span></p>
                    </div>
                    <div className="bg-muted/30 rounded-xl border border-border p-4">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Accuracy</p>
                        <p className={`text-2xl font-bold mt-1 ${averages.accuracy >= 80 ? 'text-green-400' : averages.accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{averages.accuracy}%</p>
                    </div>
                    <div className="bg-muted/30 rounded-xl border border-border p-4">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Sprint Completion</p>
                        <p className={`text-2xl font-bold mt-1 ${averages.completion >= 80 ? 'text-green-400' : averages.completion >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{averages.completion}%</p>
                    </div>
                    <div className="bg-muted/30 rounded-xl border border-border p-4">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Composite Score</p>
                        <p className={`text-2xl font-bold mt-1 ${averages.composite >= 80 ? 'text-green-400' : averages.composite >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{averages.composite}</p>
                    </div>
                </div>
            )}

            {/* Top 3 / Bottom 3 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top 3 */}
                <div className="bg-muted/30 rounded-xl border border-green-500/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-green-400 text-sm">🏆</span>
                        <h3 className="text-sm font-semibold text-green-400">Top 3 by {metricLabel(rankBy)}</h3>
                    </div>
                    <div className="space-y-2">
                        {top3.map((squad, i) => (
                            <div key={squad.id} className="flex items-center justify-between bg-background/40 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold text-muted-foreground/50 w-5 text-center">{i + 1}</span>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{squad.name}</p>
                                        <p className="text-[10px] text-muted-foreground">{squad.engineerCount} eng · {squad.qaCount} qa</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {trendIcon(squad.trend)}
                                    <span className={`text-sm font-bold tabular-nums ${metricColor(squad, rankBy)}`}>
                                        {metricValue(squad, rankBy)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom 3 */}
                {bottom3.length > 0 && (
                    <div className="bg-muted/30 rounded-xl border border-red-500/20 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-red-400 text-sm">⚠</span>
                            <h3 className="text-sm font-semibold text-red-400">Bottom 3 by {metricLabel(rankBy)}</h3>
                        </div>
                        <div className="space-y-2">
                            {bottom3.map((squad, i) => (
                                <div key={squad.id} className="flex items-center justify-between bg-background/40 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-muted-foreground/50 w-5 text-center">{scorecardData.length - i}</span>
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{squad.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{squad.engineerCount} eng · {squad.qaCount} qa</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {trendIcon(squad.trend)}
                                        <span className={`text-sm font-bold tabular-nums ${metricColor(squad, rankBy)}`}>
                                            {metricValue(squad, rankBy)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
