'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SquadOverview } from '@/types';

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

export default function SquadsPage() {
    const [squads, setSquads] = useState<SquadOverview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSquads() {
            try {
                setLoading(true);
                const res = await fetch('/api/squads');
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Failed to fetch squads');
                setSquads(json.data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load squads');
            } finally {
                setLoading(false);
            }
        }
        fetchSquads();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Loading squads...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="bg-gray-900 rounded-2xl p-8 border border-red-500/30 max-w-md text-center">
                    <p className="text-red-400 text-lg font-semibold mb-2">Error</p>
                    <p className="text-gray-400">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 p-6 md:p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white mb-1">Squad Dashboard</h1>
                <p className="text-gray-400 text-sm">Overview of all engineering squads and their health metrics</p>
            </div>

            {/* Squad Cards Grid */}
            {squads.length === 0 ? (
                <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
                    <p className="text-gray-400 text-lg mb-2">No squads found</p>
                    <p className="text-gray-500 text-sm">Add teams in Settings → Team to see them here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {squads.map((squad) => (
                        <Link key={squad.id} href={`/squads/${squad.id}`}>
                            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-purple-500/40 transition-all duration-200 cursor-pointer group">
                                {/* Squad Name & Department */}
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
                                            {squad.name}
                                        </h2>
                                        {squad.departmentName && (
                                            <p className="text-gray-500 text-xs mt-0.5">{squad.departmentName}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                        <span title="Engineers">{squad.engineerCount} eng</span>
                                        <span className="text-gray-600">·</span>
                                        <span title="QA">{squad.qaCount} qa</span>
                                    </div>
                                </div>

                                {/* Current Sprint */}
                                {squad.currentSprint ? (
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs text-gray-400 truncate max-w-[60%]">
                                                {squad.currentSprint.name}
                                            </span>
                                            <span className="text-xs text-gray-300 font-medium">
                                                {squad.currentSprint.progress}% through
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${progressColor(squad.currentSprint.progress)}`}
                                                style={{ width: `${squad.currentSprint.progress}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between mt-1.5 text-xs">
                                            <span className="text-gray-500">
                                                {squad.currentSprint.completedPoints}/{squad.currentSprint.committedPoints} pts
                                            </span>
                                            <span className="text-gray-400 font-medium">
                                                {squad.currentSprint.completionPercent}% complete
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-4 py-3 text-center text-xs text-gray-600">
                                        No active sprint
                                    </div>
                                )}

                                {/* Velocity Summary */}
                                {squad.recentVelocity ? (
                                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-800">
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Avg Velocity</p>
                                            <p className="text-sm font-semibold text-white mt-0.5">
                                                {squad.recentVelocity.avgActual}
                                                <span className="text-gray-500 font-normal text-xs ml-1">pts</span>
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Accuracy</p>
                                            <p className="text-sm font-semibold text-white mt-0.5">
                                                {squad.recentVelocity.avgAccuracy}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Trend</p>
                                            <p className="text-sm font-semibold mt-0.5 flex items-center gap-1">
                                                {trendIcon(squad.recentVelocity.trend)}
                                                <span className="text-gray-400 text-xs capitalize">
                                                    {squad.recentVelocity.trend}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-4 border-t border-gray-800 text-center text-xs text-gray-600">
                                        No velocity data
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
