'use client';

import { useState, useEffect } from 'react';
import BoardSelector from '@/components/BoardSelector';
import CapacityAdjustmentModal from '@/components/CapacityAdjustmentModal';

interface SprintForecast {
    sprintId: number;
    sprintName: string;
    startDate: string;
    endDate: string;
    capacity: {
        totalEngineers: number;
        effectiveEngineers: number;
        totalManDays: number;
        forecastedPoints: number;
    };
    engineers: Array<{
        accountId: string;
        name: string;
        capacity: number;
        reason?: string;
        leaveDays?: number;
        excluded?: boolean;
    }>;
    holidays?: Array<{
        date: string;
        name: string;
    }>;
    leaves?: Array<{
        name: string;
        leaveDays: number;
    }>;
    excludedMembers?: Array<{
        name: string;
    }>;
}

interface ForecastData {
    boardId: number;
    teamName: string;
    sprints: SprintForecast[];
    engineers: Array<{
        accountId: string;
        name: string;
    }>;
}

interface CapacityAdjustment {
    id: number;
    engineerId: string;
    engineerName: string;
    capacityPercentage: number;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
}

export default function CapacityPlanningPage() {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
    const [forecastData, setForecastData] = useState<ForecastData | null>(null);
    const [adjustments, setAdjustments] = useState<CapacityAdjustment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingAdjustment, setEditingAdjustment] = useState<CapacityAdjustment | null>(null);

    useEffect(() => {
        if (selectedBoardId) {
            fetchForecast();
            fetchAdjustments();
        }
    }, [selectedBoardId]);

    const fetchForecast = async () => {
        if (!selectedBoardId) return;

        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`/api/planning/forecast?boardId=${selectedBoardId}&months=6`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

            setForecastData(result.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load forecast');
        } finally {
            setLoading(false);
        }
    };

    const fetchAdjustments = async () => {
        if (!selectedBoardId) return;

        try {
            const response = await fetch(`/api/capacity?boardId=${selectedBoardId}`);
            const result = await response.json();

            if (result.success) {
                setAdjustments(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch adjustments:', err);
        }
    };

    const handleSaveAdjustment = async (adjustment: {
        engineerId: string;
        capacityPercentage: number;
        startDate: string;
        endDate: string;
        reason: string;
        notes?: string;
    }) => {
        const url = editingAdjustment
            ? `/api/capacity?id=${editingAdjustment.id}`
            : '/api/capacity';
        const method = editingAdjustment ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...adjustment,
                boardId: selectedBoardId,
            }),
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error);
        }

        // Refresh data
        await fetchForecast();
        await fetchAdjustments();
        setEditingAdjustment(null);
    };

    const handleDeleteAdjustment = async (id: number) => {
        if (!confirm('Are you sure you want to delete this adjustment?')) return;

        try {
            const response = await fetch(`/api/capacity?id=${id}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

            await fetchForecast();
            await fetchAdjustments();
        } catch (err) {
            console.error('Failed to delete adjustment:', err);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getCapacityColor = (effective: number, total: number) => {
        const percentage = (effective / total) * 100;
        if (percentage >= 90) return 'text-green-400';
        if (percentage >= 75) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="min-h-screen overflow-x-hidden">
            {/* Header */}
            <header className="border-b border-border bg-gray-900/50 backdrop-blur-xl sticky top-0 z-40">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground mb-1">Capacity Planning</h1>
                            <p className="text-muted-foreground text-sm">Forecast sprint capacity and manage engineer availability</p>
                        </div>
                        {selectedBoardId && (
                            <button
                                onClick={() => {
                                    setEditingAdjustment(null);
                                    setModalOpen(true);
                                }}
                                className="px-4 py-2 bg-foreground hover:bg-foreground/90 text-background font-medium rounded-xl transition-all flex items-center gap-2"
                            >
                                <span className="text-lg">➕</span>
                                Add Adjustment
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full">
                {/* Board Selector */}
                <div className="mb-8">
                    <label className="block text-sm font-semibold text-gray-300 mb-3">
                        Select Board
                    </label>
                    <BoardSelector
                        onBoardChange={setSelectedBoardId}
                        selectedBoardId={selectedBoardId}
                    />
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {/* Forecast Data */}
                {forecastData && !loading && (
                    <div className="space-y-8">
                        {/* Summary */}
                        <div className="p-6 bg-muted/50 border border-border rounded-2xl backdrop-blur-sm">
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>
                                {forecastData.teamName} - Sprint Forecast
                            </h2>
                            <p className="text-gray-400 text-sm">
                                Showing {forecastData.sprints.length} upcoming sprints with capacity projections
                            </p>
                        </div>

                        {/* Active Adjustments */}
                        {adjustments.length > 0 && (
                            <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>
                                    Active Capacity Adjustments
                                    <span className="text-sm font-normal text-gray-400">({adjustments.length})</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {adjustments.map((adj) => (
                                        <div
                                            key={adj.id}
                                            className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 hover:border-blue-500/30 transition-all group"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="font-medium text-white">{adj.engineerName}</div>
                                                <div className={`text-lg font-bold ${adj.capacityPercentage === 0 ? 'text-red-400' :
                                                    adj.capacityPercentage < 50 ? 'text-orange-400' :
                                                        adj.capacityPercentage < 100 ? 'text-yellow-400' :
                                                            'text-green-400'
                                                    }`}>
                                                    {adj.capacityPercentage}%
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 mb-2">
                                                {formatDate(adj.startDate)} - {formatDate(adj.endDate)}
                                            </div>
                                            <div className="text-sm text-gray-400 capitalize mb-3">
                                                {adj.reason.replace('-', ' ')}
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => {
                                                        setEditingAdjustment(adj);
                                                        setModalOpen(true);
                                                    }}
                                                    className="flex-1 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAdjustment(adj.id)}
                                                    className="flex-1 text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sprint Timeline */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth={2.5} /></svg>
                                Sprint Timeline
                            </h3>
                            {forecastData.sprints.map((sprint, index) => (
                                <div
                                    key={sprint.sprintId}
                                    className={`bg-gray-800/30 border rounded-2xl p-6 backdrop-blur-sm transition-all ${index === 0 ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-gray-700 hover:border-blue-500/30'
                                        }`}
                                >
                                    {/* Sprint Badge for Current */}
                                    {index === 0 && (
                                        <div className="inline-block px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded-full mb-3">
                                            Current / Next Sprint
                                        </div>
                                    )}

                                    {/* Sprint Header */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">{sprint.sprintName}</h3>
                                            <p className="text-sm text-gray-400">
                                                {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-3xl font-bold ${getCapacityColor(sprint.capacity.effectiveEngineers, sprint.capacity.totalEngineers)}`}>
                                                {sprint.capacity.effectiveEngineers.toFixed(1)}
                                            </div>
                                            <div className="text-xs text-gray-500">of {sprint.capacity.totalEngineers} members</div>
                                        </div>
                                    </div>

                                    {/* Capacity Metrics */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div className="bg-gray-900/50 rounded-xl p-4">
                                            <div className="text-xs text-gray-500 mb-1">Available Mandays</div>
                                            <div className="text-2xl font-bold text-blue-400">{sprint.capacity.totalManDays}</div>
                                            <div className="text-xs text-gray-500 mt-1">= Story Points</div>
                                        </div>
                                        <div className="bg-gray-900/50 rounded-xl p-4">
                                            <div className="text-xs text-gray-500 mb-1">Effective Engineers</div>
                                            <div className="text-2xl font-bold text-white">{sprint.capacity.effectiveEngineers}</div>
                                            <div className="text-xs text-gray-500 mt-1">of {sprint.capacity.totalEngineers} total</div>
                                        </div>
                                        <div className="bg-gray-900/50 rounded-xl p-4">
                                            <div className="text-xs text-gray-500 mb-1">Team Capacity</div>
                                            <div className="text-2xl font-bold text-blue-400">
                                                {Math.round((sprint.capacity.effectiveEngineers / sprint.capacity.totalEngineers) * 100)}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Holidays info */}
                                    {sprint.holidays && sprint.holidays.length > 0 && (
                                        <div className="mb-4 pt-3 border-t border-blue-500/20">
                                            <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /></svg> Public Holidays:
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {sprint.holidays.map((holiday, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1.5 text-xs">
                                                        <span className="text-blue-400 font-medium">{formatDate(holiday.date)}</span>
                                                        <span className="text-gray-400">—</span>
                                                        <span className="text-gray-300 max-w-[150px] truncate" title={holiday.name}>{holiday.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Team Leave */}
                                    {sprint.leaves && sprint.leaves.length > 0 && (
                                        <div className="mb-4 pt-3 border-t border-blue-500/20">
                                            <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" /><path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" /></svg> Team Leave:
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {sprint.leaves.map((leave, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1.5 text-xs">
                                                        <span className="text-blue-300 font-medium">{leave.name}</span>
                                                        <span className="text-blue-400 font-bold">{leave.leaveDays}d</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Excluded Members */}
                                    {sprint.excludedMembers && sprint.excludedMembers.length > 0 && (
                                        <div className="mb-4 pt-3 border-t border-red-500/20">
                                            <div className="text-sm font-semibold text-red-300 mb-2 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M18.36 5.64L5.64 18.36" strokeLinecap="round" /></svg> Excluded from Sprint:
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {sprint.excludedMembers.map((member, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5 text-xs">
                                                        <span className="text-red-300 font-medium">{member.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Capacity Adjustments */}
                                    {sprint.engineers.some(e => !e.excluded && (e.capacity < 100 || e.reason)) && (
                                        <div className="mt-4 pt-4 border-t border-gray-700">
                                            <div className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                                                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                                Capacity Adjustments:</div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {sprint.engineers
                                                    .filter(e => !e.excluded && (e.capacity < 100 || e.reason))
                                                    .map((engineer) => (
                                                        <div key={engineer.accountId} className="flex items-center justify-between text-sm bg-gray-900/30 rounded-lg px-3 py-2">
                                                            <span className="text-gray-300">{engineer.name}</span>
                                                            <div className="flex items-center gap-2">
                                                                {engineer.reason && (
                                                                    <span className="text-xs text-gray-500 capitalize">{engineer.reason.replace('-', ' ')}</span>
                                                                )}
                                                                <span className={`font-semibold ${engineer.capacity < 50 ? 'text-red-400' : engineer.capacity < 100 ? 'text-yellow-400' : 'text-green-400'}`}>
                                                                    {engineer.capacity}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Empty State */}
                        {forecastData.sprints.length === 0 && (
                            <div className="p-8 bg-gray-800/30 border border-gray-700 rounded-2xl text-center">
                                <p className="text-gray-400">No upcoming sprints found for this board</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Placeholder when no board selected */}
                {!selectedBoardId && !loading && (
                    <div className="p-12 bg-gray-800/30 border border-gray-700 rounded-2xl text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">Select a Board</h3>
                        <p className="text-muted-foreground">Choose a board above to view sprint capacity forecast</p>
                    </div>
                )}
            </main>

            {/* Capacity Adjustment Modal */}
            <CapacityAdjustmentModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingAdjustment(null);
                }}
                onSave={handleSaveAdjustment}
                engineers={forecastData?.engineers || []}
                adjustment={editingAdjustment}
            />
        </div>
    );
}
