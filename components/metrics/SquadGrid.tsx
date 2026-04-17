'use client';

import Link from 'next/link';
import { SquadOverview } from '@/types';
import { useFetch } from '@/hooks/useFetch';

function trendIcon(trend: 'up' | 'down' | 'stable') {
    if (trend === 'up') return <span className="text-green-500">&#9650;</span>;
    if (trend === 'down') return <span className="text-red-500">&#9660;</span>;
    return <span className="text-gray-400">&#9644;</span>;
}

function progressColor(pct: number) {
    if (pct >= 80) return 'bg-green-500';
    if (pct >= 50) return 'bg-blue-500';
    if (pct >= 25) return 'bg-yellow-500';
    return 'bg-red-500';
}

export default function SquadGrid() {
    const { data: squads, loading, error } = useFetch<SquadOverview[]>('/api/squads', { ttl: 5 * 60_000 });
    const squadList = squads || [];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground text-sm">Loading squads...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        );
    }

    if (squadList.length === 0) {
        return (
            <div className="bg-muted/30 rounded-xl p-8 border border-border text-center">
                <p className="text-muted-foreground">No squads found. Add teams in Settings → Team.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground">Squad Overview</h2>
                    <p className="text-sm text-muted-foreground">{squadList.length} squads · current sprint progress & velocity</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {squadList.map((squad) => (
                    <Link key={squad.id} href={`/metrics/squad/${squad.id}`}>
                        <div className="bg-muted/30 rounded-xl p-5 border border-border hover:border-purple-500/40 transition-all duration-200 cursor-pointer group">
                            {/* Squad Name & Department */}
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground group-hover:text-purple-400 transition-colors">
                                        {squad.name}
                                    </h3>
                                    {squad.departmentName && (
                                        <p className="text-muted-foreground text-[10px] mt-0.5">{squad.departmentName}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span>{squad.engineerCount} eng</span>
                                    <span className="opacity-40">·</span>
                                    <span>{squad.qaCount} qa</span>
                                </div>
                            </div>

                            {/* Current Sprint */}
                            {squad.currentSprint ? (
                                <div className="mb-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
                                            {squad.currentSprint.name}
                                        </span>
                                        <span className="text-[10px] text-foreground font-medium">
                                            {squad.currentSprint.progress}%
                                        </span>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${progressColor(squad.currentSprint.progress)}`}
                                            style={{ width: `${squad.currentSprint.progress}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between mt-1 text-[10px]">
                                        <span className="text-muted-foreground">
                                            {squad.currentSprint.completedPoints}/{squad.currentSprint.committedPoints} pts
                                        </span>
                                        <span className="text-foreground/80 font-medium">
                                            {squad.currentSprint.completionPercent}% done
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-3 py-2 text-center text-[10px] text-muted-foreground/50">
                                    No active sprint
                                </div>
                            )}

                            {/* Velocity Summary */}
                            {squad.recentVelocity ? (
                                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                                    <div>
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Velocity</p>
                                        <p className="text-xs font-semibold text-foreground mt-0.5">
                                            {squad.recentVelocity.avgActual}
                                            <span className="text-muted-foreground font-normal ml-0.5">pts</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Accuracy</p>
                                        <p className="text-xs font-semibold text-foreground mt-0.5">
                                            {squad.recentVelocity.avgAccuracy}%
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Trend</p>
                                        <p className="text-xs font-semibold mt-0.5 flex items-center gap-1">
                                            {trendIcon(squad.recentVelocity.trend)}
                                            <span className="text-muted-foreground text-[10px] capitalize">
                                                {squad.recentVelocity.trend}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="pt-3 border-t border-border text-center text-[10px] text-muted-foreground/50">
                                    No velocity data
                                </div>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
