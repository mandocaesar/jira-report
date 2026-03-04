'use client';

import { SprintSummary } from '@/types';

interface SprintSummaryProps {
    summary: SprintSummary;
}

export default function SprintSummaryComponent({ summary }: SprintSummaryProps) {
    const { sprint, totalStoryPoints, totalWorkingDays, averageUtilization, userUtilizations, workTypeStats } = summary;

    const totalMandays = (summary.engineerStats?.mandays || 0) + (summary.qaStats?.mandays || 0);
    const totalLeaveDays = (summary.engineerStats?.leaveDays || 0) + (summary.qaStats?.leaveDays || 0);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getAverageStatusColor = (percent: number) => {
        if (percent < 70) return 'text-blue-400';
        if (percent > 110) return 'text-red-400';
        return 'text-green-400';
    };

    return (
        <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30">
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3">
                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/20">
                    <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent leading-tight">
                        {totalStoryPoints}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Total Story Points</div>
                </div>

                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                    <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight">
                        {totalWorkingDays}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Working Days</div>
                    {summary.holidays && summary.holidays.length > 0 && (
                        <div className="mt-2 text-left bg-black/20 rounded-lg p-2 border border-purple-500/20">
                            <div className="text-xs text-purple-300 font-medium mb-1 border-b border-purple-500/20 pb-1">
                                🏖️ Excluded Holidays:
                            </div>
                            <div className="space-y-1 max-h-20 overflow-y-auto pr-1 custom-scrollbar">
                                {summary.holidays.map((h, i) => (
                                    <div key={i} className="text-[10px] text-gray-400 flex justify-between gap-2">
                                        <span className="truncate" title={h.holiday_name}>{h.holiday_name}</span>
                                        <span className="shrink-0 text-gray-500">{formatDate(h.holiday_date).split(',')[0]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                    <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent leading-tight">
                        {totalMandays}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Total Mandays</div>
                    <div className="text-[9px] text-gray-500">
                        ({userUtilizations.length} members)
                    </div>
                    {totalLeaveDays > 0 && (
                        <div className="text-[10px] text-red-400">
                            -{totalLeaveDays} manual leave
                        </div>
                    )}
                </div>

                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-lg border border-orange-500/20">
                    <div className={`text-3xl font-bold leading-tight ${getAverageStatusColor(averageUtilization)}`}>
                        {averageUtilization.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Avg Utilization</div>
                </div>
            </div>

            {/* Work Type Distribution */}
            {workTypeStats && Object.keys(workTypeStats).length > 0 && (
                <div className="px-3 pb-3">
                    <h3 className="text-[10px] font-semibold text-gray-400 mb-2 px-1 uppercase tracking-wider">Work Type Distribution</h3>
                    <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(workTypeStats).map(([type, points]) => {
                                const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                                return (
                                    <div key={type} className="flex flex-col gap-0.5 min-w-[90px]">
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-300">{type}</span>
                                            <span className="text-gray-500">{percentage.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                        <div className="text-[10px] font-bold text-white text-right">{points} pts</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* QA vs Engineer Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-3 pb-3">
                {/* Engineers Stats */}
                <div className="bg-blue-900/10 rounded-lg p-3 border border-blue-500/20">
                    <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        Engineers ({summary.engineerStats?.count || 0})
                    </h3>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                            <p className="text-[10px] text-gray-400">Mandays</p>
                            <p className="text-base font-bold text-white">{summary.engineerStats?.mandays || 0}</p>
                            {summary.engineerStats?.leaveDays > 0 && (
                                <p className="text-[9px] text-red-400">-{summary.engineerStats.leaveDays} leave</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400">Points</p>
                            <p className="text-base font-bold text-white">{summary.engineerStats?.storyPoints || 0}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400">Avg Util</p>
                            <p className="text-base font-bold text-blue-300">
                                {(summary.engineerStats?.mandays > 0 ? (summary.engineerStats.storyPoints / summary.engineerStats.mandays * 100) : 0).toFixed(0)}%
                            </p>
                        </div>
                    </div>
                    {/* Engineer Work Type Breakdown */}
                    {summary.engineerStats?.workTypeStats && (
                        <div className="flex flex-wrap gap-1 pt-2 border-t border-blue-500/20">
                            {summary.engineerStats.workTypeStats['Product'] > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">
                                    📦 {summary.engineerStats.workTypeStats['Product']}
                                </span>
                            )}
                            {summary.engineerStats.workTypeStats['Technical Initiatives'] > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    ⚙️ {summary.engineerStats.workTypeStats['Technical Initiatives']}
                                </span>
                            )}
                            {summary.engineerStats.workTypeStats['Incident'] > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                    🐛 {summary.engineerStats.workTypeStats['Incident']}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* QA Stats */}
                <div className="bg-pink-900/10 rounded-lg p-3 border border-pink-500/20">
                    <h3 className="text-xs font-bold text-pink-400 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                        QA ({summary.qaStats?.count || 0})
                    </h3>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                            <p className="text-[10px] text-gray-400">Mandays</p>
                            <p className="text-base font-bold text-white">{summary.qaStats?.mandays || 0}</p>
                            {summary.qaStats?.leaveDays > 0 && (
                                <p className="text-[9px] text-red-400">-{summary.qaStats.leaveDays} leave</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400">Points</p>
                            <p className="text-base font-bold text-white">{summary.qaStats?.storyPoints || 0}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400">Avg Util</p>
                            <p className="text-base font-bold text-pink-300">
                                {(summary.qaStats?.mandays > 0 ? (summary.qaStats.storyPoints / summary.qaStats.mandays * 100) : 0).toFixed(0)}%
                            </p>
                        </div>
                    </div>
                    {/* QA Work Type Breakdown */}
                    {summary.qaStats?.workTypeStats && (
                        <div className="flex flex-wrap gap-1 pt-2 border-t border-pink-500/20">
                            {summary.qaStats.workTypeStats['Product'] > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">
                                    📦 {summary.qaStats.workTypeStats['Product']}
                                </span>
                            )}
                            {summary.qaStats.workTypeStats['Technical Initiatives'] > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    ⚙️ {summary.qaStats.workTypeStats['Technical Initiatives']}
                                </span>
                            )}
                            {summary.qaStats.workTypeStats['Incident'] > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                    🐛 {summary.qaStats.workTypeStats['Incident']}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Timeline Visualization */}
            <div className="px-3 pb-3">
                <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
                    <h3 className="text-[10px] font-semibold text-gray-400 mb-2 uppercase tracking-wider">Sprint Timeline</h3>
                    <div className="relative h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-pulse"></div>
                    </div>
                    <div className="flex justify-between mt-2">
                        <span className="text-[10px] text-gray-500">{formatDate(sprint.startDate)}</span>
                        <span className="text-[10px] font-semibold text-purple-400">{totalWorkingDays} working days</span>
                        <span className="text-[10px] text-gray-500">{formatDate(sprint.endDate)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
