'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MemberReport from '@/components/organisation/MemberReport';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SquadDetail {
    id: string;
    name: string;
    code: string | null;
    boardId: number;
    isActive: boolean;
    workingHoursPerDay: number;
    reportEmailGroup: string | null;
    department: {
        id: string;
        name: string;
        division: { id: string; name: string; group: { id: string; name: string } };
    } | null;
    memberCount: number;
    engineerCount: number;
    qaCount: number;
    leadership: Array<{ id: string; name: string; title: string; role: string; email: string }>;
    members: Array<{
        id: string;
        accountId: string;
        name: string;
        email: string;
        nik: string | null;
        role: string;
        title: string;
        gender: string | null;
        workingHoursPerDay: number | null;
        allocations: Array<{ id: string; type: string; capacityPercent: number; startDate: string; endDate: string; team: { id: string; name: string } }>;
        recentLeaves: Array<{ id: string; startDate: string; endDate: string; type: string }>;
    }>;
    dataSources: Array<{
        id: string;
        name: string;
        boardId: number;
        jqlQuery: string | null;
        isActive: boolean;
        lastSyncAt: string | null;
        lastSyncStatus: string;
        issueCount: number;
    }>;
    allocations: Array<{
        id: string;
        type: string;
        teamMemberId: string;
        memberName: string;
        memberNik: string | null;
        memberRole: string;
        sprintId: number | null;
        startDate: string;
        endDate: string;
        capacityPercent: number;
        notes: string | null;
    }>;
}

interface PerformanceData {
    kpis: {
        totalCommitted: number;
        totalActual: number;
        avgVelocity: number;
        avgAccuracy: number;
        completionRate: number;
        avgCycleTime: number | null;
        medianCycleTime: number | null;
        avgLeadTime: number | null;
        sprintCount: number;
        totalCompletedIssues: number;
        totalCommittedIssues: number;
    };
    velocity: Array<{
        sprint: { id: number; name: string; state: string; startDate: string; endDate: string };
        committedPoints: number;
        actualPoints: number;
        addedMidSprintPoints: number;
        commitmentAccuracy: number;
    }>;
    memberPerformance: Array<{
        accountId: string;
        name: string;
        role: string;
        title: string;
        avatarUrl: string;
        sprintMetrics: Array<{
            sprintId: number;
            sprintName: string;
            storyPoints: number;
            availableDays: number;
            effectiveMandays: number;
            utilizationPercent: number;
            completedIssues: number;
            cycleTimeAvg: number | null;
            leadTimeAvg: number | null;
        }>;
        averages: {
            storyPoints: number;
            utilization: number;
            cycleTime: number | null;
            leadTime: number | null;
            throughput: number;
        };
    }>;
    sprintSummaries: Array<{
        sprintId: number;
        name: string;
        state: string;
        startDate: string;
        endDate: string;
        committedPoints: number;
        actualPoints: number;
        addedMidSprint: number;
        accuracy: number;
        totalStoryPoints: number;
        avgUtilization: number;
        memberCount: number;
        workingDays: number;
    }>;
    epicDistribution: Array<{ name: string; points: number; count: number }>;
    labelDistribution: Array<{ label: string; points: number; count: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kpiColor(value: number, thresholds = { green: 90, yellow: 75, orange: 50 }) {
    if (value >= thresholds.green) return 'text-green-400';
    if (value >= thresholds.yellow) return 'text-yellow-400';
    if (value >= thresholds.orange) return 'text-orange-400';
    return 'text-red-400';
}

function shortDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
function fullDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

function shortSprintLabel(name: string): string {
    const m = name.match(/(\d+)$/);
    return m ? `S${m[1]}` : name.slice(-6);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SquadDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [squad, setSquad] = useState<SquadDetail | null>(null);
    const [perf, setPerf] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [perfLoading, setPerfLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [editHours, setEditHours] = useState('');
    const [saving, setSaving] = useState(false);

    // Period selection
    const currentYear = new Date().getFullYear();
    const [periodMode, setPeriodMode] = useState<'yearly' | 'custom'>('yearly');
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Section collapse
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const toggle = (section: string) => setCollapsed((p) => ({ ...p, [section]: !p[section] }));

    // Allocation form
    const [showAllocForm, setShowAllocForm] = useState(false);
    const [allocForm, setAllocForm] = useState({ teamMemberId: '', type: 'SPRINT', startDate: '', endDate: '', capacityPercent: '100', sprintId: '', notes: '' });
    const [allocSaving, setAllocSaving] = useState(false);
    const [allocError, setAllocError] = useState<string | null>(null);

    // Fetch squad detail (DB)
    const fetchSquad = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/organisation/squads/${id}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setSquad(json.data);
            setEditHours(String(json.data.workingHoursPerDay));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load squad');
        } finally {
            setLoading(false);
        }
    }, [id]);

    // Fetch performance data (Jira — heavier)
    const fetchPerformance = useCallback(async () => {
        try {
            setPerfLoading(true);
            const params = new URLSearchParams();
            if (periodMode === 'yearly') {
                params.set('startDate', `${selectedYear}-01-01`);
                params.set('endDate', `${selectedYear}-12-31`);
            } else if (customStart && customEnd) {
                params.set('startDate', customStart);
                params.set('endDate', customEnd);
            }
            const res = await fetch(`/api/organisation/squads/${id}/performance?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setPerf(json.data);
        } catch (err) {
            console.error('Performance fetch error:', err);
        } finally {
            setPerfLoading(false);
        }
    }, [id, periodMode, selectedYear, customStart, customEnd]);

    useEffect(() => { fetchSquad(); }, [fetchSquad]);
    useEffect(() => { fetchPerformance(); }, [fetchPerformance]);

    const saveHours = async () => {
        if (!squad) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/organisation/squads/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workingHoursPerDay: parseFloat(editHours) }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setSquad((s) => s ? { ...s, workingHoursPerDay: parseFloat(editHours) } : s);
            setEditing(false);
        } catch {
            /* keep editing open */
        } finally {
            setSaving(false);
        }
    };

    const createAllocation = async () => {
        setAllocSaving(true);
        setAllocError(null);
        try {
            const res = await fetch(`/api/organisation/squads/${id}/allocations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allocForm),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setShowAllocForm(false);
            setAllocForm({ teamMemberId: '', type: 'SPRINT', startDate: '', endDate: '', capacityPercent: '100', sprintId: '', notes: '' });
            fetchSquad();
        } catch (err) {
            setAllocError(err instanceof Error ? err.message : 'Failed to create allocation');
        } finally {
            setAllocSaving(false);
        }
    };

    const deleteAllocation = async (allocId: string) => {
        if (!confirm('Delete this allocation?')) return;
        try {
            const res = await fetch(`/api/organisation/squads/${id}/allocations?allocationId=${allocId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            fetchSquad();
        } catch {
            /* ignore */
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground text-sm">Loading squad...</p>
                </div>
            </div>
        );
    }

    if (error || !squad) {
        return (
            <div className="p-8 max-w-2xl mx-auto">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                    <p className="text-red-400 font-medium mb-2">Error</p>
                    <p className="text-muted-foreground text-sm">{error || 'Squad not found'}</p>
                    <Link href="/organisation/squads" className="mt-4 inline-block text-purple-400 hover:text-purple-300 text-sm">← Back to Squads</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/organisation/squads" className="hover:text-purple-400 transition-colors">Squads</Link>
                <span>/</span>
                <span className="text-foreground">{squad.name}</span>
            </div>

            {/* ─── 4.2 Info Card ──────────────────────────────────────── */}
            <InfoCard
                squad={squad}
                editing={editing}
                editHours={editHours}
                saving={saving}
                onEdit={() => setEditing(true)}
                onCancel={() => { setEditing(false); setEditHours(String(squad.workingHoursPerDay)); }}
                onHoursChange={setEditHours}
                onSave={saveHours}
            />

            {/* ─── 4.3 Period Selection ───────────────────────────────── */}
            <PeriodSelector
                mode={periodMode}
                year={selectedYear}
                customStart={customStart}
                customEnd={customEnd}
                onModeChange={setPeriodMode}
                onYearChange={setSelectedYear}
                onStartChange={setCustomStart}
                onEndChange={setCustomEnd}
            />

            {/* ─── 4.7 Leadership Roles ───────────────────────────────── */}
            {squad.leadership.length > 0 && (
                <Section title="Leadership" collapsed={collapsed['leadership']} onToggle={() => toggle('leadership')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {squad.leadership.map((l) => (
                            <div key={l.id} className="bg-muted/20 rounded-xl p-4 border border-border">
                                <p className="text-foreground font-medium">{l.name}</p>
                                <p className="text-muted-foreground text-xs">{l.title}</p>
                                <p className="text-muted-foreground text-[10px] mt-1">{l.email}</p>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ─── 4.4 Data Source Links ──────────────────────────────── */}
            {squad.dataSources.length > 0 && (
                <Section title="Data Sources" collapsed={collapsed['datasources']} onToggle={() => toggle('datasources')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {squad.dataSources.map((ds) => (
                            <div key={ds.id} className="bg-muted/20 rounded-xl p-4 border border-border flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-foreground font-medium text-sm">{ds.name}</p>
                                        <StatusDot status={ds.lastSyncStatus} active={ds.isActive} />
                                    </div>
                                    <p className="text-muted-foreground text-[10px] mt-1">Board #{ds.boardId}</p>
                                    {ds.jqlQuery && <p className="text-muted-foreground text-[10px] font-mono truncate max-w-[300px]">{ds.jqlQuery}</p>}
                                </div>
                                <div className="text-right text-[10px] text-muted-foreground">
                                    <p>{ds.issueCount} issues</p>
                                    {ds.lastSyncAt && <p>{fullDate(ds.lastSyncAt)}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ─── 4.5 Performance KPIs ───────────────────────────────── */}
            <Section title="Performance Statistics" collapsed={collapsed['kpis']} onToggle={() => toggle('kpis')}>
                {perfLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-muted-foreground text-sm ml-3">Loading performance data from Jira...</span>
                    </div>
                ) : perf ? (
                    <KPICards kpis={perf.kpis} />
                ) : (
                    <p className="text-muted-foreground text-sm text-center py-6">No performance data available</p>
                )}
            </Section>

            {/* ─── 4.6 Distribution Charts ────────────────────────────── */}
            {perf && (perf.epicDistribution.length > 0 || perf.labelDistribution.length > 0) && (
                <Section title="Distribution" collapsed={collapsed['distribution']} onToggle={() => toggle('distribution')}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {perf.epicDistribution.length > 0 && (
                            <DistributionTable title="Epic Breakdown" items={perf.epicDistribution.slice(0, 15).map((e) => ({ name: e.name, value: e.points, count: e.count }))} />
                        )}
                        {perf.labelDistribution.length > 0 && (
                            <DistributionTable title="Label Breakdown" items={perf.labelDistribution.slice(0, 15).map((l) => ({ name: l.label, value: l.points, count: l.count }))} />
                        )}
                    </div>
                </Section>
            )}

            {/* ─── 4.8 Members Table ──────────────────────────────────── */}
            <Section title="Members" collapsed={collapsed['members']} onToggle={() => toggle('members')}>
                {perf && perf.memberPerformance.length > 0 ? (
                    <MembersTable members={perf.memberPerformance} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                                    <th className="text-left py-3 px-3">Name</th>
                                    <th className="text-left py-3 px-3">NIK</th>
                                    <th className="text-left py-3 px-3">Role</th>
                                    <th className="text-left py-3 px-3">Title</th>
                                </tr>
                            </thead>
                            <tbody>
                                {squad.members.map((m) => (
                                    <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20">
                                        <td className="py-3 px-3 text-foreground">
                                            <Link href={`/organisation/engineers/${m.id}`} className="hover:text-purple-400">{m.name}</Link>
                                        </td>
                                        <td className="py-3 px-3 text-muted-foreground font-mono text-xs">{m.nik || '—'}</td>
                                        <td className="py-3 px-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${m.role === 'qa' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'}`}>
                                                {m.role}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-muted-foreground text-xs">{m.title}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* ─── 4.9 Member Report ─────────────────────────────────── */}
            <Section title="Member Report" collapsed={collapsed['memberReport']} onToggle={() => toggle('memberReport')}>
                <MemberReport boardId={squad.boardId} />
            </Section>

            {/* ─── 4.10 Sprints Table ─────────────────────────────────── */}
            {perf && perf.sprintSummaries.length > 0 && (
                <Section title="Sprints" collapsed={collapsed['sprints']} onToggle={() => toggle('sprints')}>
                    <SprintsTable sprints={perf.sprintSummaries} />
                </Section>
            )}

            {/* ─── 4.10 Capacity Allocations ──────────────────────────── */}
            <Section title="Capacity Allocations" collapsed={collapsed['allocations']} onToggle={() => toggle('allocations')}>
                <div className="mb-4 flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">{squad.allocations.length} allocation{squad.allocations.length !== 1 ? 's' : ''}</p>
                    <button
                        onClick={() => setShowAllocForm(!showAllocForm)}
                        className="px-3 py-1.5 text-xs bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                    >
                        {showAllocForm ? 'Cancel' : '+ Add Allocation'}
                    </button>
                </div>

                {/* Allocation form */}
                {showAllocForm && (
                    <div className="bg-muted/20 rounded-xl p-4 border border-border mb-4 space-y-3">
                        {allocError && <p className="text-red-400 text-xs">{allocError}</p>}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <select
                                value={allocForm.teamMemberId}
                                onChange={(e) => setAllocForm((p) => ({ ...p, teamMemberId: e.target.value }))}
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm"
                            >
                                <option value="">Select Member</option>
                                {squad.members.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                                ))}
                            </select>
                            <select
                                value={allocForm.type}
                                onChange={(e) => setAllocForm((p) => ({ ...p, type: e.target.value }))}
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm"
                            >
                                <option value="SPRINT">SPRINT</option>
                                <option value="BAU">BAU</option>
                            </select>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={allocForm.capacityPercent}
                                onChange={(e) => setAllocForm((p) => ({ ...p, capacityPercent: e.target.value }))}
                                placeholder="Capacity %"
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm"
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                                type="date"
                                value={allocForm.startDate}
                                onChange={(e) => setAllocForm((p) => ({ ...p, startDate: e.target.value }))}
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm"
                            />
                            <input
                                type="date"
                                value={allocForm.endDate}
                                onChange={(e) => setAllocForm((p) => ({ ...p, endDate: e.target.value }))}
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm"
                            />
                            <input
                                type="text"
                                value={allocForm.notes}
                                onChange={(e) => setAllocForm((p) => ({ ...p, notes: e.target.value }))}
                                placeholder="Notes (optional)"
                                className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm"
                            />
                        </div>
                        <button
                            onClick={createAllocation}
                            disabled={allocSaving || !allocForm.teamMemberId || !allocForm.startDate || !allocForm.endDate}
                            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                            {allocSaving ? 'Creating...' : 'Create Allocation'}
                        </button>
                    </div>
                )}

                {/* Allocations table */}
                {squad.allocations.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                                    <th className="text-left py-3 px-3">Member</th>
                                    <th className="text-left py-3 px-3">Type</th>
                                    <th className="text-right py-3 px-3">Capacity</th>
                                    <th className="text-left py-3 px-3">Start</th>
                                    <th className="text-left py-3 px-3">End</th>
                                    <th className="text-left py-3 px-3">Notes</th>
                                    <th className="text-center py-3 px-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {squad.allocations.map((a) => (
                                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20">
                                        <td className="py-3 px-3">
                                            <p className="text-foreground text-sm">{a.memberName}</p>
                                            {a.memberNik && <p className="text-muted-foreground text-[10px] font-mono">{a.memberNik}</p>}
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${a.type === 'SPRINT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                {a.type}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-right font-medium text-foreground">{a.capacityPercent}%</td>
                                        <td className="py-3 px-3 text-muted-foreground text-xs">{shortDate(a.startDate)}</td>
                                        <td className="py-3 px-3 text-muted-foreground text-xs">{shortDate(a.endDate)}</td>
                                        <td className="py-3 px-3 text-muted-foreground text-xs truncate max-w-[150px]">{a.notes || '—'}</td>
                                        <td className="py-3 px-3 text-center">
                                            <button
                                                onClick={() => deleteAllocation(a.id)}
                                                className="text-red-400 hover:text-red-300 text-xs"
                                                title="Delete"
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-muted-foreground text-sm text-center py-4">No capacity allocations yet</p>
                )}
            </Section>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, collapsed, onToggle, children }: { title: string; collapsed?: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors"
            >
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <svg className={`w-5 h-5 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {!collapsed && <div className="px-6 pb-6">{children}</div>}
        </div>
    );
}

function InfoCard({ squad, editing, editHours, saving, onEdit, onCancel, onHoursChange, onSave }: {
    squad: SquadDetail; editing: boolean; editHours: string; saving: boolean;
    onEdit: () => void; onCancel: () => void; onHoursChange: (v: string) => void; onSave: () => void;
}) {
    return (
        <div className="bg-card rounded-2xl border border-border p-6">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                {/* Squad avatar / info */}
                <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 text-xl font-bold flex-shrink-0">
                        {squad.name.charAt(0)}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-foreground">{squad.name}</h1>
                            {squad.code && <span className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-0.5 rounded">{squad.code}</span>}
                            {!squad.isActive && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Inactive</span>
                            )}
                        </div>
                        {squad.department && (
                            <p className="text-muted-foreground text-xs mt-0.5">
                                {squad.department.division.group.name} → {squad.department.division.name} → {squad.department.name}
                            </p>
                        )}
                        <p className="text-muted-foreground text-xs mt-0.5">Board #{squad.boardId}</p>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-foreground">{squad.memberCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Members</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-purple-400">{squad.engineerCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Engineers</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-cyan-400">{squad.qaCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">QA</p>
                    </div>
                    <div className="text-center">
                        {editing ? (
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    value={editHours}
                                    onChange={(e) => onHoursChange(e.target.value)}
                                    step="0.5"
                                    min="1"
                                    max="24"
                                    className="w-16 px-2 py-1 rounded bg-muted/30 border border-border text-foreground text-sm text-center"
                                />
                                <button onClick={onSave} disabled={saving} className="text-green-400 hover:text-green-300 text-xs">✓</button>
                                <button onClick={onCancel} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                            </div>
                        ) : (
                            <button onClick={onEdit} className="group" title="Click to edit">
                                <p className="text-2xl font-bold text-foreground group-hover:text-purple-400 transition-colors">{squad.workingHoursPerDay}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hrs/Day ✎</p>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PeriodSelector({ mode, year, customStart, customEnd, onModeChange, onYearChange, onStartChange, onEndChange }: {
    mode: 'yearly' | 'custom'; year: number; customStart: string; customEnd: string;
    onModeChange: (m: 'yearly' | 'custom') => void; onYearChange: (y: number) => void;
    onStartChange: (v: string) => void; onEndChange: (v: string) => void;
}) {
    const currentYear = new Date().getFullYear();
    return (
        <div className="flex flex-wrap items-center gap-3 bg-card rounded-xl border border-border px-4 py-3">
            <span className="text-muted-foreground text-xs font-medium">Period:</span>
            <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
                <button
                    onClick={() => onModeChange('yearly')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'yearly' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Yearly
                </button>
                <button
                    onClick={() => onModeChange('custom')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'custom' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Custom
                </button>
            </div>
            {mode === 'yearly' ? (
                <select
                    value={year}
                    onChange={(e) => onYearChange(parseInt(e.target.value))}
                    className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-foreground text-xs"
                >
                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            ) : (
                <>
                    <input type="date" value={customStart} onChange={(e) => onStartChange(e.target.value)} className="px-2 py-1.5 rounded-lg bg-muted/30 border border-border text-foreground text-xs" />
                    <span className="text-muted-foreground text-xs">to</span>
                    <input type="date" value={customEnd} onChange={(e) => onEndChange(e.target.value)} className="px-2 py-1.5 rounded-lg bg-muted/30 border border-border text-foreground text-xs" />
                </>
            )}
        </div>
    );
}

function KPICards({ kpis }: { kpis: PerformanceData['kpis'] }) {
    const cards = [
        { label: 'Avg Velocity', value: `${kpis.avgVelocity}`, sub: `${kpis.sprintCount} sprints`, color: 'text-purple-400' },
        { label: 'Commitment Accuracy', value: `${kpis.avgAccuracy}%`, sub: `${kpis.totalCommitted} committed`, color: kpiColor(kpis.avgAccuracy) },
        { label: 'Completion Rate', value: `${kpis.completionRate}%`, sub: `${kpis.totalCompletedIssues}/${kpis.totalCommittedIssues} issues`, color: kpiColor(kpis.completionRate) },
        { label: 'Avg Cycle Time', value: kpis.avgCycleTime !== null ? `${kpis.avgCycleTime}d` : '—', sub: kpis.medianCycleTime !== null ? `Median: ${kpis.medianCycleTime}d` : 'No data', color: 'text-blue-400' },
        { label: 'Median Cycle Time', value: kpis.medianCycleTime !== null ? `${kpis.medianCycleTime}d` : '—', sub: 'Business days', color: 'text-blue-400' },
        { label: 'Avg Lead Time', value: kpis.avgLeadTime !== null ? `${kpis.avgLeadTime}d` : '—', sub: 'Created → Done', color: 'text-cyan-400' },
        { label: 'Total Delivered', value: `${kpis.totalActual}`, sub: `${kpis.totalCommitted} committed`, color: 'text-green-400' },
        { label: 'Total Issues Done', value: `${kpis.totalCompletedIssues}`, sub: `of ${kpis.totalCommittedIssues} total`, color: 'text-emerald-400' },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card) => (
                <div key={card.label} className="bg-muted/20 rounded-xl p-4 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
                    <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>
                </div>
            ))}
        </div>
    );
}

function StatusDot({ status, active }: { status: string; active: boolean }) {
    if (!active) return <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" title="Inactive" />;
    const colors: Record<string, string> = { OK: 'bg-green-500', HEALTHY: 'bg-green-500', ERROR: 'bg-red-500', SYNCING: 'bg-yellow-500', NEVER: 'bg-gray-500' };
    return <span className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-500'} inline-block`} title={status} />;
}

function DistributionTable({ title, items }: { title: string; items: Array<{ name: string; value: number; count: number }> }) {
    const maxValue = Math.max(...items.map((i) => i.value), 1);
    return (
        <div>
            <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
            <div className="space-y-2">
                {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                        <div className="w-[200px] truncate text-xs text-muted-foreground" title={item.name}>{item.name}</div>
                        <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-purple-500/40 rounded-full"
                                style={{ width: `${(item.value / maxValue) * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-foreground font-medium w-12 text-right">{item.value} pts</span>
                        <span className="text-[10px] text-muted-foreground w-10 text-right">{item.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MembersTable({ members }: { members: PerformanceData['memberPerformance'] }) {
    const [sortBy, setSortBy] = useState<'name' | 'utilization' | 'storyPoints' | 'cycleTime' | 'throughput'>('name');

    const sorted = useMemo(() => {
        const arr = [...members];
        switch (sortBy) {
            case 'utilization': return arr.sort((a, b) => b.averages.utilization - a.averages.utilization);
            case 'storyPoints': return arr.sort((a, b) => b.averages.storyPoints - a.averages.storyPoints);
            case 'cycleTime': return arr.sort((a, b) => (a.averages.cycleTime ?? 999) - (b.averages.cycleTime ?? 999));
            case 'throughput': return arr.sort((a, b) => b.averages.throughput - a.averages.throughput);
            default: return arr.sort((a, b) => a.name.localeCompare(b.name));
        }
    }, [members, sortBy]);

    return (
        <div>
            <div className="flex items-center gap-2 text-xs mb-3">
                <span className="text-muted-foreground">Sort:</span>
                {(['name', 'utilization', 'storyPoints', 'cycleTime', 'throughput'] as const).map((key) => (
                    <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        className={`px-2 py-1 rounded-md transition-colors ${sortBy === key ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {key === 'storyPoints' ? 'SP' : key === 'cycleTime' ? 'Cycle' : key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                ))}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="text-left py-3 px-3">Member</th>
                            <th className="text-right py-3 px-3">Avg SP/Sprint</th>
                            <th className="text-right py-3 px-3">Avg Utilization</th>
                            <th className="text-right py-3 px-3">Avg Cycle Time</th>
                            <th className="text-right py-3 px-3">Avg Lead Time</th>
                            <th className="text-right py-3 px-3">Avg Throughput</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((m) => (
                            <tr key={m.accountId} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                        {m.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={m.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] text-purple-400 font-medium">
                                                {m.name.charAt(0)}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-foreground text-sm font-medium">{m.name}</p>
                                            <p className="text-muted-foreground text-[10px]">{m.title || m.role}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-3 text-right text-foreground font-medium">{m.averages.storyPoints}</td>
                                <td className={`py-3 px-3 text-right font-medium ${kpiColor(m.averages.utilization, { green: 100, yellow: 80, orange: 60 })}`}>
                                    {m.averages.utilization}%
                                </td>
                                <td className="py-3 px-3 text-right text-muted-foreground">{m.averages.cycleTime !== null ? `${m.averages.cycleTime}d` : '—'}</td>
                                <td className="py-3 px-3 text-right text-muted-foreground">{m.averages.leadTime !== null ? `${m.averages.leadTime}d` : '—'}</td>
                                <td className="py-3 px-3 text-right text-muted-foreground">{m.averages.throughput}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SprintsTable({ sprints }: { sprints: PerformanceData['sprintSummaries'] }) {
    const [sortBy, setSortBy] = useState<'date' | 'velocity' | 'accuracy' | 'utilization'>('date');

    const sorted = useMemo(() => {
        const arr = [...sprints];
        switch (sortBy) {
            case 'velocity': return arr.sort((a, b) => b.actualPoints - a.actualPoints);
            case 'accuracy': return arr.sort((a, b) => b.accuracy - a.accuracy);
            case 'utilization': return arr.sort((a, b) => b.avgUtilization - a.avgUtilization);
            default: return arr.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        }
    }, [sprints, sortBy]);

    return (
        <div>
            <div className="flex items-center gap-2 text-xs mb-3">
                <span className="text-muted-foreground">Sort:</span>
                {(['date', 'velocity', 'accuracy', 'utilization'] as const).map((key) => (
                    <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        className={`px-2 py-1 rounded-md transition-colors ${sortBy === key ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                ))}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="text-left py-3 px-3">Sprint</th>
                            <th className="text-left py-3 px-3">Period</th>
                            <th className="text-right py-3 px-3">Committed</th>
                            <th className="text-right py-3 px-3">Actual</th>
                            <th className="text-right py-3 px-3">Added</th>
                            <th className="text-right py-3 px-3">Accuracy</th>
                            <th className="text-right py-3 px-3">Avg Util</th>
                            <th className="text-right py-3 px-3">Members</th>
                            <th className="text-center py-3 px-3">State</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((s) => (
                            <tr key={s.sprintId} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="py-3 px-3 text-foreground font-medium">{shortSprintLabel(s.name)}</td>
                                <td className="py-3 px-3 text-muted-foreground text-xs">{shortDate(s.startDate)} – {shortDate(s.endDate)}</td>
                                <td className="py-3 px-3 text-right text-foreground">{s.committedPoints}</td>
                                <td className="py-3 px-3 text-right text-cyan-400 font-medium">{s.actualPoints}</td>
                                <td className="py-3 px-3 text-right text-yellow-400">{s.addedMidSprint}</td>
                                <td className={`py-3 px-3 text-right font-medium ${kpiColor(s.accuracy)}`}>{s.accuracy}%</td>
                                <td className={`py-3 px-3 text-right font-medium ${kpiColor(s.avgUtilization, { green: 100, yellow: 80, orange: 60 })}`}>{s.avgUtilization}%</td>
                                <td className="py-3 px-3 text-right text-muted-foreground">{s.memberCount}</td>
                                <td className="py-3 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                        s.state === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                                    }`}>
                                        {s.state}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
