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
    workingHoursPerDay?: number | null;
}

interface Team {
    id: string;
    name: string;
    boardId: number;
    workingHoursPerDay: number;
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
    const [editMember, setEditMember] = useState({ name: '', email: '', role: '', title: '', workingHoursPerDay: '' as string });

    // Team Settings
    const [editingTeamSettingsId, setEditingTeamSettingsId] = useState<string | null>(null);
    const [editTeamSettings, setEditTeamSettings] = useState({ reportEmailGroup: '', isSchedulingEnabled: false, workingHoursPerDay: '8' });

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
                body: JSON.stringify({ id: teamId, ...editTeamSettings, workingHoursPerDay: parseFloat(editTeamSettings.workingHoursPerDay) || 8 }),
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
                body: JSON.stringify({ id: memberId, ...editMember, workingHoursPerDay: editMember.workingHoursPerDay === '' ? null : parseFloat(editMember.workingHoursPerDay) }),
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
        setEditMember({ name: member.name, email: member.email, role: member.role, title: member.title, workingHoursPerDay: member.workingHoursPerDay != null ? String(member.workingHoursPerDay) : '' });
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
        <div className="min-h-screen overflow-x-hidden">
            <header className="border-b border-border bg-background/50 backdrop-blur-xl">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-foreground">
                                    Team Management
                                </h1>
                                <p className="text-muted-foreground text-sm">Add, edit, and remove teams and members</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => { setShowSync(!showSync); setSyncResult(null); setSyncError(null); }}
                                className="px-4 py-2 text-sm bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-all"
                            >
                                Sync from Jira
                            </button>
                            <button
                                onClick={handleSeed}
                                disabled={seeding}
                                className="px-4 py-2 text-sm bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 disabled:opacity-50 transition-all"
                            >
                                {seeding ? 'Importing...' : 'Seed from Config'}
                            </button>
                            <button
                                onClick={() => setShowNewTeam(true)}
                                className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all"
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
                    <div className="p-6 bg-muted/30 border border-cyan-500/30 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">Sync Team from Jira Sprint</h3>
                            <button onClick={() => { setShowSync(false); setSyncResult(null); }} className="text-muted-foreground hover:text-foreground">✕</button>
                        </div>
                        <p className="text-sm text-muted-foreground">Select a board to compare its latest sprint assignees with your team roster.</p>

                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-xs text-muted-foreground mb-1">Board</label>
                                <select
                                    value={syncBoardId}
                                    onChange={(e) => { setSyncBoardId(e.target.value); setSyncResult(null); }}
                                    className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-cyan-500/50"
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
                                {syncing ? 'Checking...' : 'Preview Sync'}
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
                                        <h4 className="text-sm font-semibold text-cyan-300 mb-2">New members to add to {syncResult.teamName}</h4>
                                        <div className="space-y-1">
                                            {syncResult.toAdd.map(m => (
                                                <div key={m.accountId} className="flex items-center gap-3 py-1.5 px-3 bg-cyan-500/5 rounded text-sm">
                                                    <span className="text-cyan-300">•</span>
                                                    <span className="text-foreground">{m.displayName || m.name}</span>
                                                    <span className="text-muted-foreground text-xs">{m.email || 'no email'}</span>
                                                    <span className="text-xs text-muted-foreground ml-auto font-mono">{m.accountId.slice(0, 20)}...</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Members missing from sprint (flagged, not removed) */}
                                {syncResult.missingFromSprint.length > 0 && (
                                    <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl p-4">
                                        <h4 className="text-sm font-semibold text-amber-300 mb-1">Roster members with no issues in this sprint</h4>
                                        <p className="text-xs text-muted-foreground mb-2">These members won&apos;t be removed — they may be on leave or unassigned.</p>
                                        <div className="space-y-1">
                                            {syncResult.missingFromSprint.map(m => (
                                                <div key={m.accountId} className="flex items-center gap-3 py-1.5 px-3 bg-amber-500/5 rounded text-sm">
                                                    <span className="text-amber-300">•</span>
                                                    <span className="text-foreground">{m.name}</span>
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${m.role === 'qa' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-blue-500/20 text-blue-300'}`}>{m.role}</span>
                                                    <span className="text-muted-foreground text-xs">{m.title}</span>
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
                                            className="px-5 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-all font-semibold"
                                        >
                                            {applying ? 'Adding...' : `Add ${syncResult.toAdd.length} Member${syncResult.toAdd.length > 1 ? 's' : ''}`}
                                        </button>
                                        <button onClick={() => setSyncResult(null)} className="px-5 py-2 text-muted-foreground border border-border rounded-lg hover:text-foreground transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                )}

                                {syncResult.toAdd.length === 0 && (
                                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                                        <p className="text-green-400 font-semibold">✓ Team roster is in sync with Jira!</p>
                                        <p className="text-xs text-muted-foreground mt-1">All {syncResult.matched.length} sprint assignees are in the roster.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* New Team Form */}
                {showNewTeam && (
                    <div className="p-6 bg-muted/30 border border-border rounded-2xl space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">Create New Team</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                type="text"
                                placeholder="Team Name"
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                            />
                            <input
                                type="number"
                                placeholder="Jira Board ID"
                                value={newTeamBoardId}
                                onChange={(e) => setNewTeamBoardId(e.target.value)}
                                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleCreateTeam} className="px-5 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all">
                                Create
                            </button>
                            <button onClick={() => setShowNewTeam(false)} className="px-5 py-2 text-muted-foreground border border-border rounded-lg hover:text-foreground hover:border-muted-foreground transition-all">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Empty state */}
                {!loading && teams.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-24 h-24 bg-muted rounded-2xl flex items-center justify-center mb-6">
                            <svg className="w-12 h-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                        </div>
                        <h3 className="text-xl font-semibold text-foreground mb-2">No Teams Yet</h3>
                        <p className="text-muted-foreground mb-6">Click &quot;Seed from Config&quot; to import your existing team data, or create a new team.</p>
                    </div>
                )}

                {/* Teams List */}
                {!loading && teams.map((team) => (
                    <div key={team.id} className="bg-muted/30 border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
                        {/* Team Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
                            <div>
                                <h2 className="text-xl font-bold text-foreground">{team.name}</h2>
                                <p className="text-sm text-muted-foreground">Board ID: {team.boardId} · {team.members.length} members · {team.workingHoursPerDay}h/day</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        if (editingTeamSettingsId === team.id) {
                                            setEditingTeamSettingsId(null);
                                        } else {
                                            setEditingTeamSettingsId(team.id);
                                            setEditTeamSettings({ reportEmailGroup: team.reportEmailGroup || '', isSchedulingEnabled: team.isSchedulingEnabled || false, workingHoursPerDay: String(team.workingHoursPerDay || 8) });
                                        }
                                    }}
                                    className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                                >
                                    Settings
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
                                    Delete
                                </button>
                            </div>
                        </div>

                        {/* Team Settings Form */}
                        {editingTeamSettingsId === team.id && (
                            <div className="px-6 py-4 bg-blue-900/10 border-b border-blue-500/20 space-y-3">
                                <h4 className="text-sm font-semibold text-blue-300">Team Settings</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg border border-border">
                                        <input
                                            type="checkbox"
                                            id={`schedule-enabled-${team.id}`}
                                            checked={editTeamSettings.isSchedulingEnabled}
                                            onChange={(e) => setEditTeamSettings(p => ({ ...p, isSchedulingEnabled: e.target.checked }))}
                                            className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 focus:ring-offset-background bg-muted border-border"
                                        />
                                        <label htmlFor={`schedule-enabled-${team.id}`} className="text-sm text-muted-foreground cursor-pointer">
                                            Enable Scheduled Sprint Reporting
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Email Group / Recipients (comma separated)"
                                        value={editTeamSettings.reportEmailGroup}
                                        onChange={(e) => setEditTeamSettings(p => ({ ...p, reportEmailGroup: e.target.value }))}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50 w-full"
                                    />
                                    <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-lg border border-border">
                                        <label className="text-sm text-muted-foreground whitespace-nowrap">Working Hours/Day</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="24"
                                            step="0.5"
                                            value={editTeamSettings.workingHoursPerDay}
                                            onChange={(e) => setEditTeamSettings(p => ({ ...p, workingHoursPerDay: e.target.value }))}
                                            className="w-20 px-2 py-1 bg-muted border border-border rounded text-foreground text-sm text-center focus:outline-none focus:border-blue-500/50"
                                        />
                                        <span className="text-xs text-muted-foreground">hrs</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={() => handleUpdateTeamSettings(team.id)} className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">Save Settings</button>
                                    <button onClick={() => setEditingTeamSettingsId(null)} className="px-4 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground transition-all">Cancel</button>
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
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                    <input
                                        type="text" placeholder="Name" value={newMember.name}
                                        onChange={(e) => setNewMember(p => ({ ...p, name: e.target.value }))}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                    <input
                                        type="email" placeholder="Email" value={newMember.email}
                                        onChange={(e) => setNewMember(p => ({ ...p, email: e.target.value }))}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                    <select value={newMember.role} onChange={(e) => setNewMember(p => ({ ...p, role: e.target.value }))}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50">
                                        <option value="engineer">Engineer</option>
                                        <option value="qa">QA</option>
                                    </select>
                                    <select value={newMember.title} onChange={(e) => setNewMember(p => ({ ...p, title: e.target.value }))}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50">
                                        {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleAddMember(team.id)} className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">Add</button>
                                    <button onClick={() => setAddingMemberTeamId(null)} className="px-4 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground transition-all">Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* Members Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Email</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Role</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Title</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Hours/Day</th>
                                        <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {team.members.map((member) => (
                                        <tr key={member.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                            {editingMemberId === member.id ? (
                                                <>
                                                    <td className="py-2 px-6"><input type="text" value={editMember.name} onChange={(e) => setEditMember(p => ({ ...p, name: e.target.value }))} className="w-full px-2 py-1 bg-muted border border-border rounded text-foreground text-sm" /></td>
                                                    <td className="py-2 px-4"><input type="email" value={editMember.email} onChange={(e) => setEditMember(p => ({ ...p, email: e.target.value }))} className="w-full px-2 py-1 bg-muted border border-border rounded text-foreground text-sm" /></td>
                                                    <td className="py-2 px-4">
                                                        <select value={editMember.role} onChange={(e) => setEditMember(p => ({ ...p, role: e.target.value }))} className="px-2 py-1 bg-muted border border-border rounded text-foreground text-sm">
                                                            <option value="engineer">Engineer</option>
                                                            <option value="qa">QA</option>
                                                        </select>
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <select value={editMember.title} onChange={(e) => setEditMember(p => ({ ...p, title: e.target.value }))} className="px-2 py-1 bg-muted border border-border rounded text-foreground text-sm">
                                                            {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        <input type="number" min="1" max="24" step="0.5" placeholder={String(team.workingHoursPerDay)} value={editMember.workingHoursPerDay} onChange={(e) => setEditMember(p => ({ ...p, workingHoursPerDay: e.target.value }))} className="w-16 px-2 py-1 bg-muted border border-border rounded text-foreground text-sm text-center" title="Leave empty to inherit team default" />
                                                    </td>
                                                    <td className="py-2 px-6 text-right">
                                                        <button onClick={() => handleUpdateMember(member.id)} className="text-green-400 hover:text-green-300 text-sm mr-2">&#x2713; Save</button>
                                                        <button onClick={() => setEditingMemberId(null)} className="text-muted-foreground hover:text-foreground text-sm">&#x2715;</button>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="py-3 px-6">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground font-semibold">{member.role === 'qa' ? 'Q' : 'E'}</span>
                                                            <span className="text-foreground">{member.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-muted-foreground text-sm">{member.email}</td>
                                                    <td className="py-3 px-4">
                                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${member.role === 'engineer' ? 'bg-blue-500/20 text-blue-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                                            {member.role === 'engineer' ? 'Engineer' : 'QA'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-foreground/70 text-sm">{member.title}</td>
                                                    <td className="py-3 px-4 text-sm">
                                                        {member.workingHoursPerDay != null ? (
                                                            <span className="text-amber-400 font-medium">{member.workingHoursPerDay}h</span>
                                                        ) : (
                                                            <span className="text-muted-foreground">{team.workingHoursPerDay}h</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-6 text-right space-x-2">
                                                        <button onClick={() => startEditMember(member)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                                                        <button onClick={() => handleDeleteMember(member.id, member.name)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                    {team.members.length === 0 && (
                                        <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No members yet</td></tr>
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
