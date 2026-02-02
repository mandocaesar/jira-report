'use client';

import { UserUtilization } from '@/types';
import Image from 'next/image';

interface UserUtilizationCardProps {
    utilization: UserUtilization;
}

export default function UserUtilizationCard({ utilization }: UserUtilizationCardProps) {
    const { user, storyPoints, workingDays, leaveDays, availableDays, utilizationPercent, status, role, title, workTypeStats } = utilization;

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
    const roleColor = role === 'qa' ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border ${colors.border}
                  bg-gradient-to-br ${colors.bg} backdrop-blur-sm
                  hover:scale-105 transition-all duration-300 group`}
        >
            {/* Background gradient effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

            <div className="relative p-6">
                {/* User Info */}
                <div className="flex items-center gap-4 mb-4">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/20">
                            <Image
                                src={user.avatarUrl}
                                alt={user.displayName}
                                width={56}
                                height={56}
                                className="object-cover"
                            />
                        </div>
                        {/* Status indicator */}
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${colors.bar} rounded-full border-2 border-gray-900`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{user.displayName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleColor} uppercase font-bold tracking-wider`}>
                                {role}
                            </span>
                            <span className="text-xs text-gray-400 truncate">{title}</span>
                        </div>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <p className="text-xs text-gray-400 mb-1">Story Points</p>
                        <p className="text-2xl font-bold text-white">{storyPoints}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-1">Available Days</p>
                        <div className="flex items-baseline gap-1">
                            <p className="text-2xl font-bold text-white">{availableDays}</p>
                            {leaveDays > 0 && (
                                <span className="text-xs text-red-400">(-{leaveDays} leave)</span>
                            )}
                            {leaveDays === 0 && (
                                <span className="text-xs text-gray-500">/ {workingDays}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Utilization Bar */}
                <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">Utilization</span>
                        <span className={`text-sm font-bold ${colors.text}`}>
                            {utilizationPercent.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-3 bg-gray-800/50 rounded-full overflow-hidden">
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
                    <div className="pt-3 border-t border-white/10">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Work Breakdown</p>
                        <div className="flex flex-wrap gap-2">
                            {workTypeStats['Product'] > 0 && (
                                <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-1 rounded text-xs border border-green-500/30">
                                    <span className="text-green-300">📦 Product</span>
                                    <span className="font-bold text-green-200 bg-green-500/20 px-1.5 rounded text-[10px]">{workTypeStats['Product']}</span>
                                </div>
                            )}
                            {workTypeStats['Technical Initiatives'] > 0 && (
                                <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded text-xs border border-blue-500/30">
                                    <span className="text-blue-300">⚙️ Tech</span>
                                    <span className="font-bold text-blue-200 bg-blue-500/20 px-1.5 rounded text-[10px]">{workTypeStats['Technical Initiatives']}</span>
                                </div>
                            )}
                            {workTypeStats['Incident'] > 0 && (
                                <div className="flex items-center gap-1.5 bg-red-500/10 px-2 py-1 rounded text-xs border border-red-500/30">
                                    <span className="text-red-300">🐛 Incident</span>
                                    <span className="font-bold text-red-200 bg-red-500/20 px-1.5 rounded text-[10px]">{workTypeStats['Incident']}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
