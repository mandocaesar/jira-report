/**
 * Shared color helpers for UI components.
 * Centralizes duplicated color logic from SprintReport, EpicBreakdown,
 * SprintReportPDF, WorklogReport, SprintSummary, UserUtilizationCard, etc.
 */

// ─── Status Colors ─────────────────────────────────────────────────────────────

export interface StatusColorSet {
  bg: string;
  border: string;
  text: string;
  bar: string;
}

const STATUS_COLORS: Record<string, StatusColorSet> = {
  'Done': { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', bar: 'bg-green-500' },
  'In Progress': { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' },
  'To Do': { bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-400', bar: 'bg-gray-500' },
};

const DEFAULT_STATUS_COLORS: StatusColorSet = {
  bg: 'bg-purple-500/10',
  border: 'border-purple-500/20',
  text: 'text-purple-400',
  bar: 'bg-purple-500',
};

export function getStatusColors(category: string): StatusColorSet {
  return STATUS_COLORS[category] || DEFAULT_STATUS_COLORS;
}

// ─── Completion Colors ─────────────────────────────────────────────────────────

export function getCompletionColor(percent: number): string {
  if (percent >= 90) return 'text-green-400';
  if (percent >= 70) return 'text-blue-400';
  if (percent >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

export function getCompletionBarColor(percent: number): string {
  if (percent >= 90) return 'bg-green-500';
  if (percent >= 70) return 'bg-blue-500';
  if (percent >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function getCompletionTextColor(percent: number): string {
  if (percent >= 90) return 'text-green-500';
  if (percent >= 70) return 'text-blue-500';
  if (percent >= 50) return 'text-yellow-500';
  return 'text-red-500';
}

// ─── Utilization Colors ────────────────────────────────────────────────────────

export function getUtilColor(pct: number): string {
  if (pct >= 100) return 'text-green-500';
  if (pct >= 80) return 'text-blue-500';
  if (pct >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

// ─── Heatmap Colors ────────────────────────────────────────────────────────────

export function getHeatmapColor(hours: number): string {
  if (hours === 0) return 'bg-muted/30 text-muted-foreground';
  if (hours < 4) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (hours < 7) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (hours < 9) return 'bg-green-500/20 text-green-400 border-green-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

// ─── Work Type Colors ──────────────────────────────────────────────────────────

export const WORK_TYPE_COLORS: Record<string, StatusColorSet> = {
  'Product': { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  'Technical Initiatives': { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400', bar: 'bg-blue-500' },
  'Incident': { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', bar: 'bg-red-500' },
};
