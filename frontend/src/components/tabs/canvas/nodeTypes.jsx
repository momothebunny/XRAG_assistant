import { Handle, Position } from '@xyflow/react';
import { templateByKey } from './canvasConfig';

export const isPreviewElementId = (id) => String(id || '').startsWith('preview-');

// ── Category palette ───────────────────────────────────────────────────
// Dark, futuristic palette: deep slate base + neon accent per category.
export const PALETTES = {
  sky:     { accent: '#38bdf8', accent2: '#0ea5e9', glow: 'rgba(56,189,248,0.55)',  ring: 'rgba(56,189,248,0.45)' },
  cyan:    { accent: '#22d3ee', accent2: '#06b6d4', glow: 'rgba(34,211,238,0.55)',  ring: 'rgba(34,211,238,0.45)' },
  amber:   { accent: '#fbbf24', accent2: '#f59e0b', glow: 'rgba(251,191,36,0.55)',  ring: 'rgba(251,191,36,0.45)' },
  emerald: { accent: '#34d399', accent2: '#10b981', glow: 'rgba(52,211,153,0.55)',  ring: 'rgba(52,211,153,0.45)' },
  violet:  { accent: '#c4b5fd', accent2: '#a78bfa', glow: 'rgba(196,181,253,0.55)', ring: 'rgba(196,181,253,0.45)' },
  fuchsia: { accent: '#f0abfc', accent2: '#e879f9', glow: 'rgba(240,171,252,0.55)', ring: 'rgba(240,171,252,0.45)' },
  rose:    { accent: '#fb7185', accent2: '#f43f5e', glow: 'rgba(251,113,133,0.55)', ring: 'rgba(251,113,133,0.45)' },
  indigo:  { accent: '#818cf8', accent2: '#6366f1', glow: 'rgba(129,140,248,0.55)', ring: 'rgba(129,140,248,0.45)' },
  slate:   { accent: '#94a3b8', accent2: '#64748b', glow: 'rgba(148,163,184,0.40)', ring: 'rgba(148,163,184,0.35)' },
};

export const paletteFromColorClass = (colorClass = '') => {
  const match = String(colorClass).match(/bg-([a-z]+)-\d{2,3}/);
  const key = match ? match[1] : 'slate';
  return PALETTES[key] || PALETTES.slate;
};

const RUN_STATUS_STYLES = {
  pending: {
    ring: 'ring-2 ring-slate-300/60',
    badge: 'bg-slate-100 text-slate-500 border-slate-300',
    label: 'Pending',
    dot: 'bg-slate-400',
  },
  running: {
    ring: 'ring-2 ring-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.18)] animate-pulse',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    label: 'Running',
    dot: 'bg-amber-500 animate-ping',
  },
  ok: {
    ring: 'ring-2 ring-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.18)]',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    label: 'OK',
    dot: 'bg-emerald-500',
  },
  error: {
    ring: 'ring-2 ring-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.22)]',
    badge: 'bg-rose-100 text-rose-700 border-rose-300',
    label: 'Error',
    dot: 'bg-rose-500',
  },
  skipped: {
    ring: 'ring-2 ring-slate-300/60',
    badge: 'bg-slate-100 text-slate-500 border-slate-300',
    label: 'Skipped',
    dot: 'bg-slate-400',
  },
};

const RagNode = ({ id, data, selected }) => {
  const NodeIcon = templateByKey[data.templateKey]?.icon;
  const isPreviewNode = Boolean(data.isPreviewNode);
  const handleVisibilityClass = selected ? '!opacity-100 !pointer-events-auto' : '!opacity-0 !pointer-events-none';
  const runStatus = data.runStatus;
  const runStyle = runStatus ? RUN_STATUS_STYLES[runStatus] : null;
  const palette = paletteFromColorClass(data.colorClass);

  const emitNodeClick = (event) => {
    if (isPreviewNode) {
      window.dispatchEvent(new CustomEvent('xrag-preview-interaction'));
    }

    if (event.target instanceof Element && event.target.closest('.react-flow__handle')) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent('xrag-node-click', {
        detail: {
          nodeId: id,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
      })
    );
  };

  const baseShadow = `0 2px 12px rgba(0,0,0,0.10), 0 0 0 1px ${palette.accent}50`;
  const hoverShadow = `0 6px 20px rgba(0,0,0,0.15), 0 0 0 2px ${palette.accent}90`;
  const selectedShadow = `0 8px 28px rgba(0,0,0,0.18), 0 0 0 2.5px ${palette.accent}`;

  return (
    <div
      onMouseDown={isPreviewNode ? undefined : emitNodeClick}
      onClick={isPreviewNode ? emitNodeClick : undefined}
      title={
        runStatus === 'error' && data.runError
          ? data.runError
          : runStatus === 'ok' && data.runOutputPreview
          ? data.runOutputPreview
          : undefined
      }
      style={{
        width: 128,
        height: 128,
        background: `linear-gradient(145deg, ${palette.accent}14 0%, #f8fafc 55%)`,
        borderTop: `3px solid ${palette.accent}`,
        borderLeft: `1px solid ${palette.accent}60`,
        borderRight: `1px solid ${palette.accent}60`,
        borderBottom: `1px solid ${palette.accent}60`,
        boxShadow: selected ? selectedShadow : baseShadow,
      }}
      className={`group relative flex flex-col items-center justify-center text-center rounded-xl transition-all duration-200 hover:-translate-y-0.5 ${
        isPreviewNode ? 'opacity-80' : ''
      } ${runStyle ? runStyle.ring : ''}`}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.boxShadow = hoverShadow;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.boxShadow = baseShadow;
      }}
    >
      {/* category label chip — bottom */}
      <span
        aria-hidden
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[7px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-md whitespace-nowrap"
        style={{
          color: palette.accent2,
          background: `${palette.accent}18`,
          border: `1px solid ${palette.accent}35`,
        }}
      >
        {data.category}
      </span>

      {runStyle && (
        <span
          className={`absolute -top-2.5 -right-2.5 z-10 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-sm ${runStyle.badge}`}
          title={data.runError || (data.runDurationMs != null ? `${runStyle.label} • ${data.runDurationMs} ms` : runStyle.label)}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${runStyle.dot}`} />
          {runStyle.label}
          {data.runDurationMs != null && runStatus !== 'running' && runStatus !== 'pending' && (
            <span className="text-[9px] font-medium opacity-70">{data.runDurationMs}ms</span>
          )}
        </span>
      )}

      <Handle type="source" id="source-left" position={Position.Left} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />
      <Handle type="source" id="source-right" position={Position.Right} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />
      <Handle type="source" id="source-top" position={Position.Top} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />
      <Handle type="source" id="source-bottom" position={Position.Bottom} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />

      <Handle type="target" id="target-left" position={Position.Left} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />
      <Handle type="target" id="target-right" position={Position.Right} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />
      <Handle type="target" id="target-top" position={Position.Top} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />
      <Handle type="target" id="target-bottom" position={Position.Bottom} style={{ background: palette.accent, border: `2px solid white`, boxShadow: `0 0 0 1px ${palette.accent}` }} className={`!w-2.5 !h-2.5 ${handleVisibilityClass}`} />

      {/* icon core */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: `linear-gradient(140deg, ${palette.accent2} 0%, ${palette.accent} 100%)`,
          boxShadow: `0 2px 8px ${palette.accent}50, 0 0 0 3px ${palette.accent}20`,
        }}
      >
        <span className="relative" style={{ color: '#ffffff' }}>
          {NodeIcon ? <NodeIcon size={24} strokeWidth={2.2} /> : null}
        </span>
      </div>

      <h4
        className="relative mt-2 px-2 text-[10px] font-bold uppercase tracking-[0.10em] line-clamp-2 leading-tight"
        style={{ color: '#1e293b' }}
        title={data.label}
      >
        {data.label}
      </h4>
    </div>
  );
};

const PreviewBackdropNode = ({ data }) => {
  const theme =
    data?.theme ||
    {
      border: 'rgba(16, 185, 129, 0.65)',
      background: 'rgba(16, 185, 129, 0.24)',
      shadow: 'rgba(16, 185, 129, 0.26)',
    };

  return (
    <div
      className="rounded-3xl border"
      style={{
        width: data.width,
        height: data.height,
        borderColor: theme.border,
        backgroundColor: theme.background,
        pointerEvents: 'none',
        boxShadow: `0 10px 30px ${theme.shadow}`,
        backgroundImage: 'radial-gradient(circle at 12px 12px, rgba(255,255,255,0.28) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    />
  );
};

export const nodeTypes = {
  ragNode: RagNode,
  previewBackdropNode: PreviewBackdropNode,
};
