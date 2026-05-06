import { Handle, Position } from '@xyflow/react';
import { templateByKey } from './canvasConfig';

// ── Config summary — one-line description shown under the node title ───
// Extracts the most meaningful value from the node's config so the user
// can scan the canvas without opening every inspector panel.
const getConfigSummary = (templateKey, config) => {
  if (!config) return null;
  switch (templateKey) {
    case 'brain-llm':
    case 'brain-vision-llm':
    case 'brain-hyde-gen': {
      const mid = config.metadata?.model_id || config.model_id || '';
      const temp = config.metadata?.temperature ?? config.temperature;
      const parts = [];
      if (mid) parts.push(mid.split('/').pop());
      if (temp != null) parts.push(`${temp}°`);
      return parts.join(' · ') || null;
    }
    case 'process-embedding': {
      const mid = config.model_id || '';
      const dims = config.output_dimensions;
      const prov = config.embeddingProvider || config.gateway || '';
      const parts = [];
      if (mid) parts.push(mid.split('/').pop());
      else if (prov) parts.push(prov);
      if (dims) parts.push(`${dims}d`);
      return parts.join(' · ') || null;
    }
    case 'storage-vector': {
      const prov = config.provider || '';
      const idx = config.indexName || config.collection || '';
      const ns = config.namespace;
      const parts = [];
      if (prov) parts.push(prov);
      if (idx) parts.push(idx);
      if (ns) parts.push(`ns:${ns}`);
      return parts.join(' · ') || null;
    }
    case 'process-retriever': {
      const strat = config.strategy || '';
      const k = config.topK;
      const prov = config.retrieverProvider || '';
      const parts = [];
      if (prov && prov !== 'vector-store') parts.push(prov);
      if (strat) parts.push(strat);
      if (k != null) parts.push(`k=${k}`);
      return parts.join(' · ') || null;
    }
    case 'process-reranker': {
      const mid = config.metadata?.model_id || '';
      const topN = config.metadata?.top_n;
      const parts = [];
      if (mid) parts.push(mid.split('/').pop());
      if (topN != null) parts.push(`top${topN}`);
      return parts.join(' · ') || null;
    }
    case 'process-chunking': {
      const strat = config.strategy || '';
      const size = config.chunkSize;
      const overlap = config.overlap;
      const parts = [];
      if (strat) parts.push(strat);
      if (size != null) parts.push(`${size}c`);
      if (overlap != null) parts.push(`+${overlap}`);
      return parts.join(' · ') || null;
    }
    case 'input-upload': {
      const scope = config.scope || 'all';
      if (scope === 'folders' && Array.isArray(config.selectedFolders) && config.selectedFolders.length)
        return `${config.selectedFolders.length} folder${config.selectedFolders.length !== 1 ? 's' : ''}`;
      if (scope === 'documents' && Array.isArray(config.selectedDocumentIds) && config.selectedDocumentIds.length)
        return `${config.selectedDocumentIds.length} doc${config.selectedDocumentIds.length !== 1 ? 's' : ''}`;
      return scope === 'all' ? 'all docs' : null;
    }
    case 'input-url': {
      const urls = config.urls || config.url || '';
      const first = Array.isArray(urls) ? urls[0] : String(urls);
      if (!first) return null;
      try { return new URL(first).hostname; } catch { return first.slice(0, 24); }
    }
    case 'storage-graph': {
      const prov = config.provider || '';
      const db = config.database || '';
      const parts = [prov, db].filter(Boolean);
      return parts.join(' · ') || null;
    }
    case 'brain-router':
    case 'process-query-rewriter': {
      const model = config.model || config.metadata?.model_id || '';
      return model ? model.split('/').pop() : null;
    }
    case 'input-system-prompt': {
      const preset = config.preset || '';
      return preset || null;
    }
    case 'user-actor': {
      const uid = config.userId || config.tenantId || '';
      return uid || null;
    }
    case 'process-pii-redaction': {
      const active = [];
      if (config.redactEmails) active.push('email');
      if (config.redactPhones) active.push('phone');
      if (config.redactCreditCards) active.push('CC');
      if (active.length === 0) return 'off';
      return active.join(', ');
    }
    case 'storage-keyvalue': {
      const prov = config.provider || '';
      const ttl = config.ttlSeconds;
      const parts = [];
      if (prov) parts.push(prov);
      if (ttl != null) parts.push(`TTL ${ttl}s`);
      return parts.join(' · ') || null;
    }
    default:
      return null;
  }
};

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
  const configSummary = getConfigSummary(data.templateKey, data.config);

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

  const emitNodeDoubleClick = (event) => {
    if (isPreviewNode) {
      window.dispatchEvent(new CustomEvent('xrag-preview-interaction'));
    }

    if (event.target instanceof Element && event.target.closest('.react-flow__handle')) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent('xrag-node-double-click', {
        detail: {
          nodeId: id,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
      })
    );
  };

  // LangFlow-style horizontal card on dark surface: icon panel on the left,
  // title + category on the right. Accent colour drives the left stripe,
  // icon panel tint, icon gradient and category label.
  const baseShadow = `0 2px 10px rgba(0,0,0,0.60), 0 0 0 1.5px ${palette.accent}88, 0 0 16px ${palette.accent}30`;
  const hoverShadow = `0 4px 18px rgba(0,0,0,0.65), 0 0 0 1.5px ${palette.accent}, 0 0 22px ${palette.accent}35`;
  const selectedShadow = `0 6px 24px rgba(0,0,0,0.70), 0 0 0 2px ${palette.accent}, 0 0 32px ${palette.accent}50`;

  const handleStyle = {
    background: palette.accent,
    border: `2px solid ${palette.accent}90`,
    boxShadow: `0 0 0 1px ${palette.accent}`,
  };

  return (
    <div
      onMouseDown={isPreviewNode ? undefined : emitNodeClick}
      onClick={isPreviewNode ? emitNodeClick : undefined}
      onDoubleClick={emitNodeDoubleClick}
      title={
        runStatus === 'error' && data.runError
          ? data.runError
          : runStatus === 'ok' && data.runOutputPreview
          ? data.runOutputPreview
          : undefined
      }
      style={{
        width: 188,
        minHeight: 66,
        background: `linear-gradient(140deg, ${palette.accent}45 0%, ${palette.accent}18 50%, #0f172a 100%)`,
        borderRadius: 12,
        boxShadow: selected ? selectedShadow : baseShadow,
        overflow: 'hidden',
      }}
      className={`group relative flex items-stretch transition-all duration-150 hover:-translate-y-0.5 ${
        isPreviewNode ? 'opacity-80' : ''
      } ${runStyle ? runStyle.ring : ''}`}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.boxShadow = hoverShadow;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.boxShadow = baseShadow;
      }}
    >
      {/* Left accent stripe — carries the category color */}
      <div
        aria-hidden
        style={{
          width: 4,
          background: `linear-gradient(180deg, ${palette.accent} 0%, ${palette.accent2} 100%)`,
          flexShrink: 0,
        }}
      />

      {/* Icon panel */}
      <div
        className="flex items-center justify-center"
        style={{
          width: 46,
          flexShrink: 0,
          background: `linear-gradient(140deg, ${palette.accent}55 0%, ${palette.accent}28 100%)`,
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: `linear-gradient(140deg, ${palette.accent2} 0%, ${palette.accent} 100%)`,
            boxShadow: `0 2px 6px ${palette.accent}40`,
            color: '#0f172a',
          }}
        >
          {NodeIcon ? <NodeIcon size={16} strokeWidth={2.4} /> : null}
        </div>
      </div>

      {/* Title + category + config summary */}
      <div className="flex-1 min-w-0 flex flex-col justify-center px-2 py-1.5">
        <h4
          className="text-[11px] font-semibold leading-tight line-clamp-2"
          style={{ color: '#f1f5f9' }}
          title={data.label}
        >
          {data.label}
        </h4>
        {configSummary ? (
          <p
            className="mt-0.5 truncate font-mono text-[8px] leading-snug opacity-75"
            style={{ color: palette.accent }}
            title={configSummary}
          >
            {configSummary}
          </p>
        ) : (
          <span
            className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em] truncate"
            style={{ color: palette.accent }}
          >
            {data.category}
          </span>
        )}
      </div>

      {runStyle && (
        <span
          className={`absolute -top-2 -right-2 z-10 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shadow-sm ${runStyle.badge}`}
          title={data.runError || (data.runDurationMs != null ? `${runStyle.label} • ${data.runDurationMs} ms` : runStyle.label)}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${runStyle.dot}`} />
          {runStyle.label}
          {data.runDurationMs != null && runStatus !== 'running' && runStatus !== 'pending' && (
            <span className="text-[8px] font-medium opacity-70">{data.runDurationMs}ms</span>
          )}
        </span>
      )}

      {/* Connection handles — kept on all 4 sides so the existing routing
          logic (getDirectionalHandles / re-routing) still picks the best
          orientation, but visually only highlighted when selected. */}
      <Handle type="source" id="source-left" position={Position.Left} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
      <Handle type="source" id="source-right" position={Position.Right} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
      <Handle type="source" id="source-top" position={Position.Top} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
      <Handle type="source" id="source-bottom" position={Position.Bottom} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />

      <Handle type="target" id="target-left" position={Position.Left} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
      <Handle type="target" id="target-right" position={Position.Right} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
      <Handle type="target" id="target-top" position={Position.Top} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
      <Handle type="target" id="target-bottom" position={Position.Bottom} style={handleStyle} className={`!w-2 !h-2 ${handleVisibilityClass}`} />
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
