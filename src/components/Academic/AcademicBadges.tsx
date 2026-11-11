/**
 * iSEPADU AI — Standard Academic Badges & Visual Components
 * Adheres strictly to the Centralized Academic Visual Standard.
 * 
 * Accessible: Always combines color + readable text.
 * Consistent: Reusable across PBD, UASA, Panitia, Dialog Prestasi, and Student Dashboards.
 */

import React from 'react';
import {
  getPbdStatus,
  getPbdSemanticColor,
  getUasaGrade,
  getUasaGradeInterpretation,
  getUasaSemanticColor,
  getProgressDirection,
  getNearMissStatus,
  getMismatchStatus,
  getInterventionPriority,
  ACADEMIC_COLOR_TOKENS,
  INTERVENTION_PRIORITY_STANDARDS,
  PbdLevel,
  UasaGrade,
  InterventionPriority,
} from '../../utils/academicVisualStandard';

// ============================================================================
// 1. PBD BADGE
// ============================================================================

export interface PbdBadgeProps {
  tp: unknown;
  showMeaning?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PbdBadge({ tp, showMeaning = false, size = 'md', className = '' }: PbdBadgeProps) {
  const info = getPbdStatus(tp);

  if (!info) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-slate-400 bg-slate-50 border-slate-200 font-mono ${size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-xs'} ${className}`}>
        -
      </span>
    );
  }

  const tokenStyle = ACADEMIC_COLOR_TOKENS[info.semanticColor];
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3.5 py-1.5 text-sm',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl border font-black transition-all ${tokenStyle.tailwind.badge} ${sizeClasses} ${className}`}
      title={`${info.code}: ${info.meaningMs}`}
    >
      <span className="font-mono tracking-tight">{info.code}</span>
      {showMeaning && (
        <span className="font-medium text-[10px] opacity-80 border-l pl-1.5 ml-0.5 border-current">
          {info.actionRequiredMs}
        </span>
      )}
    </span>
  );
}

// ============================================================================
// 2. UASA BADGE
// ============================================================================

export interface UasaBadgeProps {
  mark?: number | string | null;
  grade?: UasaGrade | string | null;
  showMark?: boolean;
  showInterpretation?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UasaBadge({
  mark,
  grade: explicitGrade,
  showMark = true,
  showInterpretation = false,
  size = 'md',
  className = '',
}: UasaBadgeProps) {
  // Always derive grade automatically from mark if available
  const resolvedGrade = (mark !== undefined && mark !== null && mark !== '')
    ? getUasaGrade(mark)
    : (explicitGrade as UasaGrade | 'TH' | null);

  if (!resolvedGrade) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-slate-400 bg-slate-50 border-slate-200 font-mono text-xs ${className}`}>
        -
      </span>
    );
  }

  const colorToken = getUasaSemanticColor(resolvedGrade);
  const tokenStyle = ACADEMIC_COLOR_TOKENS[colorToken];
  const interpretation = getUasaGradeInterpretation(resolvedGrade);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3.5 py-1.5 text-sm',
  }[size];

  const formattedMark = mark !== undefined && mark !== null && mark !== '' 
    ? (typeof mark === 'number' ? Math.round(mark) : mark)
    : null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl border font-black transition-all ${tokenStyle.tailwind.badge} ${sizeClasses} ${className}`}
      title={`Gred ${resolvedGrade}: ${interpretation}`}
    >
      {showMark && formattedMark !== null && (
        <span className="font-mono text-slate-800 font-bold">{formattedMark}</span>
      )}
      <span className="px-1.5 py-0.2 rounded-md bg-white/70 border border-current font-black">
        {resolvedGrade}
      </span>
      {showInterpretation && (
        <span className="text-[10px] uppercase font-bold opacity-85 ml-0.5">
          {interpretation}
        </span>
      )}
    </span>
  );
}

// ============================================================================
// 3. PROGRESSION INDICATOR (↑ / → / ↓)
// ============================================================================

export interface ProgressIndicatorProps {
  previous: unknown;
  current: unknown;
  showLabel?: boolean;
  className?: string;
}

export function ProgressIndicator({
  previous,
  current,
  showLabel = false,
  className = '',
}: ProgressIndicatorProps) {
  const prog = getProgressDirection(previous, current);

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs ${prog.cssClass} ${className}`}
      title={prog.labelMs}
    >
      <span className="text-sm font-black">{prog.symbol}</span>
      {showLabel && (
        <span className="text-[10px] uppercase font-bold tracking-tight">
          {prog.labelMs}
        </span>
      )}
    </span>
  );
}

// ============================================================================
// 4. NEAR MISS & MISMATCH BADGES
// ============================================================================

export function NearMissBadge({ current, target }: { current: unknown; target?: unknown }) {
  const status = getNearMissStatus(current, target);
  if (!status.isNearMiss) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-yellow-100 border border-yellow-300 text-yellow-950 text-[10px] font-black uppercase tracking-tight shadow-xs"
      title={`${status.targetDescription} — ${status.suggestedActionMs}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-ping" />
      Near Miss
      <span className="text-[9px] opacity-75 font-mono">({status.targetDescription})</span>
    </span>
  );
}

export function MismatchBadge({ actual, target }: { actual: unknown; target: unknown }) {
  const status = getMismatchStatus(actual, target);
  if (!status.isMismatch) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black uppercase tracking-tight shadow-xs"
      title={status.detailsMs}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
      Mismatch
      <span className="text-[9px] font-mono opacity-80">(-{status.gap})</span>
    </span>
  );
}

// ============================================================================
// 5. INTERVENTION PRIORITY BADGE
// ============================================================================

export interface InterventionPriorityBadgeProps {
  priority?: InterventionPriority;
  current?: unknown;
  target?: unknown;
  previous?: unknown;
  showSummary?: boolean;
  size?: 'sm' | 'md';
}

export function InterventionPriorityBadge({
  priority: explicitPriority,
  current,
  target,
  previous,
  showSummary = false,
  size = 'md',
}: InterventionPriorityBadgeProps) {
  const resolved = explicitPriority
    ? INTERVENTION_PRIORITY_STANDARDS[explicitPriority]
    : getInterventionPriority(current, target, previous);

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-xs';

  return (
    <div className="inline-flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-xl border uppercase tracking-wider ${resolved.badgeClass} ${sizeClasses}`}
        title={resolved.actionSummaryMs}
      >
        <span className="w-2 h-2 rounded-full bg-current opacity-80" />
        {resolved.labelMs}
      </span>
      {showSummary && (
        <span className="text-[10px] text-slate-500 italic max-w-xs leading-tight mt-0.5">
          {resolved.actionSummaryMs}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// 6. PBD PROGRESSION MATRIX ROW
// Table View: Nama Murid | TOV | OTI1 | AR1 | OTI2 | AR2 | ETR
// ============================================================================

export interface PbdProgressionRowProps {
  tov?: unknown;
  oti1?: unknown;
  ar1?: unknown;
  oti2?: unknown;
  ar2?: unknown;
  etr?: unknown;
}

export function PbdProgressionRow({ tov, oti1, ar1, oti2, ar2, etr }: PbdProgressionRowProps) {
  const cells = [
    { label: 'TOV', value: tov },
    { label: 'OTI1', value: oti1 },
    { label: 'AR1', value: ar1 },
    { label: 'OTI2', value: oti2 },
    { label: 'AR2', value: ar2 },
    { label: 'ETR', value: etr },
  ];

  return (
    <div className="flex items-center gap-1.5 font-mono">
      {cells.map((c, i) => (
        <div key={i} className="flex flex-col items-center">
          <span className="text-[8px] font-black uppercase text-slate-400 mb-0.5">{c.label}</span>
          <PbdBadge tp={c.value} size="sm" />
        </div>
      ))}
    </div>
  );
}
