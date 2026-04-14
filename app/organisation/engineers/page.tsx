'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamInfo {
  id: string;
  name: string;
  department?: {
    id: string;
    name: string;
    division?: {
      id: string;
      name: string;
      group?: { id: string; name: string };
    };
  };
}

interface Engineer {
  id: string;
  accountId: string;
  name: string;
  email: string;
  role: string;
  title: string;
  nik: string | null;
  gender: string | null;
  workingHoursPerDay: number | null;
  excludeFromUtilization: boolean;
  teamId: string;
  team: TeamInfo;
}

interface FilterOption {
  id: string;
  name: string;
}

interface OrgTeam {
  id: string;
  name: string;
}

interface OrgDepartment {
  id: string;
  name: string;
  teams: OrgTeam[];
}

interface OrgDivision {
  id: string;
  name: string;
  children?: OrgDepartment[];
  departments?: OrgDepartment[];
}

interface OrgGroup {
  id: string;
  name: string;
  children?: OrgDivision[];
  divisions?: OrgDivision[];
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function EngineersPage() {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });

  // Search & filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterTeamId, setFilterTeamId] = useState('');
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterDivId, setFilterDivId] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('');
  const [filterRole, setFilterRole] = useState('');

  // Filter options (loaded from hierarchy)
  const [orgStructure, setOrgStructure] = useState<OrgGroup[]>([]);
  const [allSquads, setAllSquads] = useState<FilterOption[]>([]);

  // Add engineer form
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', nik: '', gender: '', role: 'engineer', title: 'Associate', teamId: '', accountId: '', excludeFromUtilization: false,
  });
  const [saving, setSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch filter options from org structure + all squads
  useEffect(() => {
    // Hierarchy filters (groups, divisions, departments)
    fetch('/api/organisation/structure')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setOrgStructure(data.data);
        }
      })
      .catch(() => {});

    // All squads (including Jira-synced ones not yet in hierarchy)
    fetch('/api/organisation/squads?activeOnly=false')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setAllSquads(data.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Derive cascading filter options from org structure
  const groups: FilterOption[] = useMemo(
    () => orgStructure.map(g => ({ id: g.id, name: g.name })),
    [orgStructure]
  );

  const divisions: FilterOption[] = useMemo(() => {
    const source = filterGroupId
      ? orgStructure.filter(g => g.id === filterGroupId)
      : orgStructure;
    const result: FilterOption[] = [];
    for (const g of source) {
      for (const d of g.children || g.divisions || []) {
        result.push({ id: d.id, name: d.name });
      }
    }
    return result;
  }, [orgStructure, filterGroupId]);

  const departments: FilterOption[] = useMemo(() => {
    const groupSource = filterGroupId
      ? orgStructure.filter(g => g.id === filterGroupId)
      : orgStructure;
    const result: FilterOption[] = [];
    for (const g of groupSource) {
      const divs = filterDivId
        ? (g.children || g.divisions || []).filter(d => d.id === filterDivId)
        : (g.children || g.divisions || []);
      for (const d of divs) {
        for (const dep of d.children || d.departments || []) {
          result.push({ id: dep.id, name: dep.name });
        }
      }
    }
    return result;
  }, [orgStructure, filterGroupId, filterDivId]);

  const teams: FilterOption[] = useMemo(() => {
    // If no hierarchy filters, show all squads (includes Jira-synced ones not in hierarchy)
    if (!filterGroupId && !filterDivId && !filterDeptId) {
      return allSquads;
    }
    // Otherwise derive from filtered hierarchy
    const groupSource = filterGroupId
      ? orgStructure.filter(g => g.id === filterGroupId)
      : orgStructure;
    const result: FilterOption[] = [];
    for (const g of groupSource) {
      const divs = filterDivId
        ? (g.children || g.divisions || []).filter(d => d.id === filterDivId)
        : (g.children || g.divisions || []);
      for (const d of divs) {
        const deps = filterDeptId
          ? (d.children || d.departments || []).filter(dep => dep.id === filterDeptId)
          : (d.children || d.departments || []);
        for (const dep of deps) {
          for (const t of dep.teams || []) {
            result.push({ id: t.id, name: t.name });
          }
        }
      }
    }
    return result;
  }, [orgStructure, allSquads, filterGroupId, filterDivId, filterDeptId]);

  const fetchEngineers = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterTeamId) params.set('teamId', filterTeamId);
      else if (filterDeptId) params.set('departmentId', filterDeptId);
      else if (filterDivId) params.set('divisionId', filterDivId);
      else if (filterGroupId) params.set('groupId', filterGroupId);
      if (filterRole) params.set('role', filterRole);
      params.set('page', String(page));
      params.set('pageSize', '50');

      const res = await fetch(`/api/organisation/engineers?${params}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setEngineers(result.data);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load engineers');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterTeamId, filterDeptId, filterDivId, filterGroupId, filterRole]);

  useEffect(() => {
    fetchEngineers(1);
  }, [fetchEngineers]);

  const showSuccessMsg = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.teamId) return;
    try {
      setSaving(true);
      const res = await fetch('/api/organisation/engineers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setFormData({ name: '', email: '', nik: '', gender: '', role: 'engineer', title: 'Associate', teamId: '', accountId: '', excludeFromUtilization: false });
      setShowAdd(false);
      showSuccessMsg('Engineer added');
      fetchEngineers(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add engineer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete engineer "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/organisation/engineers?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      showSuccessMsg('Engineer deleted');
      fetchEngineers(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete engineer');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterGroupId('');
    setFilterDivId('');
    setFilterDeptId('');
    setFilterTeamId('');
    setFilterRole('');
  };

  const hasFilters = search || filterGroupId || filterDivId || filterDeptId || filterTeamId || filterRole;

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'NIK', 'Squad', 'Department', 'Division', 'Group', 'Role', 'Title'];
    const rows = engineers.map(eng => [
      eng.name,
      eng.email,
      eng.nik || '',
      eng.team?.name || '',
      eng.team?.department?.name || '',
      eng.team?.department?.division?.name || '',
      eng.team?.department?.division?.group?.name || '',
      eng.role,
      eng.title,
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engineers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const titleOptions = ['Tech Lead', 'EM', 'Sec Head', 'Associate', 'QA'];

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-border bg-background/50 backdrop-blur-xl">
        <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Engineers</h1>
                <p className="text-muted-foreground text-sm">
                  {pagination.total} engineer{pagination.total !== 1 ? 's' : ''} registered
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportCSV}
                disabled={engineers.length === 0}
                className="px-4 py-2 text-sm border border-border text-foreground rounded-lg hover:bg-muted disabled:opacity-50 transition-all"
              >
                Export CSV
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all"
              >
                + Add Engineer
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

        {/* Search & Filters */}
        <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name, NIK, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50 text-sm"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Roles</option>
              <option value="engineer">Engineer</option>
              <option value="qa">QA</option>
            </select>
          </div>

          {/* Cascading hierarchy filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={filterGroupId}
              onChange={(e) => { setFilterGroupId(e.target.value); setFilterDivId(''); setFilterDeptId(''); setFilterTeamId(''); }}
              className="px-3 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Groups</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select
              value={filterDivId}
              onChange={(e) => { setFilterDivId(e.target.value); setFilterDeptId(''); setFilterTeamId(''); }}
              className="px-3 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Divisions</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select
              value={filterDeptId}
              onChange={(e) => { setFilterDeptId(e.target.value); setFilterTeamId(''); }}
              className="px-3 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select
              value={filterTeamId}
              onChange={(e) => setFilterTeamId(e.target.value)}
              className="px-3 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Squads</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear all filters
            </button>
          )}
        </div>

        {/* Add Engineer Form */}
        {showAdd && (
          <div className="p-6 bg-muted/30 border border-border rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Add Engineer</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Full Name *"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
              <input
                type="email"
                placeholder="Email *"
                value={formData.email}
                onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
              <input
                type="text"
                placeholder="NIK (Employee Number)"
                value={formData.nik}
                onChange={(e) => setFormData(p => ({ ...p, nik: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
              <input
                type="text"
                placeholder="Jira Account ID (optional)"
                value={formData.accountId}
                onChange={(e) => setFormData(p => ({ ...p, accountId: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
              <select
                value={formData.gender}
                onChange={(e) => setFormData(p => ({ ...p, gender: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
              >
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <select
                value={formData.role}
                onChange={(e) => setFormData(p => ({ ...p, role: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
              >
                <option value="engineer">Engineer</option>
                <option value="qa">QA</option>
              </select>
              <select
                value={formData.title}
                onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
              >
                {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={formData.teamId}
                onChange={(e) => setFormData(p => ({ ...p, teamId: e.target.value }))}
                className="px-4 py-3 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
              >
                <option value="">Select Squad *</option>
                {allSquads.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <label className="flex items-center gap-2 px-4 py-3 bg-muted border border-border rounded-xl cursor-pointer hover:bg-muted/80 transition-colors">
                <input
                  type="checkbox"
                  checked={!!formData.excludeFromUtilization}
                  onChange={(e) => setFormData(p => ({ ...p, excludeFromUtilization: e.target.checked }))}
                  className="w-4 h-4 rounded border-border accent-red-500"
                />
                <span className="text-sm text-foreground">Exclude from Utilization</span>
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={saving || !formData.name || !formData.email || !formData.teamId}
                className="px-5 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : 'Add Engineer'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-5 py-2 text-muted-foreground border border-border rounded-lg hover:text-foreground transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Engineers Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
          </div>
        ) : engineers.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No engineers found</p>
            <p className="text-sm mt-1">{hasFilters ? 'Try adjusting your filters' : 'Add an engineer to get started'}</p>
          </div>
        ) : (
          <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">NIK</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Squad</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dept</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Division</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Title</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {engineers.map((eng) => (
                    <tr key={eng.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/organisation/engineers/${eng.id}`} className="text-foreground hover:text-blue-400 font-medium transition-colors">
                            {eng.name}
                          </Link>
                          {eng.excludeFromUtilization && (
                            <span className="text-[8px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-px rounded" title="Excluded from utilization calculation">EXCL</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{eng.email}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {eng.nik || '—'}
                      </td>
                      <td className="px-4 py-3 text-foreground">{eng.team?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{eng.team?.department?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{eng.team?.department?.division?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          eng.role === 'qa' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {eng.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{eng.title}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/organisation/engineers/${eng.id}`}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            title="View details"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </Link>
                          <button
                            onClick={() => handleDelete(eng.id, eng.name)}
                            className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => fetchEngineers(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 text-xs border border-border rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchEngineers(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1 text-xs border border-border rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
