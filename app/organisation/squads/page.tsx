'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SquadItem {
    id: string;
    name: string;
    code: string | null;
    boardId: number;
    isActive: boolean;
    workingHoursPerDay: number;
    memberCount: number;
    engineerCount: number;
    qaCount: number;
    dataSourceCount: number;
    department: {
        id: string;
        name: string;
        division: { id: string; name: string; group: { id: string; name: string } };
    } | null;
}

type HierarchyData = Array<{
    id: string;
    name: string;
    divisions: Array<{
        id: string;
        name: string;
        departments: Array<{ id: string; name: string }>;
    }>;
}>;

interface SyncResult {
    boardId: number;
    boardName: string;
    teamId: string;
    action: 'created' | 'updated';
    memberCount: number;
    newMembers: number;
    error?: string;
}

interface SyncResponse {
    totalBoards: number;
    synced: number;
    errors: number;
    results: SyncResult[];
}

interface MemberInfo {
    accountId: string;
    displayName: string;
    emailAddress: string;
    avatarUrl?: string;
    role: string;
    title: string;
}

interface DiscoverResponse {
    boardId: number;
    existingTeamId: string | null;
    existingTeamName: string | null;
    existing: MemberInfo[];
    discovered: MemberInfo[];
    removedFromJira: MemberInfo[];
    totalJiraMembers: number;
}

const TITLE_OPTIONS = ['Tech Lead', 'Senior', 'Associate', 'Junior'] as const;
const ROLE_OPTIONS = ['engineer', 'qa'] as const;

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string; size?: number }) {
    const initials = name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={name}
                width={size}
                height={size}
                className="rounded-full object-cover"
                style={{ width: size, height: size }}
                referrerPolicy="no-referrer"
            />
        );
    }

    return (
        <div
            className="rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-medium text-xs"
            style={{ width: size, height: size }}
        >
            {initials}
        </div>
    );
}

// ─── SyncResultBanner ────────────────────────────────────────────────────────

function SyncResultBanner({ data, onDismiss }: { data: SyncResponse; onDismiss: () => void }) {
    const totalNew = data.results.reduce((sum, r) => sum + r.newMembers, 0);

    return (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-6 animate-in fade-in">
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-purple-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-foreground font-medium text-sm">
                            Synced {data.synced} squad{data.synced !== 1 ? 's' : ''} from Jira
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                            {totalNew > 0 && <>{totalNew} new member{totalNew !== 1 ? 's' : ''} discovered. </>}
                            {data.errors > 0 && (
                                <span className="text-red-400">{data.errors} error{data.errors !== 1 ? 's' : ''}.</span>
                            )}
                            {totalNew === 0 && data.errors === 0 && 'All squads are up to date.'}
                        </p>
                        {data.errors > 0 && (
                            <div className="mt-2 space-y-1">
                                {data.results
                                    .filter((r) => r.error)
                                    .map((r) => (
                                        <p key={r.boardId} className="text-red-400 text-xs">
                                            Board #{r.boardId} ({r.boardName}): {r.error}
                                        </p>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={onDismiss}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// ─── ConfigureModal ──────────────────────────────────────────────────────────

function ConfigureModal({
    squad,
    onClose,
    onSaved,
}: {
    squad: SquadItem;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [discoverData, setDiscoverData] = useState<DiscoverResponse | null>(null);
    const [members, setMembers] = useState<MemberInfo[]>([]);
    const [removedMembers, setRemovedMembers] = useState<MemberInfo[]>([]);
    const [teamName, setTeamName] = useState(squad.name);
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        async function discover() {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/organisation/squads/discover?boardId=${squad.boardId}`);
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Failed to discover members');
                if (cancelled) return;
                const data = json.data as DiscoverResponse;
                setDiscoverData(data);
                setMembers([...data.existing, ...data.discovered]);
                setRemovedMembers(data.removedFromJira);
                if (data.existingTeamName) setTeamName(data.existingTeamName);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Discovery failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        discover();
        return () => { cancelled = true; };
    }, [squad.boardId]);

    const updateMember = useCallback((accountId: string, field: 'role' | 'title', value: string) => {
        setMembers((prev) =>
            prev.map((m) => (m.accountId === accountId ? { ...m, [field]: value } : m))
        );
    }, []);

    const removeMember = useCallback((accountId: string) => {
        setMembers((prev) => {
            const member = prev.find((m) => m.accountId === accountId);
            if (member) setRemovedMembers((r) => [...r, member]);
            return prev.filter((m) => m.accountId !== accountId);
        });
    }, []);

    const restoreMember = useCallback((accountId: string) => {
        setRemovedMembers((prev) => {
            const member = prev.find((m) => m.accountId === accountId);
            if (member) setMembers((ms) => [...ms, member]);
            return prev.filter((m) => m.accountId !== accountId);
        });
    }, []);

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            const res = await fetch('/api/organisation/squads/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    boardId: squad.boardId,
                    teamName,
                    members: members.map((m) => ({
                        accountId: m.accountId,
                        displayName: m.displayName,
                        emailAddress: m.emailAddress,
                        role: m.role,
                        title: m.title,
                    })),
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to save');
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const isDiscovered = useCallback(
        (accountId: string) => discoverData?.discovered.some((d) => d.accountId === accountId) ?? false,
        [discoverData]
    );

    return (
        <div
            ref={backdropRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                        <h2 className="text-foreground font-semibold text-lg">Configure Members</h2>
                        <p className="text-muted-foreground text-xs mt-0.5">
                            {squad.name} — Board #{squad.boardId}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-muted-foreground text-sm">Discovering members...</p>
                            </div>
                        </div>
                    ) : error && !members.length ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            {/* Team Name */}
                            <div className="mb-5">
                                <label className="block text-xs text-muted-foreground mb-1.5">Team Name</label>
                                <input
                                    type="text"
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                                    <p className="text-red-400 text-xs">{error}</p>
                                </div>
                            )}

                            {/* Members List */}
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground mb-2">
                                    {members.length} member{members.length !== 1 ? 's' : ''}
                                    {discoverData && discoverData.discovered.length > 0 && (
                                        <span className="text-purple-400 ml-1">
                                            ({discoverData.discovered.length} new)
                                        </span>
                                    )}
                                </p>
                                {members.map((member) => (
                                    <div
                                        key={member.accountId}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                            isDiscovered(member.accountId)
                                                ? 'bg-purple-500/5 border-purple-500/20'
                                                : 'bg-muted/20 border-border'
                                        }`}
                                    >
                                        <Avatar name={member.displayName} avatarUrl={member.avatarUrl} size={36} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-foreground text-sm font-medium truncate">
                                                    {member.displayName}
                                                </p>
                                                {isDiscovered(member.accountId) && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-400 font-medium shrink-0">
                                                        NEW
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-muted-foreground text-xs truncate">{member.emailAddress}</p>
                                        </div>
                                        <select
                                            value={member.role}
                                            onChange={(e) => updateMember(member.accountId, 'role', e.target.value)}
                                            className="px-2 py-1.5 rounded-lg bg-muted/30 border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 w-24"
                                        >
                                            {ROLE_OPTIONS.map((r) => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={member.title}
                                            onChange={(e) => updateMember(member.accountId, 'title', e.target.value)}
                                            className="px-2 py-1.5 rounded-lg bg-muted/30 border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 w-28"
                                        >
                                            <option value="">No title</option>
                                            {TITLE_OPTIONS.map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => removeMember(member.accountId)}
                                            className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0"
                                            title="Remove member"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Removed / Not in Jira */}
                            {removedMembers.length > 0 && (
                                <div className="mt-5">
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Removed / Not in Jira ({removedMembers.length})
                                    </p>
                                    <div className="space-y-2">
                                        {removedMembers.map((member, idx) => (
                                            <div
                                                key={`${member.accountId}-${idx}`}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10"
                                            >
                                                <Avatar name={member.displayName} avatarUrl={member.avatarUrl} size={36} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-muted-foreground text-sm truncate">{member.displayName}</p>
                                                    <p className="text-muted-foreground/60 text-xs truncate">{member.emailAddress}</p>
                                                </div>
                                                <button
                                                    onClick={() => restoreMember(member.accountId)}
                                                    className="text-muted-foreground hover:text-purple-400 transition-colors text-xs px-2 py-1 rounded-lg border border-border hover:border-purple-500/30"
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Modal Footer */}
                {!loading && members.length > 0 && (
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !teamName.trim()}
                            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            {saving && (
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            Save Members
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SquadsPage() {
    const [squads, setSquads] = useState<SquadItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [groupId, setGroupId] = useState('');
    const [divisionId, setDivisionId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [hierarchy, setHierarchy] = useState<HierarchyData>([]);

    // Sync state
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    // Configure modal state
    const [configuringSquad, setConfiguringSquad] = useState<SquadItem | null>(null);

    // Track squads with new members from latest sync
    const [newMemberCounts, setNewMemberCounts] = useState<Record<number, number>>({});

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    // Load hierarchy for filters
    useEffect(() => {
        fetch('/api/organisation/structure')
            .then((r) => r.json())
            .then((json) => { if (json.success) setHierarchy(json.data || []); })
            .catch(() => {});
    }, []);

    const fetchSquads = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const params = new URLSearchParams();
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (departmentId) params.set('departmentId', departmentId);
            else if (divisionId) params.set('divisionId', divisionId);
            else if (groupId) params.set('groupId', groupId);
            const res = await fetch(`/api/organisation/squads?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setSquads(json.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load squads');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, groupId, divisionId, departmentId]);

    useEffect(() => { fetchSquads(); }, [fetchSquads]);

    // Sync from Jira
    const handleSync = useCallback(async () => {
        try {
            setSyncing(true);
            setSyncError(null);
            setSyncResult(null);
            const res = await fetch('/api/organisation/squads/sync-all', { method: 'POST' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Sync failed');
            const data = json.data as SyncResponse;
            setSyncResult(data);

            // Track new member counts per board
            const counts: Record<number, number> = {};
            for (const r of data.results) {
                if (r.newMembers > 0) counts[r.boardId] = r.newMembers;
            }
            setNewMemberCounts(counts);

            // Refresh squad list
            await fetchSquads();
        } catch (err) {
            setSyncError(err instanceof Error ? err.message : 'Sync failed');
        } finally {
            setSyncing(false);
        }
    }, [fetchSquads]);

    const handleConfigureSaved = useCallback(() => {
        setConfiguringSquad(null);
        fetchSquads();
    }, [fetchSquads]);

    // Cascading filter options
    const divisions = hierarchy.find((g) => g.id === groupId)?.divisions || [];
    const departments = divisions.find((d) => d.id === divisionId)?.departments || [];

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Squads</h1>
                    <p className="text-muted-foreground text-sm mt-1">All engineering squads and their composition</p>
                </div>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shrink-0"
                >
                    <svg
                        className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                    {syncing ? 'Syncing...' : 'Sync from Jira'}
                </button>
            </div>

            {/* Sync result banner */}
            {syncResult && (
                <SyncResultBanner data={syncResult} onDismiss={() => setSyncResult(null)} />
            )}

            {/* Sync error */}
            {syncError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                    <div className="flex items-start justify-between">
                        <p className="text-red-400 text-sm">{syncError}</p>
                        <button
                            onClick={() => setSyncError(null)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <input
                    type="text"
                    placeholder="Search squads..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm w-64 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {hierarchy.length > 0 && (
                    <>
                        <select
                            value={groupId}
                            onChange={(e) => { setGroupId(e.target.value); setDivisionId(''); setDepartmentId(''); }}
                            className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                            <option value="">All Groups</option>
                            {hierarchy.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                        {groupId && divisions.length > 0 && (
                            <select
                                value={divisionId}
                                onChange={(e) => { setDivisionId(e.target.value); setDepartmentId(''); }}
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                            >
                                <option value="">All Divisions</option>
                                {divisions.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        )}
                        {divisionId && departments.length > 0 && (
                            <select
                                value={departmentId}
                                onChange={(e) => setDepartmentId(e.target.value)}
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                            >
                                <option value="">All Departments</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        )}
                    </>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground text-sm">Loading squads...</p>
                    </div>
                </div>
            ) : squads.length === 0 ? (
                <div className="bg-muted/30 rounded-2xl p-12 border border-border text-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-foreground font-medium">No squads found</p>
                            <p className="text-muted-foreground text-sm mt-1">
                                {debouncedSearch || groupId || divisionId || departmentId
                                    ? 'Try adjusting your filters.'
                                    : 'Sync your Jira boards to automatically create squads.'}
                            </p>
                        </div>
                        {!debouncedSearch && !groupId && !divisionId && !departmentId && (
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors mt-2"
                            >
                                <svg
                                    className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                </svg>
                                {syncing ? 'Syncing...' : 'Sync from Jira'}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {squads.map((squad) => (
                        <div
                            key={squad.id}
                            className="group bg-card rounded-2xl p-5 border border-border hover:border-purple-500/40 transition-all hover:shadow-lg hover:shadow-purple-500/5"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <Link
                                    href={`/organisation/squads/${squad.id}`}
                                    className="flex-1 min-w-0"
                                >
                                    <h3 className="text-foreground font-semibold group-hover:text-purple-400 transition-colors">
                                        {squad.name}
                                    </h3>
                                    {squad.code && (
                                        <span className="text-[10px] text-muted-foreground font-mono">{squad.code}</span>
                                    )}
                                </Link>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    {newMemberCounts[squad.boardId] > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/20 font-medium">
                                            {newMemberCounts[squad.boardId]} new
                                        </span>
                                    )}
                                    {!squad.isActive && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                            Inactive
                                        </span>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setConfiguringSquad(squad);
                                        }}
                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                                        title="Configure members"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Hierarchy breadcrumb */}
                            <Link href={`/organisation/squads/${squad.id}`}>
                                {squad.department && (
                                    <p className="text-[10px] text-muted-foreground mb-3 truncate">
                                        {squad.department.division.group.name} → {squad.department.division.name} → {squad.department.name}
                                    </p>
                                )}

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Members</p>
                                        <p className="text-lg font-bold text-foreground">{squad.memberCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Engineers</p>
                                        <p className="text-lg font-bold text-purple-400">{squad.engineerCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">QA</p>
                                        <p className="text-lg font-bold text-cyan-400">{squad.qaCount}</p>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-3 border-t border-border">
                                    <span>{squad.workingHoursPerDay}h/day</span>
                                    <span>Board #{squad.boardId}</span>
                                    {squad.dataSourceCount > 0 && (
                                        <span>{squad.dataSourceCount} data source{squad.dataSourceCount > 1 ? 's' : ''}</span>
                                    )}
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            {/* Configure modal */}
            {configuringSquad && (
                <ConfigureModal
                    squad={configuringSquad}
                    onClose={() => setConfiguringSquad(null)}
                    onSaved={handleConfigureSaved}
                />
            )}
        </div>
    );
}
