'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type NodeType = 'group' | 'division' | 'department' | 'squad';

interface OrgNode {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  type: NodeType;
  parentId?: string;
  childCount: number;
  children?: OrgNode[];
  extra?: Record<string, unknown>;
}

interface FormData {
  name: string;
  code: string;
  isActive: boolean;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" d="M12 5v14m-7-7h14" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<NodeType, string> = {
  group: 'Group',
  division: 'Division',
  department: 'Department',
  squad: 'Squad',
};

const CHILD_TYPE: Record<string, NodeType | null> = {
  group: 'division',
  division: 'department',
  department: 'squad',
  squad: null,
};

const TYPE_COLORS: Record<NodeType, string> = {
  group: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  division: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  department: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  squad: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const API_PATHS: Record<NodeType, string> = {
  group: '/api/organisation/groups',
  division: '/api/organisation/divisions',
  department: '/api/organisation/departments',
  squad: '/api/settings/teams',
};

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

// ─── Transform API response into tree ────────────────────────────────────────

interface ApiGroup {
  id: string; name: string; code: string; isActive: boolean;
  divisions: ApiDivision[];
}
interface ApiDivision {
  id: string; name: string; code: string; isActive: boolean; groupId: string;
  departments: ApiDepartment[];
}
interface ApiDepartment {
  id: string; name: string; code: string; isActive: boolean; divisionId: string;
  teams: ApiTeam[];
}
interface ApiTeam {
  id: string; name: string; boardId: number; departmentId?: string | null;
  workingHoursPerDay: number; isActive?: boolean;
  _count?: { members: number };
}

function transformTree(groups: ApiGroup[]): OrgNode[] {
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    code: g.code,
    isActive: g.isActive,
    type: 'group' as NodeType,
    childCount: g.divisions.length,
    children: g.divisions.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      isActive: d.isActive,
      type: 'division' as NodeType,
      parentId: g.id,
      childCount: d.departments.length,
      children: d.departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        code: dept.code,
        isActive: dept.isActive,
        type: 'department' as NodeType,
        parentId: d.id,
        childCount: dept.teams.length,
        children: dept.teams.map((t) => ({
          id: t.id,
          name: t.name,
          code: `BOARD-${t.boardId}`,
          isActive: true,
          type: 'squad' as NodeType,
          parentId: dept.id,
          childCount: t._count?.members ?? 0,
          extra: { boardId: t.boardId, workingHoursPerDay: t.workingHoursPerDay, memberCount: t._count?.members ?? 0 },
        })),
      })),
    })),
  }));
}

// ─── Tree Node Component ─────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onAddChild,
}: {
  node: OrgNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (node: OrgNode) => void;
  onToggle: (id: string) => void;
  onAddChild: (parentNode: OrgNode) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const childType = CHILD_TYPE[node.type];

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-foreground/10 border border-border'
            : 'hover:bg-muted'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand toggle */}
        <button
          className={`p-0.5 rounded transition-colors ${hasChildren ? 'hover:bg-muted-foreground/20' : 'invisible'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          <ChevronIcon open={isExpanded} />
        </button>

        {/* Badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_COLORS[node.type]}`}>
          {TYPE_LABELS[node.type].charAt(0)}
        </span>

        {/* Name */}
        <span className={`text-sm flex-1 truncate ${!node.isActive ? 'line-through opacity-50' : ''}`}>
          {node.name}
        </span>

        {/* Child count */}
        {node.childCount > 0 && (
          <span className="text-xs text-muted-foreground">{node.childCount}</span>
        )}

        {/* Add child button */}
        {childType && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/20 transition-opacity"
            title={`Add ${TYPE_LABELS[childType]}`}
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node);
            }}
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {/* Children */}
      {isExpanded && node.children?.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  form,
  setForm,
  onSave,
  onDelete,
  saving,
}: {
  node: OrgNode;
  form: FormData;
  setForm: (f: FormData) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const isSquad = node.type === 'squad';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded border ${TYPE_COLORS[node.type]}`}>
            {TYPE_LABELS[node.type]}
          </span>
          <h2 className="text-lg font-semibold">{node.name}</h2>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            {isSquad ? 'Board ID' : 'Code'}
          </label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            disabled={isSquad}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
          />
        </div>

        {!isSquad && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground">Active</label>
            <button
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        )}

        {/* Squad extras */}
        {isSquad && node.extra && (
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Members</span>
              <span className="font-medium">{node.extra.memberCount as number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Working Hours/Day</span>
              <span className="font-medium">{node.extra.workingHoursPerDay as number}h</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onDelete}
          disabled={saving || node.childCount > 0}
          title={node.childCount > 0 ? 'Remove child entities first' : 'Delete this entity'}
          className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <TrashIcon />
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Add Entity Modal ────────────────────────────────────────────────────────

function AddModal({
  type,
  parentName,
  onClose,
  onSubmit,
  saving,
}: {
  type: NodeType;
  parentName: string;
  onClose: () => void;
  onSubmit: (name: string, code: string) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const isSquad = type === 'squad';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-2xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-1">
          Add {TYPE_LABELS[type]}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Under <span className="font-medium text-foreground">{parentName}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${type === 'group' ? 'Technology' : type === 'division' ? 'Digital Banking' : type === 'department' ? 'Payments' : 'Fund Transfer'}`}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {isSquad ? 'Board ID' : 'Code'}
            </label>
            <input
              type={isSquad ? 'number' : 'text'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isSquad ? 'e.g. 3816' : 'e.g. TECH'}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={() => onSubmit(name, code)}
            disabled={saving || !name.trim() || !code.trim()}
            className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function OrganisationStructurePage() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormData>({ name: '', code: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal state for adding entities
  const [addModal, setAddModal] = useState<{ type: NodeType; parentId: string; parentName: string } | null>(null);

  // ─── Fetch tree ──────────────────────────────────────────────────────────
  const fetchTree = useCallback(async () => {
    try {
      const res = await apiFetch<ApiGroup[]>('/api/organisation/structure');
      if (res.success && res.data) {
        setTree(transformTree(res.data));
        setError(null);
      } else {
        setError(res.error || 'Failed to load');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // ─── Toast auto-dismiss ──────────────────────────────────────────────────
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleSelect = (node: OrgNode) => {
    setSelectedNode(node);
    setForm({ name: node.name, code: node.code, isActive: node.isActive });
  };

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddChild = (parentNode: OrgNode) => {
    const childType = CHILD_TYPE[parentNode.type];
    if (!childType) return;
    setAddModal({ type: childType, parentId: parentNode.id, parentName: parentNode.name });
    // Auto-expand parent
    setExpandedIds((prev) => new Set(prev).add(parentNode.id));
  };

  const handleAddGroup = () => {
    setAddModal({ type: 'group', parentId: '', parentName: 'Root' });
  };

  const handleCreateEntity = async (name: string, code: string) => {
    if (!addModal) return;
    setSaving(true);
    try {
      const { type, parentId } = addModal;
      let body: Record<string, unknown>;

      if (type === 'squad') {
        // Squads use the existing teams API
        body = { name: name.trim(), boardId: parseInt(code), departmentId: parentId || undefined };
      } else {
        const parentKeyMap: Record<string, string> = { division: 'groupId', department: 'divisionId' };
        body = { name: name.trim(), code: code.trim().toUpperCase() };
        if (parentKeyMap[type] && parentId) {
          body[parentKeyMap[type]] = parentId;
        }
      }

      const res = await apiFetch(API_PATHS[type], {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (res.success) {
        setToast({ message: `${TYPE_LABELS[type]} created`, type: 'success' });
        setAddModal(null);
        await fetchTree();
      } else {
        setToast({ message: res.error || 'Create failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedNode) return;
    setSaving(true);
    try {
      const { type, id } = selectedNode;
      const body: Record<string, unknown> = { id, name: form.name.trim(), isActive: form.isActive };

      if (type !== 'squad') {
        body.code = form.code.trim().toUpperCase();
      }

      const res = await apiFetch(API_PATHS[type], {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      if (res.success) {
        setToast({ message: 'Updated successfully', type: 'success' });
        await fetchTree();
        // Re-select with updated data
        setSelectedNode({ ...selectedNode, name: form.name.trim(), code: form.code.trim(), isActive: form.isActive });
      } else {
        setToast({ message: res.error || 'Update failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNode) return;
    if (!confirm(`Delete "${selectedNode.name}"? This action cannot be undone.`)) return;
    setSaving(true);
    try {
      const { type, id } = selectedNode;
      const url = type === 'squad'
        ? `${API_PATHS[type]}?id=${id}`
        : `${API_PATHS[type]}?id=${id}`;

      const res = await apiFetch(url, { method: 'DELETE' });

      if (res.success) {
        setToast({ message: 'Deleted successfully', type: 'success' });
        setSelectedNode(null);
        await fetchTree();
      } else {
        setToast({ message: res.error || 'Delete failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-muted-foreground">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading organisation structure...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Organisation Structure</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the Group → Division → Department → Squad hierarchy
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Left: Tree Panel */}
        <div className="bg-background border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Hierarchy</h2>
            <button
              onClick={handleAddGroup}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground/10 border border-border rounded-lg text-xs font-medium hover:bg-foreground/20 transition-colors"
            >
              <PlusIcon />
              Add Group
            </button>
          </div>

          <div className="p-2 max-h-[calc(100vh-240px)] overflow-y-auto">
            {tree.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <p>No organisation structure yet.</p>
                <p className="mt-1">Click &ldquo;Add Group&rdquo; to start building your hierarchy.</p>
              </div>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedNode?.id ?? null}
                  expandedIds={expandedIds}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                  onAddChild={handleAddChild}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="bg-background border border-border rounded-2xl p-6">
          {selectedNode ? (
            <DetailPanel
              node={selectedNode}
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onDelete={handleDelete}
              saving={saving}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <p className="text-sm">Select a node from the tree to view or edit</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg border text-sm z-50 transition-all ${
          toast.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Add Modal */}
      {addModal && (
        <AddModal
          type={addModal.type}
          parentName={addModal.parentName}
          onClose={() => setAddModal(null)}
          onSubmit={handleCreateEntity}
          saving={saving}
        />
      )}
    </div>
  );
}
