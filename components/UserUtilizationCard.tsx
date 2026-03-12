'use client';

import { UserUtilization } from '@/types';
import Image from 'next/image';

interface UserUtilizationCardProps {
    utilization: UserUtilization;
}

export default function UserUtilizationCard({ utilization }: UserUtilizationCardProps) {
    const { user, storyPoints, workingDays, leaveDays, availableDays, utilizationPercent, status, role, title, workTypeStats, isUnrecognized } = utilization;

    const statusColors = {
        under: {
            bg: 'from-blue-500/20 to-cyan-500/20',
            border: 'border-blue-500/40',
            text: 'text-blue-400',
            bar: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        },
        optimal: {
            bg: 'from-green-500/20 to-emerald-500/20',
            border: 'border-green-500/40',
            text: 'text-green-400',
            bar: 'bg-gradient-to-r from-green-500 to-emerald-500',
        },
        over: {
            bg: 'from-red-500/20 to-orange-500/20',
            border: 'border-red-500/40',
            text: 'text-red-400',
            bar: 'bg-gradient-to-r from-red-500 to-orange-500',
        },
    };

    const colors = statusColors[status];
    const displayPercent = Math.min(utilizationPercent, 150); // Cap display at 150%

    // Role badge color
    const roleColor = role === 'qa' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border ${colors.border}
                  bg-gradient-to-br ${colors.bg} backdrop-blur-sm
                  hover:brightness-110 transition-all duration-300 group`}
        >
            {/* Background gradient effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

            <div className="relative p-4">
                {/* User Info */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20">
                            {user.avatarUrl ? (
                                <Image
                                    src={user.avatarUrl}
                                    alt={user.displayName}
                                    width={40}
                                    height={40}
                                    className="object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                    {user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>
                        {/* Status indicator */}
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${colors.bar} rounded-full border-2 border-gray-900`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm truncate flex items-center gap-1.5">
                            {user.displayName}
                            {isUnrecognized && (
                                <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] cursor-help" title="Not in team roster — sync team data to fix">
                                    !
                                </span>
                            )}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${roleColor} uppercase font-bold tracking-wider`}>
                                {role}
                            </span>
                            <span className="text-[10px] text-gray-400 truncate">{title}</span>
                        </div>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="flex justify-between items-center mb-3 bg-black/20 rounded-lg p-2">
                    <div className="text-center flex-1 border-r border-white/5">
                        <p className="text-[10px] text-gray-400 mb-0.5">Story Points</p>
                        <p className="text-lg font-bold text-white leading-none">{storyPoints}</p>
                    </div>
                    <div className="text-center flex-1">
                        <p className="text-[10px] text-gray-400 mb-0.5">Available Days</p>
                        <div className="flex items-baseline justify-center gap-1 leading-none">
                            <p className="text-lg font-bold text-white">{availableDays}</p>
                            {leaveDays > 0 && (
                                <span className="text-[10px] text-red-400">(-{leaveDays})</span>
                            )}
                            {leaveDays === 0 && (
                                <span className="text-[10px] text-gray-500">/ {workingDays}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Utilization Bar */}
                <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400">Utilization</span>
                        <span className={`text-xs font-bold ${colors.text}`}>
                            {utilizationPercent.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-2 bg-gray-800/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${colors.bar} rounded-full transition-all duration-500 ease-out`}
                            style={{ width: `${Math.min(displayPercent, 100)}%` }}
                        ></div>
                    </div>
                    {utilizationPercent > 100 && (
                        <p className="text-xs text-orange-400 mt-1">⚠️ Over capacity</p>
                    )}
                </div>

                {/* Work Type Breakdown */}
                {workTypeStats && Object.keys(workTypeStats).length > 0 && (
                    <div className="pt-2 border-t border-white/10">
                        <div className="flex flex-wrap gap-1.5">
                            {workTypeStats['Product'] > 0 && (
                                <div className="flex items-center gap-1 bg-green-500/10 px-1.5 py-0.5 rounded text-[9px] border border-green-500/30">
                                    <span className="text-green-300">📦 Product</span>
                                    <span className="font-bold text-green-200 bg-green-500/20 px-1.5 rounded text-[10px]">{workTypeStats['Product']}</span>
                                </div>
                            )}
                            {workTypeStats['Technical Initiatives'] > 0 && (
                                <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded text-xs border border-blue-500/30">
                                    <span className="text-blue-300">⚙️ Tech</span>
                                    <span className="font-bold text-blue-200 bg-blue-500/20 px-1 rounded text-[9px]">{workTypeStats['Technical Initiatives']}</span>
                                </div>
                            )}
                            {workTypeStats['Incident'] > 0 && (
                                <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded text-[9px] border border-red-500/30">
                                    <span className="text-red-300">🐛 Incident</span>
                                    <span className="font-bold text-red-200 bg-red-500/20 px-1 rounded text-[9px]">{workTypeStats['Incident']}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
