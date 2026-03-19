'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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

type HierarchyData = Array<{ id: string; name: string; divisions: Array<{ id: string; name: string; departments: Array<{ id: string; name: string }> }> }>;

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

    // Cascading filter options
    const divisions = hierarchy.find((g) => g.id === groupId)?.divisions || [];
    const departments = divisions.find((d) => d.id === divisionId)?.departments || [];

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Squads</h1>
                <p className="text-muted-foreground text-sm mt-1">All engineering squads and their composition</p>
            </div>

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

            {/* Status messages */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground text-sm">Loading squads...</p>
                    </div>
                </div>
            ) : squads.length === 0 ? (
                <div className="bg-muted/30 rounded-xl p-8 border border-border text-center">
                    <p className="text-muted-foreground">No squads found. Create teams in Organisation → Structure.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {squads.map((squad) => (
                        <Link
                            key={squad.id}
                            href={`/organisation/squads/${squad.id}`}
                            className="group bg-card rounded-2xl p-5 border border-border hover:border-purple-500/40 transition-all hover:shadow-lg hover:shadow-purple-500/5"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-foreground font-semibold group-hover:text-purple-400 transition-colors">
                                        {squad.name}
                                    </h3>
                                    {squad.code && (
                                        <span className="text-[10px] text-muted-foreground font-mono">{squad.code}</span>
                                    )}
                                </div>
                                {!squad.isActive && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                        Inactive
                                    </span>
                                )}
                            </div>

                            {/* Hierarchy breadcrumb */}
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
                    ))}
                </div>
            )}
        </div>
    );
}
