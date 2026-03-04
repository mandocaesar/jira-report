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
        });
    };

    const getAverageStatusColor = (percent: number) => {
        if (percent < 70) return 'text-blue-400';
        if (percent > 110) return 'text-red-400';
        return 'text-green-400';
    };

    // Sprint timeline calculations
    const now = new Date();
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const progressPercent = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

    // Calculate working days elapsed and remaining
    const getWorkingDaysBetween = (from: Date, to: Date) => {
        let count = 0;
        const current = new Date(from);
        while (current <= to) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) count++;
            current.setDate(current.getDate() + 1);
        }
        return count;
    };

    const isSprintActive = now >= startDate && now <= endDate;
    const isSprintFinished = now > endDate;
    const daysElapsed = isSprintFinished
        ? totalWorkingDays
        : isSprintActive
            ? getWorkingDaysBetween(startDate, now)
            : 0;
    const daysRemaining = Math.max(totalWorkingDays - daysElapsed, 0);

    // Work type colors
    const workTypeColors: Record<string, { bg: string; border: string; text: string; bar: string }> = {
        'Product': { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', bar: 'bg-emerald-500' },
        'Technical Initiatives': { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400', bar: 'bg-blue-500' },
        'Incident': { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', bar: 'bg-red-500' },
    };
    const defaultColor = { bg: 'bg-gray-500/15', border: 'border-gray-500/30', text: 'text-gray-400', bar: 'bg-gray-500' };

    return (
        <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30">
            {/* Row 1: Key Metrics + Sprint Timeline */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3">
                {/* Total Story Points */}
                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/20">
                    <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent leading-tight">
                        {totalStoryPoints}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Story Points</div>
                </div>

                {/* Sprint Timeline (merged with Working Days) */}
                <div className="col-span-2 md:col-span-3 py-2.5 px-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight">
                                {totalWorkingDays}
                            </span>
                            <span className="text-[10px] text-gray-400">working days</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSprintActive && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                                    ⏳ {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
                                </span>
                            )}
                            {isSprintFinished && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30 font-medium">
                                    ✅ Completed
                                </span>
                            )}
                            {!isSprintActive && !isSprintFinished && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30 font-medium">
                                    Not started
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="relative h-2 bg-gray-700/50 rounded-full overflow-hidden mb-1.5">
                        <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                        {/* Today marker */}
                        {isSprintActive && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                                style={{ left: `${progressPercent}%` }}
                            />
                        )}
                    </div>

                    {/* Date labels */}
                    <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[9px] text-gray-500">{formatDate(sprint.startDate)}</span>
                        <div className="flex items-center gap-3 text-[9px]">
                            <span className="text-purple-400">{daysElapsed} elapsed</span>
                            <span className="text-gray-600">•</span>
                            <span className="text-pink-400">{daysRemaining} remaining</span>
                        </div>
                        <span className="text-[9px] text-gray-500">{formatDate(sprint.endDate)}</span>
                    </div>

                    {/* Holidays tooltip */}
                    {summary.holidays && summary.holidays.length > 0 && (
                        <div className="mt-2 bg-black/20 rounded p-1.5 border border-purple-500/20">
                            <div className="text-[9px] text-purple-300 font-medium mb-0.5">
                                🏖️ {summary.holidays.length} holiday{summary.holidays.length > 1 ? 's' : ''} excluded
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {summary.holidays.map((h, i) => (
                                    <span key={i} className="text-[9px] text-gray-500">
                                        {h.holiday_name} ({formatDate(h.holiday_date)})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Total Mandays */}
                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                    <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent leading-tight">
                        {totalMandays}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Mandays</div>
                    <div className="text-[9px] text-gray-500">
                        ({userUtilizations.length} members)
                    </div>
                    {totalLeaveDays > 0 && (
                        <div className="text-[10px] text-red-400">
                            -{totalLeaveDays} leave
                        </div>
                    )}
                </div>

                {/* Avg Utilization */}
                <div className="text-center py-2.5 px-3 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-lg border border-orange-500/20">
                    <div className={`text-3xl font-bold leading-tight ${getAverageStatusColor(averageUtilization)}`}>
                        {averageUtilization.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Avg Util</div>
                </div>
            </div>

            {/* Row 2: Work Type Distribution — stacked bar */}
            {
                workTypeStats && Object.keys(workTypeStats).length > 0 && (
                    <div className="px-3 pb-3">
                        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Work Type Distribution</h3>
                                <span className="text-[10px] text-gray-500">{totalStoryPoints} pts total</span>
                            </div>

                            {/* Stacked horizontal bar */}
                            <div className="flex h-3 rounded-full overflow-hidden bg-gray-700/50 mb-2.5">
                                {Object.entries(workTypeStats).map(([type, points]) => {
                                    const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                                    if (percentage === 0) return null;
                                    const colors = workTypeColors[type] || defaultColor;
                                    return (
                                        <div
                                            key={type}
                                            className={`${colors.bar} transition-all duration-700 first:rounded-l-full last:rounded-r-full`}
                                            style={{ width: `${percentage}%` }}
                                            title={`${type}: ${points} pts (${percentage.toFixed(0)}%)`}
                                        />
                                    );
                                })}
                            </div>

                            {/* Legend pills */}
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(workTypeStats).map(([type, points]) => {
                                    const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                                    const colors = workTypeColors[type] || defaultColor;
                                    const emoji = type === 'Product' ? '📦' : type === 'Technical Initiatives' ? '⚙️' : type === 'Incident' ? '🐛' : '📋';
                                    return (
                                        <div
                                            key={type}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${colors.bg} border ${colors.border}`}
                                        >
                                            <span className="text-[10px]">{emoji}</span>
                                            <span className={`text-[10px] font-medium ${colors.text}`}>{type}</span>
                                            <span className="text-[10px] font-bold text-white">{points} pts</span>
                                            <span className="text-[9px] text-gray-500">({percentage.toFixed(0)}%)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Row 3: QA vs Engineer Breakdown */}
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
        </div >
    );
}
