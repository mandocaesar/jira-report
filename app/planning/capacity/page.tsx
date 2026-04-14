'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BoardSelector from '@/components/BoardSelector';
import CapacityAdjustmentModal from '@/components/CapacityAdjustmentModal';

// ─── Types ────────────────────────────────────────────────────────────────────

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
        workingDays: number;
        weekdaysInSprint: number;
        totalPossibleManDays: number;
        totalLeaveDays: number;
        adjustmentLoss: number;
        holidayCount: number;
    };
    engineers: Array<{
        accountId: string;
        name: string;
        capacity: number;
        reason?: string;
        leaveDays?: number;
        excluded?: boolean;
    }>;
    holidays?: Array<{ date: string; name: string }>;
    leaves?: Array<{ name: string; leaveDays: number }>;
    excludedMembers?: Array<{ name: string }>;
    stories?: Array<{
        key: string;
        summary: string;
        status: string;
        statusCategory: string;
        assignee: string | null;
        storyPoints: number;
        type: string;
    }>;
}

interface ForecastData {
    boardId: number;
    teamName: string;
    sprints: SprintForecast[];
    engineers: Array<{ accountId: string; name: string }>;
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

interface TeamMember {
    accountId: string;
    name: string;
    email: string;
    role: 'qa' | 'engineer';
    title: string;
}

interface LeaveData {
    [accountId: string]: number;
}

interface Holiday {
    holiday_date: string;
    holiday_name: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CapacityPlanningPage() {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);

    // Forecast state
    const [forecastData, setForecastData] = useState<ForecastData | null>(null);
    const [adjustments, setAdjustments] = useState<CapacityAdjustment[]>([]);
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastError, setForecastError] = useState<string | null>(null);
    const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
    const [editingAdjustment, setEditingAdjustment] = useState<CapacityAdjustment | null>(null);
    const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<number>>(new Set());

    // Leave modal state
    const [leaveModalOpen, setLeaveModalOpen] = useState(false);
    const [leaveModalSprintId, setLeaveModalSprintId] = useState<number | null>(null);
    const [leaveModalSprintName, setLeaveModalSprintName] = useState('');
    const [sprintHolidays, setSprintHolidays] = useState<Holiday[]>([]);
    const [leaveData, setLeaveData] = useState<LeaveData>({});
    const [originalLeaveData, setOriginalLeaveData] = useState<LeaveData>({});
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [leaveError, setLeaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

    const toggleBreakdown = (sprintId: number) => {
        setExpandedBreakdowns(prev => {
            const next = new Set(prev);
            if (next.has(sprintId)) next.delete(sprintId);
            else next.add(sprintId);
            return next;
        });
    };

    const fetchForecast = useCallback(async () => {
        if (!selectedBoardId) return;
        try {
            setForecastLoading(true);
            setForecastError(null);
            const response = await fetch(`/api/planning/forecast?boardId=${selectedBoardId}&months=6`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            setForecastData(result.data);
        } catch (err) {
            setForecastError(err instanceof Error ? err.message : 'Failed to load forecast');
        } finally {
            setForecastLoading(false);
        }
    }, [selectedBoardId]);

    const fetchAdjustments = useCallback(async () => {
        if (!selectedBoardId) return;
        try {
            const response = await fetch(`/api/capacity?boardId=${selectedBoardId}`);
            const result = await response.json();
            if (result.success) setAdjustments(result.data);
        } catch (err) {
            console.error('Failed to fetch adjustments:', err);
        }
    }, [selectedBoardId]);

    useEffect(() => {
        if (selectedBoardId) {
            fetchForecast();
            fetchAdjustments();
            fetchTeamMembers(selectedBoardId);
        }
    }, [selectedBoardId, fetchForecast, fetchAdjustments]);

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
            body: JSON.stringify({ ...adjustment, boardId: selectedBoardId }),
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        await fetchForecast();
        await fetchAdjustments();
        setEditingAdjustment(null);
    };

    const handleDeleteAdjustment = async (id: number) => {
        if (!confirm('Are you sure you want to delete this adjustment?')) return;
        try {
            const response = await fetch(`/api/capacity?id=${id}`, { method: 'DELETE' });
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            await fetchForecast();
            await fetchAdjustments();
        } catch (err) {
            console.error('Failed to delete adjustment:', err);
        }
    };

    const fetchTeamMembers = async (boardId: number) => {
        try {
            const response = await fetch(`/api/team-members?boardId=${boardId}`);
            const result = await response.json();
            if (result.success && result.data?.teams?.length > 0) {
                const members: TeamMember[] = [];
                for (const team of result.data.teams) {
                    for (const member of team.members) {
                        members.push({
                            accountId: member.accountId,
                            name: member.name,
                            email: member.email,
                            role: member.role as 'qa' | 'engineer',
                            title: member.title,
                        });
                    }
                }
                setTeamMembers(members);
            } else {
                setTeamMembers([]);
            }
        } catch (err) {
            console.error('Failed to fetch team members:', err);
            setTeamMembers([]);
        }
    };

    // ─── Leave modal handlers ─────────────────────────────────────────

    const openLeaveModal = async (sprintId: number, sprintName: string) => {
        setLeaveModalSprintId(sprintId);
        setLeaveModalSprintName(sprintName);
        setLeaveModalOpen(true);
        setLeaveError(null);
        setSaveSuccess(false);
        setLeaveLoading(true);

        try {
            const response = await fetch(`/api/leave?sprintId=${sprintId}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            setLeaveData(result.data || {});
            setOriginalLeaveData(result.data || {});

            const sprintRes = await fetch(`/api/sprint/${sprintId}`);
            const sprintResult = await sprintRes.json();
            if (sprintResult.success && sprintResult.data?.startDate && sprintResult.data?.endDate) {
                const holidayRes = await fetch(`/api/holidays?startDate=${sprintResult.data.startDate}&endDate=${sprintResult.data.endDate}`);
                const holidayResult = await holidayRes.json();
                setSprintHolidays(holidayResult.success ? holidayResult.data : []);
            } else {
                setSprintHolidays([]);
            }
        } catch (err) {
            setLeaveError(err instanceof Error ? err.message : 'Failed to load leave data');
            setLeaveData({});
            setOriginalLeaveData({});
            setSprintHolidays([]);
        } finally {
            setLeaveLoading(false);
        }
    };

    const closeLeaveModal = () => {
        setLeaveModalOpen(false);
        setLeaveModalSprintId(null);
        setLeaveModalSprintName('');
        setLeaveData({});
        setOriginalLeaveData({});
        setSprintHolidays([]);
        setLeaveError(null);
        setSaveSuccess(false);
    };

    const updateLeave = (accountId: string, delta: number) => {
        setLeaveData((prev) => ({ ...prev, [accountId]: Math.max(0, (prev[accountId] || 0) + delta) }));
        setSaveSuccess(false);
    };

    const setLeaveValue = (accountId: string, value: number) => {
        setLeaveData((prev) => ({ ...prev, [accountId]: Math.max(0, value) }));
        setSaveSuccess(false);
    };

    const toggleExclude = (accountId: string) => {
        setLeaveData((prev) => ({ ...prev, [accountId]: prev[accountId] === -1 ? 0 : -1 }));
        setSaveSuccess(false);
    };

    const handleSaveLeave = async () => {
        if (!leaveModalSprintId) return;
        try {
            setSaving(true);
            setLeaveError(null);
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sprintId: leaveModalSprintId, leaveData }),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            setOriginalLeaveData(leaveData);
            setSaveSuccess(true);
            fetchForecast();
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            setLeaveError(err instanceof Error ? err.message : 'Failed to save leave data');
        } finally {
            setSaving(false);
        }
    };

    const hasLeaveChanges = JSON.stringify(leaveData) !== JSON.stringify(originalLeaveData);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // ─── Render ───────────────────────────────────────────────────────

    return (
        <div className="min-h-screen overflow-x-hidden">
            {/* Header */}
            <header className="border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-40">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground mb-1">Capacity Planning</h1>
                            <p className="text-muted-foreground text-sm">Forecast sprint capacity, manage leave & availability</p>
                        </div>
                        {selectedBoardId && (
                            <button
                                onClick={() => { setEditingAdjustment(null); setAdjustmentModalOpen(true); }}
                                className="px-4 py-2 bg-foreground hover:bg-foreground/90 text-background font-medium rounded-xl transition-all flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                Add Adjustment
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full">
                {/* Board Selector */}
                <div className="mb-8">
                    <label className="block text-sm font-semibold text-muted-foreground mb-3">Select Board</label>
                    <BoardSelector onBoardChange={setSelectedBoardId} selectedBoardId={selectedBoardId} />
                </div>

                {/* Loading */}
                {forecastLoading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                )}

                {/* Error */}
                {forecastError && !forecastLoading && (
                    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl">
                        <p className="text-red-400">{forecastError}</p>
                    </div>
                )}

                {/* Forecast Data */}
                {forecastData && !forecastLoading && (
                    <div className="space-y-8">
                        {/* Summary */}
                        <div className="p-6 bg-muted/50 border border-border rounded-2xl backdrop-blur-sm">
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>
                                {forecastData.teamName} - Sprint Forecast
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Showing {forecastData.sprints.length} upcoming sprints with capacity projections
                            </p>
                        </div>

                        {/* Active Adjustments */}
                        {adjustments.length > 0 && (
                            <div className="bg-muted/30 border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>
                                    Active Capacity Adjustments
                                    <span className="text-sm font-normal text-muted-foreground">({adjustments.length})</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {adjustments.map((adj) => (
                                        <div key={adj.id} className="bg-muted/30 border border-border rounded-xl p-4 hover:border-blue-500/30 transition-all group">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="font-medium text-foreground">{adj.engineerName}</div>
                                                <div className={`text-lg font-bold ${adj.capacityPercentage === 0 ? 'text-red-400' : adj.capacityPercentage < 50 ? 'text-orange-400' : adj.capacityPercentage < 100 ? 'text-yellow-400' : 'text-green-400'}`}>
                                                    {adj.capacityPercentage}%
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground mb-2">
                                                {formatDate(adj.startDate)} - {formatDate(adj.endDate)}
                                            </div>
                                            <div className="text-sm text-muted-foreground capitalize mb-3">
                                                {adj.reason.replace('-', ' ')}
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setEditingAdjustment(adj); setAdjustmentModalOpen(true); }}
                                                    className="flex-1 text-xs px-2 py-1 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors"
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
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth={2.5} /></svg>
                                Sprint Timeline
                            </h3>
                            {forecastData.sprints.map((sprint, index) => {
                                const cap = sprint.capacity;
                                const capacityPct = Math.round((cap.effectiveEngineers / cap.totalEngineers) * 100);
                                const leaveMdLoss = cap.totalLeaveDays;
                                const adjMdLoss = cap.adjustmentLoss;
                                const holidayMdLoss = cap.holidayCount * cap.totalEngineers;
                                const usedPct = cap.totalPossibleManDays > 0 ? (cap.totalManDays / cap.totalPossibleManDays) * 100 : 0;

                                return (
                                <div
                                    key={sprint.sprintId}
                                    className={`bg-muted/30 border rounded-2xl backdrop-blur-sm transition-all overflow-hidden ${
                                        index === 0 ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-border hover:border-blue-500/30'
                                    }`}
                                >
                                    <div className={`h-1 ${index === 0 ? 'bg-blue-500' : 'bg-border'}`} />
                                    <div className="p-4 md:p-5">
                                        {/* Sprint Card Header */}
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    {index === 0 && (
                                                        <span className="shrink-0 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-semibold rounded-full uppercase tracking-wide">Current</span>
                                                    )}
                                                    <h3 className="text-base font-bold text-foreground truncate">{sprint.sprintName}</h3>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(sprint.startDate)} &ndash; {formatDate(sprint.endDate)} &middot; {cap.workingDays} working days
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {/* Manage Leave button */}
                                                <button
                                                    onClick={() => openLeaveModal(sprint.sprintId, sprint.sprintName)}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/20 transition-colors flex items-center gap-1.5"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>
                                                    Manage Leave
                                                </button>
                                                <div className="text-right">
                                                    <div className={`text-2xl font-bold leading-none ${capacityPct >= 90 ? 'text-green-500' : capacityPct >= 75 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                        {capacityPct}%
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">capacity</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="grid grid-cols-4 gap-2 mb-3">
                                            <div className="bg-muted/40 rounded-lg px-3 py-2">
                                                <div className="text-lg font-bold text-blue-500">{cap.totalManDays}</div>
                                                <div className="text-[10px] text-muted-foreground leading-tight">Avail. Mandays</div>
                                            </div>
                                            <div className="bg-muted/40 rounded-lg px-3 py-2">
                                                <div className="text-lg font-bold text-foreground">{cap.effectiveEngineers}</div>
                                                <div className="text-[10px] text-muted-foreground leading-tight">Eff. Engineers</div>
                                            </div>
                                            <div className="bg-muted/40 rounded-lg px-3 py-2">
                                                <div className="text-lg font-bold text-foreground">{cap.totalEngineers}</div>
                                                <div className="text-[10px] text-muted-foreground leading-tight">Total Members</div>
                                            </div>
                                            <div className="bg-muted/40 rounded-lg px-3 py-2">
                                                <div className="text-lg font-bold text-foreground">{cap.forecastedPoints}</div>
                                                <div className="text-[10px] text-muted-foreground leading-tight">Est. Points</div>
                                            </div>
                                        </div>

                                        {/* Capacity Breakdown */}
                                        <div className="bg-muted/30 rounded-lg mb-3 overflow-hidden">
                                            <button
                                                onClick={() => toggleBreakdown(sprint.sprintId)}
                                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBreakdowns.has(sprint.sprintId) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Capacity Breakdown</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs tabular-nums">
                                                    <span className="text-muted-foreground">{cap.totalPossibleManDays} md</span>
                                                    <span className="text-muted-foreground">&rarr;</span>
                                                    <span className="font-bold text-blue-500">{cap.totalManDays} md</span>
                                                </div>
                                            </button>
                                            {expandedBreakdowns.has(sprint.sprintId) && (
                                            <div className="px-3 pb-3 space-y-1 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Total capacity ({cap.weekdaysInSprint}d &times; {cap.totalEngineers} eng)</span>
                                                    <span className="font-semibold text-foreground tabular-nums">{cap.totalPossibleManDays} md</span>
                                                </div>
                                                {cap.holidayCount > 0 && (
                                                    <>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-amber-500">Holidays ({cap.holidayCount}d &times; {cap.totalEngineers} eng)</span>
                                                        <span className="font-semibold text-amber-500 tabular-nums">&minus;{holidayMdLoss} md</span>
                                                    </div>
                                                    {sprint.holidays && sprint.holidays.length > 0 && (
                                                        <div className="text-[11px] text-muted-foreground leading-relaxed pl-4">
                                                            {sprint.holidays.map((h, i) => (
                                                                <span key={i}>{i > 0 && ', '}<span className="text-foreground/70">{formatDate(h.date)}</span> {h.name}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    </>
                                                )}
                                                {leaveMdLoss > 0 && (
                                                    <>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-orange-500">Team leave ({leaveMdLoss}d total)</span>
                                                        <span className="font-semibold text-orange-500 tabular-nums">&minus;{leaveMdLoss} md</span>
                                                    </div>
                                                    {sprint.leaves && sprint.leaves.length > 0 && (
                                                        <div className="text-[11px] text-muted-foreground leading-relaxed pl-4">
                                                            {sprint.leaves.map((l, i) => (
                                                                <span key={i}>{i > 0 && ', '}<span className="text-foreground/70">{l.name}</span> <span className="font-semibold text-orange-500">{l.leaveDays}d</span></span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    </>
                                                )}
                                                {adjMdLoss > 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-purple-500">Capacity adjustments</span>
                                                        <span className="font-semibold text-purple-500 tabular-nums">&minus;{adjMdLoss} md</span>
                                                    </div>
                                                )}
                                                {(sprint.excludedMembers && sprint.excludedMembers.length > 0) && (
                                                    <>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-red-500">Excluded ({sprint.excludedMembers.length} members)</span>
                                                        <span className="font-semibold text-red-500 tabular-nums">&minus;{sprint.excludedMembers.length * cap.workingDays} md</span>
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground leading-relaxed pl-4">
                                                        {sprint.excludedMembers.map((m, i) => (
                                                            <span key={i}>{i > 0 && ', '}<span className="text-foreground/70">{m.name}</span></span>
                                                        ))}
                                                    </div>
                                                    </>
                                                )}
                                                <div className="flex justify-between items-center pt-1.5 mt-1.5 border-t border-border">
                                                    <span className="font-semibold text-foreground">Available mandays</span>
                                                    <span className="font-bold text-blue-500 tabular-nums">{cap.totalManDays} md</span>
                                                </div>

                                                {sprint.engineers.some(e => !e.excluded && (e.capacity < 100 || e.reason)) && (
                                                    <div className="pt-2.5 mt-2.5 border-t border-border">
                                                        <div className="flex items-center gap-1.5 mb-1.5">
                                                            <svg className="w-3.5 h-3.5 text-purple-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                                            <span className="text-[11px] font-semibold text-muted-foreground">Adjustments</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {sprint.engineers
                                                                .filter(e => !e.excluded && (e.capacity < 100 || e.reason))
                                                                .map((engineer) => (
                                                                    <span key={engineer.accountId} className="inline-flex items-center gap-1.5 text-[11px] bg-muted/40 rounded-md px-2 py-1">
                                                                        <span className="text-foreground/70">{engineer.name}</span>
                                                                        <span className={`font-semibold ${engineer.capacity < 50 ? 'text-red-500' : 'text-yellow-500'}`}>
                                                                            {engineer.capacity}%
                                                                        </span>
                                                                        {engineer.reason && (
                                                                            <span className="text-muted-foreground capitalize">({engineer.reason.replace('-', ' ')})</span>
                                                                        )}
                                                                    </span>
                                                                ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            )}
                                            {/* Visual bar */}
                                            <div className="mx-3 mb-2.5 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${capacityPct >= 90 ? 'bg-green-500' : capacityPct >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                    style={{ width: `${Math.min(usedPct, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Planned Stories */}
                                        {sprint.stories && sprint.stories.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-border">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                                        Planned Stories ({sprint.stories.length})
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground tabular-nums">
                                                        {sprint.stories.reduce((sum: number, s: { storyPoints: number }) => sum + s.storyPoints, 0)} SP total
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    {sprint.stories.map((story) => (
                                                        <div key={story.key} className="flex items-center gap-2 text-xs py-1 px-2 rounded-md hover:bg-muted/30 transition-colors">
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                                story.statusCategory === 'Done' ? 'bg-green-500' :
                                                                story.statusCategory === 'In Progress' ? 'bg-blue-500' :
                                                                'bg-muted-foreground/40'
                                                            }`} />
                                                            <span className="text-blue-500 font-mono text-[11px] shrink-0">{story.key}</span>
                                                            <span className="text-foreground/80 truncate flex-1">{story.summary}</span>
                                                            {story.assignee && (
                                                                <span className="text-muted-foreground text-[11px] shrink-0 max-w-[100px] truncate">{story.assignee}</span>
                                                            )}
                                                            {story.storyPoints > 0 && (
                                                                <span className="text-foreground font-semibold text-[11px] shrink-0 tabular-nums">{story.storyPoints} SP</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>

                        {forecastData.sprints.length === 0 && (
                            <div className="p-8 bg-muted/30 border border-border rounded-2xl text-center">
                                <p className="text-muted-foreground">No upcoming sprints found for this board</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Empty state */}
                {!selectedBoardId && !forecastLoading && (
                    <div className="p-12 bg-muted/30 border border-border rounded-2xl text-center">
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
                isOpen={adjustmentModalOpen}
                onClose={() => { setAdjustmentModalOpen(false); setEditingAdjustment(null); }}
                onSave={handleSaveAdjustment}
                engineers={forecastData?.engineers || []}
                adjustment={editingAdjustment}
            />

            {/* Sprint Leave Modal */}
            {leaveModalOpen && (
                <SprintLeaveModal
                    sprintName={leaveModalSprintName}
                    loading={leaveLoading}
                    error={leaveError}
                    saveSuccess={saveSuccess}
                    teamMembers={teamMembers}
                    leaveData={leaveData}
                    sprintHolidays={sprintHolidays}
                    hasChanges={hasLeaveChanges}
                    saving={saving}
                    onUpdateLeave={updateLeave}
                    onSetLeave={setLeaveValue}
                    onToggleExclude={toggleExclude}
                    onSave={handleSaveLeave}
                    onClose={closeLeaveModal}
                />
            )}
        </div>
    );
}

// ─── Sprint Leave Modal ───────────────────────────────────────────────────────

function SprintLeaveModal({
    sprintName, loading, error, saveSuccess,
    teamMembers, leaveData, sprintHolidays,
    hasChanges, saving,
    onUpdateLeave, onSetLeave, onToggleExclude, onSave, onClose,
}: {
    sprintName: string;
    loading: boolean;
    error: string | null;
    saveSuccess: boolean;
    teamMembers: TeamMember[];
    leaveData: LeaveData;
    sprintHolidays: Holiday[];
    hasChanges: boolean;
    saving: boolean;
    onUpdateLeave: (accountId: string, delta: number) => void;
    onSetLeave: (accountId: string, value: number) => void;
    onToggleExclude: (accountId: string) => void;
    onSave: () => void;
    onClose: () => void;
}) {
    const engineers = teamMembers.filter(m => m.role === 'engineer');
    const qa = teamMembers.filter(m => m.role === 'qa');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl flex flex-col mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Manage Sprint Leave</h2>
                        <p className="text-sm text-muted-foreground">{sprintName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-2 text-xs">
                            <span className="px-2 py-1 rounded-md bg-orange-500/10 text-orange-500 font-medium">
                                {teamMembers.reduce((sum, m) => { const d = leaveData[m.accountId] || 0; return sum + (d > 0 ? d : 0); }, 0)} leave days
                            </span>
                            {teamMembers.filter(m => leaveData[m.accountId] === -1).length > 0 && (
                                <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 font-medium">
                                    {teamMembers.filter(m => leaveData[m.accountId] === -1).length} excluded
                                </span>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                    {loading && (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-10 h-10 border-3 border-muted border-t-foreground rounded-full animate-spin" />
                        </div>
                    )}

                    {error && !loading && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {saveSuccess && (
                        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                            <p className="text-green-400 text-sm">Leave data saved successfully!</p>
                        </div>
                    )}

                    {!loading && teamMembers.length > 0 && (
                        <>
                            {engineers.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                        Engineers ({engineers.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {engineers.map((member) => (
                                            <MemberLeaveRow
                                                key={member.accountId}
                                                member={member}
                                                leaveDays={leaveData[member.accountId] ?? 0}
                                                onUpdate={(delta) => onUpdateLeave(member.accountId, delta)}
                                                onSet={(value) => onSetLeave(member.accountId, value)}
                                                onToggleExclude={() => onToggleExclude(member.accountId)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {qa.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-indigo-400 mb-3 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                        QA ({qa.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {qa.map((member) => (
                                            <MemberLeaveRow
                                                key={member.accountId}
                                                member={member}
                                                leaveDays={leaveData[member.accountId] ?? 0}
                                                onUpdate={(delta) => onUpdateLeave(member.accountId, delta)}
                                                onSet={(value) => onSetLeave(member.accountId, value)}
                                                onToggleExclude={() => onToggleExclude(member.accountId)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {sprintHolidays.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        Holidays ({sprintHolidays.length})
                                    </h3>
                                    <div className="space-y-1">
                                        {sprintHolidays.map((holiday, idx) => (
                                            <div key={idx} className="flex justify-between text-sm items-center py-1.5 px-3 rounded-lg bg-muted/30 text-foreground/70">
                                                <span className="font-medium text-xs">{holiday.holiday_name}</span>
                                                <span className="text-muted-foreground text-xs">{new Date(holiday.holiday_date).toLocaleDateString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        >
                            Cancel
                        </button>
                        <Link
                            href="/organisation/leaves"
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                        >
                            View full leave history
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                        </Link>
                    </div>
                    <button
                        onClick={onSave}
                        disabled={saving || !hasChanges}
                        className="px-6 py-2 bg-foreground text-background font-semibold rounded-xl hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            hasChanges ? 'Save Changes' : 'No Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Member Leave Row ─────────────────────────────────────────────────────────

function MemberLeaveRow({
    member, leaveDays, onUpdate, onSet, onToggleExclude,
}: {
    member: TeamMember;
    leaveDays: number;
    onUpdate: (delta: number) => void;
    onSet: (value: number) => void;
    onToggleExclude: () => void;
}) {
    const isExcluded = leaveDays === -1;

    return (
        <div className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${isExcluded ? 'bg-red-900/10 border-red-500/30 opacity-60' : 'bg-muted/20 border-border'}`}>
            <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{member.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{member.title}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {isExcluded ? (
                    <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-md">
                        EXCLUDED
                    </span>
                ) : (
                    <>
                        <button
                            onClick={() => onUpdate(-1)}
                            className="w-7 h-7 rounded-md bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center transition-colors text-sm"
                        >
                            &minus;
                        </button>
                        <input
                            type="number"
                            min="0"
                            value={leaveDays}
                            onChange={(e) => onSet(parseInt(e.target.value) || 0)}
                            className="w-12 px-1 py-0.5 text-center text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-[11px] text-muted-foreground w-8">day{leaveDays !== 1 ? 's' : ''}</span>
                        <button
                            onClick={() => onUpdate(1)}
                            className="w-7 h-7 rounded-md bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center transition-colors text-sm"
                        >
                            +
                        </button>
                    </>
                )}
                <button
                    onClick={onToggleExclude}
                    title={isExcluded ? 'Include in sprint' : 'Exclude from sprint'}
                    className={`ml-1 w-7 h-7 rounded-md flex items-center justify-center transition-colors text-xs ${isExcluded
                        ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
                        : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                    }`}
                >
                    {isExcluded ? '\u2713' : '\u2715'}
                </button>
            </div>
        </div>
    );
}
