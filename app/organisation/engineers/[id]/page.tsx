'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
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

interface LeaveRecord {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  notes: string | null;
}

interface AllocationRecord {
  id: string;
  type: string;
  sprintId: number | null;
  startDate: string;
  endDate: string;
  capacityPercent: number;
  notes: string | null;
  team: { id: string; name: string };
}

interface EngineerDetail {
  id: string;
  accountId: string;
  name: string;
  email: string;
  role: string;
  title: string;
  nik: string | null;
  gender: string | null;
  workingHoursPerDay: number | null;
  teamId: string;
  team: TeamInfo;
  leaves: LeaveRecord[];
  capacityAllocations: AllocationRecord[];
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

const ALLOC_TYPE_COLORS: Record<string, string> = {
  SPRINT: 'bg-emerald-500/20 text-emerald-400',
  BAU: 'bg-amber-500/20 text-amber-400',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function EngineerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [engineer, setEngineer] = useState<EngineerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', nik: '', gender: '', role: '', title: '', workingHoursPerDay: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchEngineer = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/organisation/engineers/${id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setEngineer(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load engineer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchEngineer(); }, [fetchEngineer]);

  const startEdit = () => {
    if (!engineer) return;
    setEditForm({
      name: engineer.name,
      email: engineer.email,
      nik: engineer.nik || '',
      gender: engineer.gender || '',
      role: engineer.role,
      title: engineer.title,
      workingHoursPerDay: engineer.workingHoursPerDay != null ? String(engineer.workingHoursPerDay) : '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/organisation/engineers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          ...editForm,
          workingHoursPerDay: editForm.workingHoursPerDay === '' ? null : parseFloat(editForm.workingHoursPerDay),
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setEditing(false);
      setSuccess('Profile updated');
      setTimeout(() => setSuccess(null), 3000);
      fetchEngineer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const titleOptions = ['Tech Lead', 'EM', 'Sec Head', 'Associate', 'QA'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !engineer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error || 'Engineer not found'}</p>
          <Link href="/organisation/engineers" className="text-sm text-blue-400 hover:underline">
            ← Back to Engineers
          </Link>
        </div>
      </div>
    );
  }

  const hierarchy = [
    engineer.team?.department?.division?.group?.name,
    engineer.team?.department?.division?.name,
    engineer.team?.department?.name,
    engineer.team?.name,
  ].filter(Boolean).join(' → ');

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-border bg-background/50 backdrop-blur-xl">
        <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/organisation/engineers" className="hover:text-foreground transition-colors">Engineers</Link>
            <span>/</span>
            <span className="text-foreground">{engineer.name}</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-foreground rounded-xl flex items-center justify-center text-background text-xl font-bold">
                {engineer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">{engineer.name}</h1>
                <p className="text-muted-foreground text-sm">{hierarchy}</p>
              </div>
            </div>
            {!editing && (
              <button
                onClick={startEdit}
                className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all"
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full space-y-6">
        {/* Status messages */}
        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">✓ {success}</div>
        )}

        {/* Profile Card */}
        <div className="bg-muted/30 border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Profile</h2>
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Name</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Email</label>
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">NIK</label>
                  <input
                    value={editForm.nik}
                    onChange={(e) => setEditForm(p => ({ ...p, nik: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Gender</label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm(p => ({ ...p, gender: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="engineer">Engineer</option>
                    <option value="qa">QA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Title</label>
                  <select
                    value={editForm.title}
                    onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  >
                    {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Working Hours/Day</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editForm.workingHoursPerDay}
                    onChange={(e) => setEditForm(p => ({ ...p, workingHoursPerDay: e.target.value }))}
                    placeholder="Default (8)"
                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-xl text-foreground focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-all"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="px-5 py-2 text-muted-foreground border border-border rounded-lg hover:text-foreground transition-all">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoItem label="Email" value={engineer.email} />
              <InfoItem label="NIK" value={engineer.nik || '—'} mono />
              <InfoItem label="Gender" value={engineer.gender ? engineer.gender.charAt(0).toUpperCase() + engineer.gender.slice(1) : '—'} />
              <InfoItem label="Role" value={engineer.role} badge badgeClass={engineer.role === 'qa' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-blue-500/20 text-blue-400'} />
              <InfoItem label="Title" value={engineer.title} />
              <InfoItem label="Squad" value={engineer.team?.name || '—'} />
              <InfoItem label="Hours/Day" value={engineer.workingHoursPerDay != null ? String(engineer.workingHoursPerDay) : '8 (default)'} />
              <InfoItem label="Jira Account" value={engineer.accountId.startsWith('manual-') ? 'Manual' : engineer.accountId.slice(0, 12) + '...'} mono />
            </div>
          )}
        </div>

        {/* Leaves Section */}
        <div className="bg-muted/30 border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Leaves <span className="text-sm font-normal text-muted-foreground">({engineer.leaves.length})</span>
            </h2>
            <Link
              href={`/organisation/leaves?engineerId=${engineer.id}`}
              className="text-xs text-blue-400 hover:underline"
            >
              Manage Leaves →
            </Link>
          </div>
          {engineer.leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave records</p>
          ) : (
            <div className="space-y-2">
              {engineer.leaves.slice(0, 10).map((leave) => (
                <div key={leave.id} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[leave.type] || 'bg-gray-500/20 text-gray-400'}`}>
                      {leave.type}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                    </span>
                    {leave.notes && <span className="text-xs text-muted-foreground">{leave.notes}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {businessDays(leave.startDate, leave.endDate)} day{businessDays(leave.startDate, leave.endDate) !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
              {engineer.leaves.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  + {engineer.leaves.length - 10} more
                </p>
              )}
            </div>
          )}
        </div>

        {/* Capacity Allocations Section */}
        <div className="bg-muted/30 border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Capacity Allocations <span className="text-sm font-normal text-muted-foreground">({engineer.capacityAllocations.length})</span>
          </h2>
          {engineer.capacityAllocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocations</p>
          ) : (
            <div className="space-y-2">
              {engineer.capacityAllocations.map((alloc) => (
                <div key={alloc.id} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ALLOC_TYPE_COLORS[alloc.type] || 'bg-gray-500/20 text-gray-400'}`}>
                      {alloc.type}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatDate(alloc.startDate)} — {formatDate(alloc.endDate)}
                    </span>
                    <span className="text-xs text-muted-foreground">{alloc.team.name}</span>
                    {alloc.sprintId && <span className="text-xs text-muted-foreground font-mono">Sprint #{alloc.sprintId}</span>}
                  </div>
                  <span className="text-sm font-semibold text-foreground">{alloc.capacityPercent}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Helper Component ───────────────────────────────────────────────────────

function InfoItem({ label, value, mono, badge, badgeClass }: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
  badgeClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {badge ? (
        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>{value}</span>
      ) : (
        <p className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
      )}
    </div>
  );
}
