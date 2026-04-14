'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamMemberInfo {
  id: string;
  name: string;
  nik: string | null;
  team: {
    id: string;
    name: string;
    department?: {
      name: string;
      division?: { name: string };
    };
  };
}

interface LeaveRecord {
  id: string;
  teamMemberId: string;
  startDate: string;
  endDate: string;
  type: string;
  notes: string | null;
  teamMember: TeamMemberInfo;
}

interface EngineerOption {
  id: string;
  name: string;
  nik: string | null;
  team: { name: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toInputDate(dateStr: string) {
  return new Date(dateStr).toISOString().split('T')[0];
}

function businessDays(start: string, end: string): number {
  let count = 0;
  const d = new Date(start);
  const e = new Date(end);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

const LEAVE_TYPE_COLORS: Record<string, string> = {
  annual: 'bg-blue-500/20 text-blue-400',
  sick: 'bg-red-500/20 text-red-400',
  personal: 'bg-purple-500/20 text-purple-400',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function LeavesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" /></div>}>
      <LeavesPageInner />
    </Suspense>
  );
}

function LeavesPageInner() {
  const searchParams = useSearchParams();
  const presetEngineerId = searchParams.get('engineerId') || '';
  const [activeTab, setActiveTab] = useState<'leaves' | 'exclusions'>('leaves');

  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterTeamMemberId, setFilterTeamMemberId] = useState(presetEngineerId);

  // Engineers for dropdown
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);

  // Add / Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ teamMemberId: presetEngineerId, startDate: '', endDate: '', type: 'annual', notes: '' });
  const [engineerSearch, setEngineerSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch engineers for dropdown
  useEffect(() => {
    fetch('/api/organisation/engineers?pageSize=500')
      .then(r => r.json())
      .then(data => {
        if (data.success) setEngineers(data.data);
      })
      .catch(() => {});
  }, []);

  const fetchLeaves = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterTeamMemberId) params.set('teamMemberId', filterTeamMemberId);
      if (filterType) params.set('type', filterType);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      params.set('page', String(page));
      params.set('pageSize', '50');

      const res = await fetch(`/api/organisation/leaves?${params}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setLeaves(result.data);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaves');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterTeamMemberId, filterType, filterStartDate, filterEndDate]);

  useEffect(() => { fetchLeaves(1); }, [fetchLeaves]);

  const showSuccessMsg = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const openAdd = () => {
    setEditingId(null);
    setFormData({ teamMemberId: filterTeamMemberId || presetEngineerId, startDate: '', endDate: '', type: 'annual', notes: '' });
    setEngineerSearch('');
    setShowForm(true);
  };

  const openEdit = (leave: LeaveRecord) => {
    setEditingId(leave.id);
    setFormData({
      teamMemberId: leave.teamMemberId,
      startDate: toInputDate(leave.startDate),
      endDate: toInputDate(leave.endDate),
      type: leave.type,
      notes: leave.notes || '',
    });
    setEngineerSearch('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.teamMemberId || !formData.startDate || !formData.endDate) return;
    try {
      setSaving(true);
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { id: editingId, ...formData } : formData;

      const res = await fetch('/api/organisation/leaves', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      setShowForm(false);
      setEditingId(null);
      showSuccessMsg(editingId ? 'Leave updated' : 'Leave created');
      fetchLeaves(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save leave');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this leave record?')) return;
    try {
      const res = await fetch(`/api/organisation/leaves?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      showSuccessMsg('Leave deleted');
      fetchLeaves(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete leave');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterType('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterTeamMemberId('');
  };

  const hasFilters = search || filterType || filterStartDate || filterEndDate || filterTeamMemberId;

  // Filter engineers dropdown by search text
  const filteredEngineers = engineerSearch
    ? engineers.filter(e =>
        e.name.toLowerCase().includes(engineerSearch.toLowerCase()) ||
        (e.nik && e.nik.toLowerCase().includes(engineerSearch.toLowerCase()))
      )
    : engineers;

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-border bg-background/50 backdrop-blur-xl">
        <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth={2.5} />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Leaves</h1>
                <p className="text-muted-foreground text-sm">
                  {pagination.total} leave record{pagination.total !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={openAdd}
              className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all"
            >
              + Add Leave
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="px-3 sm:px-4 md:px-6 pt-4">
        <div className="flex gap-1 bg-muted/30 border border-border rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${activeTab === 'leaves' ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Leave Records
          </button>
          <button
            onClick={() => setActiveTab('exclusions')}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${activeTab === 'exclusions' ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sprint Exclusions
          </button>
        </div>
      </div>

      {activeTab === 'leaves' && (
      <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full space-y-6">
        {/* Status Messages */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">✓ {success}</div>
        )}

        {/* Filters */}
        <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name or NIK..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50 text-sm"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Types</option>
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">From</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="px-4 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">To</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="px-4 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <select
              value={filterTeamMemberId}
              onChange={(e) => setFilterTeamMemberId(e.target.value)}
              className="px-4 py-2 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50 max-w-xs"
            >
              <option value="">All Engineers</option>
              {engineers.map(e => <option key={e.id} value={e.id}>{e.name} {e.nik ? `(${e.nik})` : ''}</option>)}
            </select>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <div className="p-6 bg-muted/30 border border-border rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{editingId ? 'Edit Leave' : 'Add Leave'}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Engineer selector with search */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-xs text-muted-foreground mb-1">Engineer *</label>
                <input
                  type="text"
                  placeholder="Search engineer..."
                  value={engineerSearch}
                  onChange={(e) => setEngineerSearch(e.target.value)}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50 text-sm mb-1"
                />
                <select
                  value={formData.teamMemberId}
                  onChange={(e) => setFormData(p => ({ ...p, teamMemberId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                  size={Math.min(filteredEngineers.length + 1, 6)}
                >
                  <option value="">Select Engineer...</option>
                  {filteredEngineers.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} {e.nik ? `(${e.nik})` : ''} — {e.team.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start Date *</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">End Date *</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(p => ({ ...p, type: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                >
                  <option value="annual">Annual</option>
                  <option value="sick">Sick</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
            {formData.startDate && formData.endDate && new Date(formData.endDate) >= new Date(formData.startDate) && (
              <p className="text-xs text-muted-foreground">
                Duration: {businessDays(formData.startDate, formData.endDate)} working day(s)
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formData.teamMemberId || !formData.startDate || !formData.endDate}
                className="px-5 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : editingId ? 'Update Leave' : 'Add Leave'}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-5 py-2 text-muted-foreground border border-border rounded-lg hover:text-foreground transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Leaves Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
          </div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No leave records found</p>
            <p className="text-sm mt-1">{hasFilters ? 'Try adjusting your filters' : 'Add a leave record to get started'}</p>
          </div>
        ) : (
          <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">NIK</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Squad</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dept</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Division</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Start</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">End</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Days</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {leave.teamMember.nik || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/organisation/engineers/${leave.teamMemberId}`} className="text-foreground hover:text-blue-400 font-medium transition-colors">
                          {leave.teamMember.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{leave.teamMember.team?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{leave.teamMember.team?.department?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{leave.teamMember.team?.department?.division?.name || '—'}</td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatDate(leave.startDate)}</td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatDate(leave.endDate)}</td>
                      <td className="px-4 py-3 text-center text-foreground font-medium">
                        {businessDays(leave.startDate, leave.endDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[leave.type] || 'bg-gray-500/20 text-gray-400'}`}>
                          {leave.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(leave)}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(leave.id)}
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
                    onClick={() => fetchLeaves(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 text-xs border border-border rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchLeaves(pagination.page + 1)}
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
      )}

      {activeTab === 'exclusions' && (
        <SprintExclusionsTab />
      )}
    </div>
  );
}

// ─── Sprint Exclusions Tab ──────────────────────────────────────────────────

interface SprintMember {
  accountId: string;
  name: string;
  role: string;
  title: string;
}

function SprintExclusionsTab() {
  const [boardId, setBoardId] = useState<number | null>(null);
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [members, setMembers] = useState<SprintMember[]>([]);
  const [leaveData, setLeaveData] = useState<Record<string, number>>({});
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Fetch team members when board changes
  useEffect(() => {
    if (!boardId) { setMembers([]); return; }
    setLoadingMembers(true);
    fetch(`/api/team-members?boardId=${boardId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.teams?.length > 0) {
          const allMembers: SprintMember[] = [];
          for (const team of json.data.teams) {
            for (const m of team.members) {
              allMembers.push({ accountId: m.accountId, name: m.name, role: m.role, title: m.title });
            }
          }
          setMembers(allMembers);
        } else {
          setMembers([]);
        }
      })
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [boardId]);

  // Fetch leave data when sprint changes
  useEffect(() => {
    if (!sprintId) { setLeaveData({}); setDirty(false); return; }
    setLoadingLeave(true);
    fetch(`/api/leave?sprintId=${sprintId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          const map: Record<string, number> = {};
          if (json.data) {
            for (const [accountId, days] of Object.entries(json.data)) {
              map[accountId] = days as number;
            }
          }
          setLeaveData(map);
        }
      })
      .catch(() => {})
      .finally(() => { setLoadingLeave(false); setDirty(false); });
  }, [sprintId]);

  const toggleExclude = (accountId: string) => {
    setLeaveData(prev => ({
      ...prev,
      [accountId]: prev[accountId] === -1 ? 0 : -1,
    }));
    setDirty(true);
  };

  const updateLeaveDays = (accountId: string, days: number) => {
    setLeaveData(prev => ({ ...prev, [accountId]: days }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!sprintId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprintId, leaveData }),
      });
      const result = await res.json();
      if (result.success) {
        setDirty(false);
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(null), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const excludedCount = members.filter(m => leaveData[m.accountId] === -1).length;
  const activeMembers = members.filter(m => leaveData[m.accountId] !== -1);
  const totalLeaveDays = activeMembers.reduce((sum, m) => sum + (leaveData[m.accountId] || 0), 0);

  return (
    <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full space-y-6">
      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BoardSelector selectedBoardId={boardId} onBoardChange={(id) => { setBoardId(id); setSprintId(null); }} />
        {boardId && (
          <SprintSelector boardId={boardId} selectedSprintId={sprintId} onSprintChange={setSprintId} />
        )}
      </div>

      {!boardId && (
        <div className="py-8 text-center text-muted-foreground text-sm">Select a board to manage sprint exclusions</div>
      )}
      {boardId && !sprintId && (
        <div className="py-8 text-center text-muted-foreground text-sm">Select a sprint to manage exclusions and leave days</div>
      )}

      {sprintId && (loadingMembers || loadingLeave) && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      )}

      {sprintId && !loadingMembers && !loadingLeave && members.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Active</p>
              <p className="text-lg font-bold text-foreground">{members.length - excludedCount}</p>
            </div>
            <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total Leave Days</p>
              <p className="text-lg font-bold text-amber-400">{totalLeaveDays}</p>
            </div>
            <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Excluded</p>
              <p className="text-lg font-bold text-red-400">{excludedCount}</p>
            </div>
          </div>

          {/* Member list */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Team Members</h3>
              <div className="flex items-center gap-2">
                {saveMsg && <span className="text-xs text-green-400">✓ {saveMsg}</span>}
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="px-4 py-1.5 text-xs bg-foreground text-background rounded-lg disabled:opacity-30 hover:bg-foreground/90 transition-all"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
            <div className="divide-y divide-border">
              {members.map(member => {
                const isExcluded = leaveData[member.accountId] === -1;
                const days = leaveData[member.accountId] || 0;

                return (
                  <div
                    key={member.accountId}
                    className={`flex items-center justify-between p-3 transition-all ${isExcluded ? 'bg-red-900/10 opacity-60' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {member.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded ring-1 ${member.role === 'qa' ? 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/20' : 'bg-blue-500/15 text-blue-400 ring-blue-500/20'}`}>
                          {member.role}
                        </span>
                        {member.title && <span className="text-[10px] text-muted-foreground">{member.title}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExcluded ? (
                        <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-lg">
                          EXCLUDED
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={days}
                            onChange={e => updateLeaveDays(member.accountId, Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-16 px-2 py-1 text-center bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:border-blue-500 text-sm"
                          />
                          <span className="text-sm text-muted-foreground w-12">day{days !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                      <button
                        onClick={() => toggleExclude(member.accountId)}
                        title={isExcluded ? 'Include in sprint' : 'Exclude from sprint'}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-sm ${isExcluded ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/10 text-red-400/60 hover:bg-red-500/20 hover:text-red-400'}`}
                      >
                        {isExcluded ? '✓' : '✕'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
