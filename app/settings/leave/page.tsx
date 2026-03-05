'use client';

import { useState, useEffect } from 'react';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';

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

export default function LeaveManagementPage() {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
    const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
    const [sprintHolidays, setSprintHolidays] = useState<Holiday[]>([]);
    const [leaveData, setLeaveData] = useState<LeaveData>({});
    const [originalLeaveData, setOriginalLeaveData] = useState<LeaveData>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    // Fetch team members from API (DB-first, consistent with utilization calculator)
    useEffect(() => {
        if (selectedBoardId) {
            fetchTeamMembers(selectedBoardId);
        } else {
            setTeamMembers([]);
        }
    }, [selectedBoardId]);

    const fetchTeamMembers = async (boardId: number) => {
        try {
            setLoadingMembers(true);
            const response = await fetch(`/api/team-members?boardId=${boardId}`);
            const result = await response.json();
            if (result.success && result.data?.teams?.length > 0) {
                // Flatten all members from all teams for this board
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
        } finally {
            setLoadingMembers(false);
        }
    };

    // Fetch leave data when sprint is selected
    useEffect(() => {
        if (selectedSprintId) {
            fetchLeaveData(selectedSprintId);
        } else {
            setLeaveData({});
            setOriginalLeaveData({});
        }
    }, [selectedSprintId]);

    const fetchLeaveData = async (sprintId: number) => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`/api/leave?sprintId=${sprintId}`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

            setLeaveData(result.data || {});
            setOriginalLeaveData(result.data || {});

            // Also fetch holidays for this sprint's date range
            // We need to get the sprint object from the selectors, but for now we can rely
            // on the fact that if selectedSprintId is changing, we should try to figure out
            // the dates. Wait, LeaveManagementPage doesn't have the sprint dates natively.
            // Let's rely on fetching it directly from `api/sprints`? Or just wait for the component mount.
            // Wait, I can alter how SprintSelector works or fetch the single Sprint details.
            const sprintRes = await fetch(`/api/sprint/${sprintId}`);
            const sprintResult = await sprintRes.json();

            if (sprintResult.success && sprintResult.data?.startDate && sprintResult.data?.endDate) {
                const holidayRes = await fetch(`/api/holidays?startDate=${sprintResult.data.startDate}&endDate=${sprintResult.data.endDate}`);
                const holidayResult = await holidayRes.json();
                if (holidayResult.success) {
                    setSprintHolidays(holidayResult.data);
                } else {
                    setSprintHolidays([]);
                }
            } else {
                setSprintHolidays([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load leave data');
            setLeaveData({});
            setOriginalLeaveData({});
            setSprintHolidays([]);
        } finally {
            setLoading(false);
        }
    };


    const handleBoardChange = (boardId: number | null) => {
        setSelectedBoardId(boardId);
        setSelectedSprintId(null);
    };

    const handleSprintChange = (sprintId: number | null) => {
        setSelectedSprintId(sprintId);
        setSaveSuccess(false);
    };

    const updateLeave = (accountId: string, delta: number) => {
        setLeaveData((prev) => ({
            ...prev,
            [accountId]: Math.max(0, (prev[accountId] || 0) + delta),
        }));
        setSaveSuccess(false);
    };

    const setLeave = (accountId: string, value: number) => {
        setLeaveData((prev) => ({
            ...prev,
            [accountId]: Math.max(0, value),
        }));
        setSaveSuccess(false);
    };

    const toggleExclude = (accountId: string) => {
        setLeaveData((prev) => ({
            ...prev,
            [accountId]: prev[accountId] === -1 ? 0 : -1,
        }));
        setSaveSuccess(false);
    };

    const handleSave = async () => {
        if (!selectedSprintId) return;

        try {
            setSaving(true);
            setError(null);

            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sprintId: selectedSprintId,
                    leaveData,
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

            setOriginalLeaveData(leaveData);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save leave data');
        } finally {
            setSaving(false);
        }
    };

    // Calculate summary stats (exclude members with -1)
    const totalLeave = teamMembers.reduce(
        (sum, member) => {
            const days = leaveData[member.accountId] || 0;
            return sum + (days > 0 ? days : 0);
        },
        0
    );
    const excludedCount = teamMembers.filter(m => leaveData[m.accountId] === -1).length;
    const engineerLeave = teamMembers
        .filter((m) => m.role === 'engineer')
        .reduce((sum, member) => { const d = leaveData[member.accountId] || 0; return sum + (d > 0 ? d : 0); }, 0);
    const qaLeave = teamMembers
        .filter((m) => m.role === 'qa')
        .reduce((sum, member) => { const d = leaveData[member.accountId] || 0; return sum + (d > 0 ? d : 0); }, 0);

    const hasChanges = JSON.stringify(leaveData) !== JSON.stringify(originalLeaveData);

    return (
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
            {/* Header */}
            <header className="border-b border-purple-500/20 bg-gray-900/50 backdrop-blur-xl">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                                    Sprint Leave Settings
                                </h1>
                                <p className="text-gray-400 text-sm">Manage planned leave per sprint</p>
                            </div>
                        </div>
                        <a
                            href="/"
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-purple-500/50 rounded-lg transition-all duration-200"
                        >
                            ← Back to Dashboard
                        </a>
                    </div>
                </div>
            </header>

            <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full">
                {/* Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-3">📋 Board</label>
                        <BoardSelector onBoardChange={handleBoardChange} selectedBoardId={selectedBoardId} />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-3">🏃 Sprint</label>
                        <SprintSelector
                            onSprintChange={handleSprintChange}
                            selectedSprintId={selectedSprintId}
                            boardId={selectedBoardId}
                        />
                    </div>
                </div>

                {/* Loading State */}
                {(loading || loadingMembers) && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && !loadingMembers && (
                    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl mb-8">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {/* Success Message */}
                {saveSuccess && (
                    <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-2xl mb-8">
                        <p className="text-green-400">✓ Leave data saved successfully!</p>
                    </div>
                )}

                {/* Leave Management */}
                {selectedSprintId && !loading && !loadingMembers && teamMembers.length > 0 && (
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Engineers */}
                            <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6">
                                <h2 className="text-xl font-bold text-blue-400 mb-6 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                    Engineers ({teamMembers.filter((m) => m.role === 'engineer').length})
                                </h2>
                                <div className="space-y-4">
                                    {teamMembers
                                        .filter((m) => m.role === 'engineer')
                                        .map((member) => (
                                            <MemberLeaveRow
                                                key={member.accountId}
                                                member={member}
                                                leaveDays={leaveData[member.accountId] ?? 0}
                                                onUpdate={(delta) => updateLeave(member.accountId, delta)}
                                                onSet={(value) => setLeave(member.accountId, value)}
                                                onToggleExclude={() => toggleExclude(member.accountId)}
                                            />
                                        ))}
                                </div>
                            </div>

                            {/* QA */}
                            <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6">
                                <h2 className="text-xl font-bold text-pink-400 mb-6 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                                    QA ({teamMembers.filter((m) => m.role === 'qa').length})
                                </h2>
                                <div className="space-y-4">
                                    {teamMembers
                                        .filter((m) => m.role === 'qa')
                                        .map((member) => (
                                            <MemberLeaveRow
                                                key={member.accountId}
                                                member={member}
                                                leaveDays={leaveData[member.accountId] ?? 0}
                                                onUpdate={(delta) => updateLeave(member.accountId, delta)}
                                                onSet={(value) => setLeave(member.accountId, value)}
                                                onToggleExclude={() => toggleExclude(member.accountId)}
                                            />
                                        ))}
                                </div>
                            </div>
                        </div>

                        {/* Holidays */}
                        {sprintHolidays.length > 0 && (
                            <div className="bg-purple-900/10 border border-purple-500/30 rounded-2xl p-6">
                                <h2 className="text-lg font-semibold text-purple-300 mb-4 flex items-center gap-2">
                                    <span>🏖️</span>
                                    Excluded Holidays during this Sprint
                                </h2>
                                <div className="space-y-2">
                                    {sprintHolidays.map((holiday, idx) => (
                                        <div key={idx} className="flex justify-between text-sm items-center p-2 rounded-lg bg-gray-800/30 text-gray-300">
                                            <span className="font-medium">{holiday.holiday_name}</span>
                                            <span className="text-gray-500">{new Date(holiday.holiday_date).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Summary */}
                        <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-2xl p-6">
                            <h2 className="text-lg font-semibold text-purple-300 mb-4">📊 Sprint Summary</h2>
                            <div className="grid grid-cols-4 gap-4 text-center">
                                <div>
                                    <div className="text-2xl font-bold text-white">{totalLeave} days</div>
                                    <div className="text-sm text-gray-400">Total Leave</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-blue-400">{engineerLeave} days</div>
                                    <div className="text-sm text-gray-400">Engineers</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-pink-400">{qaLeave} days</div>
                                    <div className="text-sm text-gray-400">QA</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-red-400">{excludedCount}</div>
                                    <div className="text-sm text-gray-400">Excluded</div>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-center">
                            <button
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                        </svg>
                                        {hasChanges ? 'Save Changes' : 'No Changes'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!selectedSprintId && !loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-24 h-24 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl flex items-center justify-center mb-6">
                            <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Select Board and Sprint</h3>
                        <p className="text-gray-400 text-center max-w-md">
                            Choose a board and sprint from the dropdowns above to manage leave days
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

// Member Leave Row Component
function MemberLeaveRow({
    member,
    leaveDays,
    onUpdate,
    onSet,
    onToggleExclude,
}: {
    member: TeamMember;
    leaveDays: number;
    onUpdate: (delta: number) => void;
    onSet: (value: number) => void;
    onToggleExclude: () => void;
}) {
    const isExcluded = leaveDays === -1;

    return (
        <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isExcluded ? 'bg-red-900/10 border-red-500/30 opacity-60' : 'bg-gray-900/30 border-gray-700/50'}`}>
            <div className="flex-1">
                <div className={`font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-white'}`}>{member.name}</div>
                <div className="text-xs text-gray-400">{member.title}</div>
            </div>
            <div className="flex items-center gap-2">
                {isExcluded ? (
                    <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-lg">
                        EXCLUDED
                    </span>
                ) : (
                    <>
                        <button
                            onClick={() => onUpdate(-1)}
                            className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                        >
                            −
                        </button>
                        <input
                            type="number"
                            min="0"
                            value={leaveDays}
                            onChange={(e) => onSet(parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-center bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-sm text-gray-400 w-12">day{leaveDays !== 1 ? 's' : ''}</span>
                        <button
                            onClick={() => onUpdate(1)}
                            className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                        >
                            +
                        </button>
                    </>
                )}
                <button
                    onClick={onToggleExclude}
                    title={isExcluded ? 'Include in sprint' : 'Exclude from sprint'}
                    className={`ml-2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-sm ${isExcluded
                        ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
                        : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                        }`}
                >
                    {isExcluded ? '✓' : '✕'}
                </button>
            </div>
        </div>
    );
}
