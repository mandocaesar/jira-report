'use client';

import { SprintReportData } from '@/types';

interface SprintReportProps {
    report: SprintReportData;
    jiraDomain?: string;
}

const statusColors: Record<string, { bg: string; border: string; text: string; bar: string }> = {
    'Done': {
        bg: 'from-green-500/10 to-emerald-500/10',
        border: 'border-green-500/20',
        text: 'text-green-400',
        bar: 'from-green-500 to-emerald-500',
    },
    'In Progress': {
        bg: 'from-blue-500/10 to-cyan-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-400',
        bar: 'from-blue-500 to-cyan-500',
    },
    'To Do': {
        bg: 'from-gray-500/10 to-slate-500/10',
        border: 'border-gray-500/20',
        text: 'text-gray-400',
        bar: 'from-gray-500 to-slate-500',
    },
};

const defaultColors = {
    bg: 'from-purple-500/10 to-pink-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    bar: 'from-purple-500 to-pink-500',
};

function getStatusColors(category: string) {
    return statusColors[category] || defaultColors;
}

function getCompletionColor(percent: number): string {
    if (percent >= 90) return 'text-green-400';
    if (percent >= 70) return 'text-blue-400';
    if (percent >= 50) return 'text-yellow-400';
    return 'text-red-400';
}

function getCompletionBarColor(percent: number): string {
    if (percent >= 90) return 'from-green-500 to-emerald-500';
    if (percent >= 70) return 'from-blue-500 to-cyan-500';
    if (percent >= 50) return 'from-yellow-500 to-amber-500';
    return 'from-red-500 to-orange-500';
}

export default function SprintReport({ report, jiraDomain }: SprintReportProps) {
    const { totalPoints, completedPoints, completionPercent, statusGroups, memberBreakdowns } = report;

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Total Points */}
                <div className="text-center p-4 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-xl border border-indigo-500/20">
                    <div className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent mb-1">
                        {totalPoints}
                    </div>
                    <div className="text-xs text-gray-400">Total Points</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">(sub-tasks)</div>
                </div>

                {/* Completed */}
                <div className="text-center p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                    <div className="text-lg font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent mb-1">
                        {completedPoints}
                    </div>
                    <div className="text-xs text-gray-400">Completed</div>
                    <div className="text-[10px] text-green-400/70 mt-0.5">Done</div>
                </div>

                {/* Completion % */}
                <div className="text-center p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                    <div className={`text-lg font-bold mb-1 ${getCompletionColor(completionPercent)}`}>
                        {completionPercent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">Completion</div>
                    {/* Mini progress bar */}
                    <div className="mt-2 h-1.5 w-full bg-gray-700/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full bg-gradient-to-r ${getCompletionBarColor(completionPercent)} transition-all duration-500`}
                            style={{ width: `${Math.min(completionPercent, 100)}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Status Breakdown */}
            {statusGroups.length > 0 && (
                <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                    <h3 className="text-xs font-semibold text-gray-400 mb-3">Status Breakdown</h3>
                    <div className="space-y-2">
                        {statusGroups.map((group) => {
                            const colors = getStatusColors(group.statusCategory);
                            const percentage = totalPoints > 0 ? (group.points / totalPoints) * 100 : 0;
                            return (
                                <div key={group.statusCategory} className="flex items-center gap-3">
                                    <div className={`w-24 text-xs font-medium ${colors.text} flex-shrink-0`}>
                                        {group.statusCategory}
                                    </div>
                                    <div className="flex-1">
                                        <div className="h-4 bg-gray-700/30 rounded-lg overflow-hidden relative">
                                            <div
                                                className={`h-full bg-gradient-to-r ${colors.bar} rounded-lg transition-all duration-700`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                            <div className="absolute inset-0 flex items-center px-2">
                                                <span className="text-[10px] font-medium text-white/80">
                                                    {group.points} pts ({group.count} tasks)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-10 text-right text-xs font-bold text-gray-300">
                                        {percentage.toFixed(0)}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Per-Member Breakdown */}
            {memberBreakdowns.length > 0 && (
                <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-700/30">
                        <h3 className="text-xs font-semibold text-gray-400">Per Team Member</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-700/30 text-[10px] text-gray-500 uppercase tracking-wider">
                                    <th className="px-4 py-2 text-left">Member</th>
                                    <th className="px-3 py-2 text-center">Total</th>
                                    <th className="px-3 py-2 text-center">Done</th>
                                    <th className="px-3 py-2 text-center">Completion</th>
                                    <th className="px-3 py-2 text-left">Status Breakdown</th>
                                </tr>
                            </thead>
                            <tbody>
                                {memberBreakdowns.map((member) => (
                                    <tr key={member.user.accountId} className="border-b border-gray-700/20 hover:bg-gray-700/10 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {member.user.avatarUrl ? (
                                                    <img
                                                        src={member.user.avatarUrl}
                                                        alt={member.user.displayName}
                                                        className="w-6 h-6 rounded-full ring-2 ring-gray-700"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full ring-2 ring-gray-700 bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">
                                                        {member.user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-xs font-medium text-white">{member.user.displayName}</div>
                                                    <div className="flex items-center gap-1">
                                                        <span className={`text-[9px] px-1 py-0.5 rounded ${member.role === 'qa'
                                                            ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                                                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                            }`}>
                                                            {member.role.toUpperCase()}
                                                        </span>
                                                        <span className="text-[9px] text-gray-500 truncate mt-0.5 max-w-[100px]">{member.title}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className="text-xs font-bold text-white">{member.totalPoints}</span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className="text-xs font-bold text-green-400">{member.completedPoints}</span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`text-xs font-bold ${getCompletionColor(member.completionPercent)}`}>
                                                    {member.completionPercent.toFixed(0)}%
                                                </span>
                                                <div className="w-12 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full bg-gradient-to-r ${getCompletionBarColor(member.completionPercent)} transition-all duration-500`}
                                                        style={{ width: `${Math.min(member.completionPercent, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {member.statusGroups.map((sg) => {
                                                    const colors = getStatusColors(sg.statusCategory);
                                                    return (
                                                        <span
                                                            key={sg.statusCategory}
                                                            className={`text-[10px] px-2 py-0.5 rounded bg-gradient-to-r ${colors.bg} ${colors.text} border ${colors.border}`}
                                                        >
                                                            {sg.statusCategory}: {sg.points}pts ({sg.count})
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {totalPoints === 0 && (
                <div className="text-center py-8 bg-gray-800/20 rounded-xl border border-gray-700/20">
                    <div className="w-12 h-12 bg-gray-700/30 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <p className="text-sm text-gray-400">No sub-tasks found in this sprint</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Sprint completion is calculated from sub-tasks only</p>
                </div>
            )}
        </div>
    );
}
