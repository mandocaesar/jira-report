'use client';

import { useState, useEffect, useCallback } from 'react';

interface Board {
    id: number;
    name: string;
}

interface SyncMember {
    accountId: string;
    displayName?: string;
    name?: string;
    email: string;
    role?: string;
    title?: string;
}

interface SyncResult {
    sprintId: number;
    teamId: string;
    teamName: string;
    totalJiraAssignees: number;
    totalRosterMembers: number;
    toAdd: SyncMember[];
    missingFromSprint: SyncMember[];
    matched: SyncMember[];
    applied: boolean;
    addedCount: number;
}

interface Member {
    id: string;
    accountId: string;
    name: string;
    email: string;
    role: string;
    title: string;
    teamId: string;
}

interface Team {
    id: string;
    name: string;
    boardId: number;
    reportEmailGroup?: string;
    isSchedulingEnabled?: boolean;
    members: Member[];
}

export default function TeamManagementPage() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // New team form
    const [showNewTeam, setShowNewTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamBoardId, setNewTeamBoardId] = useState('');

    // New member form
    const [addingMemberTeamId, setAddingMemberTeamId] = useState<string | null>(null);
    const [newMember, setNewMember] = useState({ accountId: '', name: '', email: '', role: 'engineer', title: 'Associate' });

    // Edit member
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
    const [editMember, setEditMember] = useState({ name: '', email: '', role: '', title: '' });

    // Team Settings
    const [editingTeamSettingsId, setEditingTeamSettingsId] = useState<string | null>(null);
    const [editTeamSettings, setEditTeamSettings] = useState({ reportEmailGroup: '', isSchedulingEnabled: false });

    // Sync from Jira
    const [showSync, setShowSync] = useState(false);
    const [boards, setBoards] = useState<Board[]>([]);
    const [syncBoardId, setSyncBoardId] = useState<string>('');
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [applying, setApplying] = useState(false);

    const fetchTeams = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/settings/teams');
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setTeams(result.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load teams');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTeams(); }, [fetchTeams]);

    // Fetch boards for sync selector
    useEffect(() => {
        if (showSync && boards.length === 0) {
            fetch('/api/boards')
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.data) {
                        setBoards(Array.isArray(data.data) ? data.data : data.data.values || []);
                    }
                })
                .catch(() => { });
        }
    }, [showSync, boards.length]);

    const handleSync = async () => {
        if (!syncBoardId) return;
        try {
            setSyncing(true);
            setSyncError(null);
            setSyncResult(null);
            const res = await fetch('/api/settings/teams/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boardId: parseInt(syncBoardId) }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setSyncResult(result.data);
        } catch (err) {
            setSyncError(err instanceof Error ? err.message : 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const handleApplySync = async () => {
        if (!syncBoardId) return;
        try {
            setApplying(true);
            const res = await fetch('/api/settings/teams/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boardId: parseInt(syncBoardId), apply: true }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            showSuccess(`Added ${result.data.addedCount} members to ${result.data.teamName}`);
            setSyncResult(null);
            setShowSync(false);
            fetchTeams();
        } catch (err) {
            setSyncError(err instanceof Error ? err.message : 'Apply failed');
        } finally {
            setApplying(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    // --- Team CRUD ---
    const handleCreateTeam = async () => {
        if (!newTeamName || !newTeamBoardId) return;
        try {
            const res = await fetch('/api/settings/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTeamName, boardId: parseInt(newTeamBoardId) }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setNewTeamName('');
            setNewTeamBoardId('');
            setShowNewTeam(false);
            showSuccess('Team created');
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create team');
        }
    };

    const handleDeleteTeam = async (teamId: string, teamName: string) => {
        if (!confirm(`Delete team "${teamName}" and all its members?`)) return;
        try {
            const res = await fetch('/api/settings/teams', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: teamId }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            showSuccess('Team deleted');
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete team');
        }
    };

    const handleUpdateTeamSettings = async (teamId: string) => {
        try {
            const res = await fetch('/api/settings/teams', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: teamId, ...editTeamSettings }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setEditingTeamSettingsId(null);
            showSuccess('Team settings updated');
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update team settings');
        }
    };

    // --- Member CRUD ---
    const handleAddMember = async (teamId: string) => {
        if (!newMember.accountId || !newMember.name || !newMember.email) return;
        try {
            const res = await fetch('/api/settings/teams/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId, ...newMember }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setNewMember({ accountId: '', name: '', email: '', role: 'engineer', title: 'Associate' });
            setAddingMemberTeamId(null);
            showSuccess('Member added');
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add member');
        }
    };

    const handleUpdateMember = async (memberId: string) => {
        try {
            const res = await fetch('/api/settings/teams/members', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: memberId, ...editMember }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setEditingMemberId(null);
            showSuccess('Member updated');
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update member');
        }
    };

    const handleDeleteMember = async (memberId: string, memberName: string) => {
        if (!confirm(`Remove "${memberName}" from team?`)) return;
        try {
            const res = await fetch('/api/settings/teams/members', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: memberId }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            showSuccess('Member removed');
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove member');
        }
    };

    const startEditMember = (member: Member) => {
        setEditingMemberId(member.id);
        setEditMember({ name: member.name, email: member.email, role: member.role, title: member.title });
    };

    // --- Seed ---
    const [seeding, setSeeding] = useState(false);
    const handleSeed = async () => {
        if (!confirm('Import team data from config file? This will update existing entries.')) return;
        try {
            setSeeding(true);
            const res = await fetch('/api/settings/seed', { method: 'POST' });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            showSuccess(result.message);
            fetchTeams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to seed data');
        } finally {
            setSeeding(false);
        }
    };

    const titleOptions = ['Tech Lead', 'EM', 'Sec Head', 'Associate', 'QA'];

    return (
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900">
            <header className="border-b border-blue-500/20 bg-gray-900/50 backdrop-blur-xl">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
                                <span className="text-2xl">👥</span>
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
                                    Team Management
                                </h1>
                                <p className="text-gray-400 text-sm">Add, edit, and remove teams and members</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => { setShowSync(!showSync); setSyncResult(null); setSyncError(null); }}
                                className="px-4 py-2 text-sm bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-all"
                            >
                                🔄 Sync from Jira
                            </button>
                            <button
                                onClick={handleSeed}
                                disabled={seeding}
                                className="px-4 py-2 text-sm bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 disabled:opacity-50 transition-all"
                            >
                                {seeding ? '⏳ Importing...' : '📥 Seed from Config'}
                            </button>
                            <button
                                onClick={() => setShowNewTeam(true)}
                                className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all"
                            >
                                + New Team
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full space-y-6">
                {/* Status Messages */}
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
                        ✓ {success}
                    </div>
                )}

                {/* Sync from Jira Panel */}
                {showSync && (
                    <div className="p-6 bg-gray-800/50 border border-cyan-500/30 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">🔄 Sync Team from Jira Sprint</h3>
                            <button onClick={() => { setShowSync(false); setSyncResult(null); }} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <p className="text-sm text-gray-400">Select a board to compare its latest sprint assignees with your team roster.</p>

                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 mb-1">Board</label>
                                <select
                                    value={syncBoardId}
                                    onChange={(e) => { setSyncBoardId(e.target.value); setSyncResult(null); }}
                                    className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                                >
                                    <option value="">Select a board...</option>
                                    {boards.map(b => <option key={b.id} value={b.id}>{b.name} (#{b.id})</option>)}
                                </select>
                            </div>
                            <button
                                onClick={handleSync}
                                disabled={!syncBoardId || syncing}
                                className="px-5 py-3 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 disabled:opacity-50 transition-all"
                            >
                                {syncing ? '⏳ Checking...' : '🔍 Preview Sync'}
                            </button>
                        </div>

                        {syncError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{syncError}</div>
                        )}

                        {/* Sync Results */}
                        {syncResult && (
                            <div className="space-y-4 pt-2">
                                {/* Summary */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-green-400">{syncResult.matched.length}</p>
                                        <p className="text-xs text-green-300/70">Matched</p>
                                    </div>
                                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-cyan-400">{syncResult.toAdd.length}</p>
                                        <p className="text-xs text-cyan-300/70">To Add</p>
                                    </div>
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-amber-400">{syncResult.missingFromSprint.length}</p>
                                        <p className="text-xs text-amber-300/70">Not in Sprint</p>
                                    </div>
                                </div>

                                {/* Members to Add */}
                                {syncResult.toAdd.length > 0 && (
                                    <div className="bg-cyan-900/10 border border-cyan-500/20 rounded-xl p-4">
                                        <h4 className="text-sm font-semibold text-cyan-300 mb-2">➕ New members to add to {syncResult.teamName}</h4>
                                        <div className="space-y-1">
                                            {syncResult.toAdd.map(m => (
                                                <div key={m.accountId} className="flex items-center gap-3 py-1.5 px-3 bg-cyan-500/5 rounded text-sm">
                                                    <span className="text-cyan-300">•</span>
                                                    <span className="text-white">{m.displayName || m.name}</span>
                                                    <span className="text-gray-500 text-xs">{m.email || 'no email'}</span>
                                                    <span className="text-xs text-gray-500 ml-auto font-mono">{m.accountId.slice(0, 20)}...</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Members missing from sprint (flagged, not removed) */}
                                {syncResult.missingFromSprint.length > 0 && (
                                    <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl p-4">
                                        <h4 className="text-sm font-semibold text-amber-300 mb-1">⚠️ Roster members with no issues in this sprint</h4>
                                        <p className="text-xs text-gray-500 mb-2">These members won&apos;t be removed — they may be on leave or unassigned.</p>
                                        <div className="space-y-1">
                                            {syncResult.missingFromSprint.map(m => (
                                                <div key={m.accountId} className="flex items-center gap-3 py-1.5 px-3 bg-amber-500/5 rounded text-sm">
                                                    <span className="text-amber-300">•</span>
                                                    <span className="text-white">{m.name}</span>
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${m.role === 'qa' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-blue-500/20 text-blue-300'}`}>{m.role}</span>
                                                    <span className="text-gray-500 text-xs">{m.title}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action buttons */}
                                {syncResult.toAdd.length > 0 && (
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={handleApplySync}
                                            disabled={applying}
                                            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 transition-all font-semibold"
                                        >
                                            {applying ? '⏳ Adding...' : `✓ Add ${syncResult.toAdd.length} Member${syncResult.toAdd.length > 1 ? 's' : ''}`}
                                        </button>
                                        <button onClick={() => setSyncResult(null)} className="px-5 py-2 text-gray-400 border border-gray-700 rounded-lg hover:text-white transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                )}

                                {syncResult.toAdd.length === 0 && (
                                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                                        <p className="text-green-400 font-semibold">✓ Team roster is in sync with Jira!</p>
                                        <p className="text-xs text-gray-400 mt-1">All {syncResult.matched.length} sprint assignees are in the roster.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* New Team Form */}
                {showNewTeam && (
                    <div className="p-6 bg-gray-800/50 border border-blue-500/30 rounded-2xl space-y-4">
                        <h3 className="text-lg font-semibold text-white">Create New Team</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                type="text"
                                placeholder="Team Name"
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                                className="px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                            />
                            <input
                                type="number"
                                placeholder="Jira Board ID"
                                value={newTeamBoardId}
                                onChange={(e) => setNewTeamBoardId(e.target.value)}
                                className="px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleCreateTeam} className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all">
                                Create
                            </button>
                            <button onClick={() => setShowNewTeam(false)} className="px-5 py-2 text-gray-400 border border-gray-700 rounded-lg hover:text-white hover:border-gray-500 transition-all">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Empty state */}
                {!loading && teams.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-24 h-24 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl flex items-center justify-center mb-6">
                            <span className="text-5xl">👥</span>
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">No Teams Yet</h3>
                        <p className="text-gray-400 mb-6">Click &quot;Seed from Config&quot; to import your existing team data, or create a new team.</p>
                    </div>
                )}

                {/* Teams List */}
                {!loading && teams.map((team) => (
                    <div key={team.id} className="bg-gray-800/30 border border-gray-700 rounded-2xl backdrop-blur-sm overflow-hidden">
                        {/* Team Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-gray-800/20">
                            <div>
                                <h2 className="text-xl font-bold text-white">{team.name}</h2>
                                <p className="text-sm text-gray-400">Board ID: {team.boardId} · {team.members.length} members</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        if (editingTeamSettingsId === team.id) {
                                            setEditingTeamSettingsId(null);
                                        } else {
                                            setEditingTeamSettingsId(team.id);
                                            setEditTeamSettings({ reportEmailGroup: team.reportEmailGroup || '', isSchedulingEnabled: team.isSchedulingEnabled || false });
                                        }
                                    }}
                                    className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                                >
                                    ⚙️ Settings
                                </button>
                                <button
                                    onClick={() => { setAddingMemberTeamId(addingMemberTeamId === team.id ? null : team.id); setNewMember({ accountId: '', name: '', email: '', role: 'engineer', title: 'Associate' }); }}
                                    className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                                >
                                    + Add Member
                                </button>
                                <button
                                    onClick={() => handleDeleteTeam(team.id, team.name)}
                                    className="px-3 py-1.5 text-sm bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all"
                                >
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>

                        {/* Team Settings Form */}
                        {editingTeamSettingsId === team.id && (
                            <div className="px-6 py-4 bg-blue-900/10 border-b border-blue-500/20 space-y-3">
                                <h4 className="text-sm font-semibold text-blue-300">Automated Scheduled Reports</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                                        <input
                                            type="checkbox"
                                            id={`schedule-enabled-${team.id}`}
                                            checked={editTeamSettings.isSchedulingEnabled}
                                            onChange={(e) => setEditTeamSettings(p => ({ ...p, isSchedulingEnabled: e.target.checked }))}
                                            className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 bg-gray-700 border-gray-600"
                                        />
                                        <label htmlFor={`schedule-enabled-${team.id}`} className="text-sm text-gray-300 cursor-pointer">
                                            Enable Scheduled Sprint Reporting
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Email Group / Recipients (comma separated)"
                                        value={editTeamSettings.reportEmailGroup}
                                        onChange={(e) => setEditTeamSettings(p => ({ ...p, reportEmailGroup: e.target.value }))}
                                        className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-full"
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={() => handleUpdateTeamSettings(team.id)} className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">Save Settings</button>
                                    <button onClick={() => setEditingTeamSettingsId(null)} className="px-4 py-1.5 text-sm text-gray-400 border border-gray-700 rounded-lg hover:text-white transition-all">Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* Add Member Form */}
                        {addingMemberTeamId === team.id && (
                            <div className="px-6 py-4 bg-blue-900/10 border-b border-blue-500/20 space-y-3">
                                <h4 className="text-sm font-semibold text-blue-300">Add New Member</h4>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    <input
                                        type="text" placeholder="Jira Account ID" value={newMember.accountId}
                                        onChange={(e) => setNewMember(p => ({ ...p, accountId: e.target.value }))}
                                        className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                                    />
                                    <input
                                        type="text" placeholder="Name" value={newMember.name}
                                        onChange={(e) => setNewMember(p => ({ ...p, name: e.target.value }))}
                                        className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                                    />
                                    <input
                                        type="email" placeholder="Email" value={newMember.email}
                                        onChange={(e) => setNewMember(p => ({ ...p, email: e.target.value }))}
                                        className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                                    />
                                    <select value={newMember.role} onChange={(e) => setNewMember(p => ({ ...p, role: e.target.value }))}
                                        className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50">
                                        <option value="engineer">Engineer</option>
                                        <option value="qa">QA</option>
                                    </select>
                                    <select value={newMember.title} onChange={(e) => setNewMember(p => ({ ...p, title: e.target.value }))}
                                        className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50">
                                        {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleAddMember(team.id)} className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">Add</button>
                                    <button onClick={() => setAddingMemberTeamId(null)} className="px-4 py-1.5 text-sm text-gray-400 border border-gray-700 rounded-lg hover:text-white transition-all">Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* Members Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-700/50">
                                        <th className="text-left py-3 px-6 text-xs font-semibold text-gray-400 uppercase">Name</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Email</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Role</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Title</th>
                                        <th className="text-right py-3 px-6 text-xs font-semibold text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {team.members.map((member) => (
                                        <tr key={member.id} className="border-b border-gray-700/30 hover:bg-gray-700/10 transition-colors">
                                            {editingMemberId === member.id ? (
                                                <>
                                                    <td className="py-2 px-6"><input type="text" value={editMember.name} onChange={(e) => setEditMember(p => ({ ...p, name: e.target.value }))} className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm" /></td>
                                                    <td className="py-2 px-4"><input type="email" value={editMember.email} onChange={(e) => setEditMember(p => ({ ...p, email: e.target.value }))} className="w-full px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm" /></td>
                                                    <td className="py-2 px-4">
                                                        <select value={editMember.role} onChange={(e) => setEditMember(p => ({ ...p, role: e.target.value }))} className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm">
                                                            <option value="engineer">Engineer</option>
                                                            <option value="qa">QA</option>
                                                        </select>
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <select value={editMember.title} onChange={(e) => setEditMember(p => ({ ...p, title: e.target.value }))} className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm">
                                                            {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 px-6 text-right">
                                                        <button onClick={() => handleUpdateMember(member.id)} className="text-green-400 hover:text-green-300 text-sm mr-2">✓ Save</button>
                                                        <button onClick={() => setEditingMemberId(null)} className="text-gray-400 hover:text-gray-300 text-sm">✕</button>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="py-3 px-6">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">{member.role === 'qa' ? '🧪' : '💻'}</span>
                                                            <span className="text-white">{member.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-400 text-sm">{member.email}</td>
                                                    <td className="py-3 px-4">
                                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${member.role === 'engineer' ? 'bg-blue-500/20 text-blue-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                                            {member.role === 'engineer' ? 'Engineer' : 'QA'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-300 text-sm">{member.title}</td>
                                                    <td className="py-3 px-6 text-right space-x-2">
                                                        <button onClick={() => startEditMember(member)} className="text-blue-400 hover:text-blue-300 text-sm">✏️</button>
                                                        <button onClick={() => handleDeleteMember(member.id, member.name)} className="text-red-400 hover:text-red-300 text-sm">🗑️</button>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                    {team.members.length === 0 && (
                                        <tr><td colSpan={5} className="py-8 text-center text-gray-500">No members yet</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </main>
        </div>
    );
}
