/**
 * UploadedDocumentsSettingsPanel — pick documents and folders that have
 * already been ingested through the Knowledge Base page.
 *
 * Replaces the previous generic "Document Upload" form. The node is a
 * SOURCE node: it doesn't accept files in the canvas, it selects from the
 * server-side knowledge store and emits a typed `documents` payload.
 *
 * UX contract:
 *   • Loads the live document list from `/api/knowledge/documents` on mount.
 *   • Builds an in-memory folder tree from each doc's `relative_path`
 *     (e.g. "policies/security/handbook.pdf" → policies/security).
 *   • Three scope modes:
 *       - `all`        → emit every indexed document
 *       - `folders`    → emit docs whose path starts with any selected prefix
 *       - `documents`  → emit explicitly checked document IDs
 *   • Status & content-type filters apply on top of the chosen scope.
 *   • Compact preprocessing section preserves the legacy fields (OCR,
 *     header strip, normalization) so downstream chunking sees the same
 *     payload shape.
 *   • Read-only summary: how many docs match, total size, total chunks.
 *
 * The panel intentionally does NOT support uploading from the canvas —
 * uploading lives on the dedicated Knowledge Base page, this node only
 * REFERENCES already-uploaded artifacts.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Filter,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─────────────────────────────────────────────────────────────────────────
// Default config — used by canvasConfig and as merge base when older
// payloads are loaded.
// ─────────────────────────────────────────────────────────────────────────
export const DEFAULT_UPLOADED_DOCUMENTS_CONFIG = {
  // Selection
  scope: 'all', // 'all' | 'folders' | 'documents'
  selectedFolders: [], // string[] — path prefixes ("policies/security")
  selectedDocumentIds: [], // string[] — explicit doc IDs
  // Filters (always applied on top of the scope)
  statusFilter: 'indexed', // 'all' | 'indexed' | 'pending' | 'error'
  contentTypeFilter: 'all', // 'all' | 'pdf' | 'docx' | 'txt' | 'md' | 'html'
  // Pre-processing (preserved from legacy DocumentSettingsPanel — these
  // travel with the documents into Chunking).
  remove_headers_footers: true,
  normalize_whitespace: true,
  ocr_enabled: false,
  ocr_dpi: 300,
  page_range: '',
  image_handling: 'ignore',
  auto_tagging: false,
  source_label: 'knowledge_base',
};

// ─────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-fuchsia-400';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
      {title}
    </label>
    {help && (
      <button type="button" title={help} className="shrink-0 text-slate-400 hover:text-slate-200">
        <CircleHelp size={11} />
      </button>
    )}
  </div>
);

const ScopeChip = ({ active, onClick, icon: Icon, label, hint }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition ${
      active
        ? 'border-fuchsia-500/70 bg-fuchsia-900/20 ring-1 ring-fuchsia-600/40'
        : 'border-slate-700/50 bg-[#0d1117] hover:border-fuchsia-700/50'
    }`}
  >
    <div className="flex w-full items-center gap-1">
      <Icon size={12} className={active ? 'text-fuchsia-400' : 'text-slate-400'} />
      <span className="text-[11px] font-bold text-slate-100">{label}</span>
    </div>
    <span className="text-[9.5px] leading-snug text-slate-400">{hint}</span>
  </button>
);

// ─────────────────────────────────────────────────────────────────────────
// Helpers — folder tree building & filter evaluation
// ─────────────────────────────────────────────────────────────────────────

// Derive the parent folder of a relative_path (everything except the
// filename). Top-level docs return '' (root).
const folderOf = (relativePath, name) => {
  const path = relativePath || name || '';
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
};

// All ancestor folder prefixes for a given folder. Used for the "select
// a folder selects everything below" semantic.
const ancestorChain = (folder) => {
  if (!folder) return [''];
  const parts = folder.split('/').filter(Boolean);
  const chain = [''];
  for (let i = 0; i < parts.length; i += 1) {
    chain.push(parts.slice(0, i + 1).join('/'));
  }
  return chain;
};

// True if a doc lives inside any of the selected folder prefixes (or root '').
const isInsideAnyFolder = (docFolder, selectedFolders) => {
  if (!selectedFolders.length) return false;
  return selectedFolders.some((prefix) => {
    if (prefix === '') return true; // '' = root + everything
    return docFolder === prefix || docFolder.startsWith(`${prefix}/`);
  });
};

// Detect content type from filename / mime — coarse buckets matching
// the filter dropdown.
const contentBucket = (doc) => {
  const ct = (doc.content_type || '').toLowerCase();
  const name = (doc.name || '').toLowerCase();
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (ct.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
  if (ct.includes('markdown') || name.endsWith('.md')) return 'md';
  if (ct.includes('html') || name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (ct.startsWith('text/') || name.endsWith('.txt')) return 'txt';
  return 'other';
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// Build a recursive tree: { name, path, children: { …subfolders }, docs: [...] }
const buildFolderTree = (documents) => {
  const root = { name: '/', path: '', children: {}, docs: [] };
  for (const doc of documents) {
    const folder = folderOf(doc.relative_path, doc.name);
    if (!folder) {
      root.docs.push(doc);
      continue;
    }
    const parts = folder.split('/').filter(Boolean);
    let cursor = root;
    let cumulative = '';
    for (const part of parts) {
      cumulative = cumulative ? `${cumulative}/${part}` : part;
      if (!cursor.children[part]) {
        cursor.children[part] = { name: part, path: cumulative, children: {}, docs: [] };
      }
      cursor = cursor.children[part];
    }
    cursor.docs.push(doc);
  }
  return root;
};

// Resolve the effective document set given the current config + the live
// list. Returns the matching docs (after scope + filters).
const resolveSelection = (documents, config) => {
  const statusOk = (doc) =>
    config.statusFilter === 'all' || (doc.status || '').toLowerCase() === config.statusFilter;
  const typeOk = (doc) =>
    config.contentTypeFilter === 'all' || contentBucket(doc) === config.contentTypeFilter;

  let scoped;
  if (config.scope === 'all') {
    scoped = documents;
  } else if (config.scope === 'folders') {
    scoped = documents.filter((doc) =>
      isInsideAnyFolder(folderOf(doc.relative_path, doc.name), config.selectedFolders),
    );
  } else {
    const idSet = new Set(config.selectedDocumentIds);
    scoped = documents.filter((doc) => idSet.has(doc.id));
  }
  return scoped.filter((doc) => statusOk(doc) && typeOk(doc));
};

// ─────────────────────────────────────────────────────────────────────────
// Folder tree renderer — recursive, with collapse + checkbox per folder.
// ─────────────────────────────────────────────────────────────────────────
const FolderTreeNode = ({ node, depth, expanded, toggleExpanded, isFolderSelected, toggleFolder }) => {
  const subfolders = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
  const isOpen = expanded.has(node.path);
  const checked = isFolderSelected(node.path);

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-fuchsia-900/25 ${
          checked ? 'bg-fuchsia-900/20' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {(subfolders.length > 0 || node.docs.length > 0) ? (
          <button
            type="button"
            onClick={() => toggleExpanded(node.path)}
            className="text-slate-400 hover:text-slate-200"
            title={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="inline-block w-[11px]" />
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleFolder(node.path)}
          className="h-3 w-3 accent-fuchsia-500"
          title="Select folder (including all subfolders)"
        />
        {checked || isOpen ? (
          <FolderOpen size={12} className="text-fuchsia-500" />
        ) : (
          <Folder size={12} className="text-slate-400" />
        )}
        <span className="truncate font-semibold text-slate-200">
          {node.path === '' ? '/ (root)' : node.name}
        </span>
        <span className="ml-auto text-[9.5px] font-mono text-slate-400">
          {node.docs.length > 0 && `${node.docs.length} doc`}
        </span>
      </div>
      {isOpen && (
        <div>
          {subfolders.map((child) => (
            <FolderTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              isFolderSelected={isFolderSelected}
              toggleFolder={toggleFolder}
            />
          ))}
          {node.docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10.5px] text-slate-400"
              style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
              title={`${doc.name} · ${formatBytes(doc.size_bytes)}`}
            >
              <FileText size={10} className="text-slate-400" />
              <span className="truncate">{doc.name}</span>
              <span className="ml-auto font-mono text-[9.5px] text-slate-400">
                {formatBytes(doc.size_bytes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Pure payload builder — kept symmetric with sibling panels' build* fn.
// ─────────────────────────────────────────────────────────────────────────
export const buildUploadedDocumentsPayload = (config, resolvedDocs = []) => ({
  step_type: 'uploaded_documents',
  metadata: {
    selection: {
      scope: config.scope,
      selected_folders: config.selectedFolders,
      selected_document_ids: config.selectedDocumentIds,
      resolved_count: resolvedDocs.length,
      resolved_total_bytes: resolvedDocs.reduce((sum, d) => sum + (d.size_bytes || 0), 0),
      resolved_total_chunks: resolvedDocs.reduce((sum, d) => sum + (d.chunk_count || 0), 0),
    },
    filters: {
      status: config.statusFilter,
      content_type: config.contentTypeFilter,
    },
    preprocessing: {
      remove_headers_footers: config.remove_headers_footers,
      normalize_whitespace: config.normalize_whitespace,
      ocr_enabled: config.ocr_enabled,
      ocr_dpi: config.ocr_dpi,
      page_range: config.page_range,
      image_handling: config.image_handling,
    },
    metadata_enrichment: {
      auto_tagging: config.auto_tagging,
      source_label: config.source_label,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function UploadedDocumentsSettingsPanel({ value = {}, onChange }) {
  const config = useMemo(
    () => ({ ...DEFAULT_UPLOADED_DOCUMENTS_CONFIG, ...value }),
    [value],
  );
  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set(['']));

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    xragApi
      .listKnowledgeDocuments()
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch((error) => setLoadError(error.message || 'Failed to load documents'))
      .finally(() => setLoading(false));
  };

  // Initial load + manual refresh button.
  useEffect(() => {
    reload();
  }, []);

  // ── Folder tree + folder selection helpers ─────────────────────────────
  const tree = useMemo(() => buildFolderTree(documents), [documents]);

  const toggleExpanded = (path) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
  };

  const isFolderSelected = (path) => (config.selectedFolders || []).includes(path);

  const toggleFolder = (path) => {
    const current = config.selectedFolders || [];
    const next = current.includes(path)
      ? current.filter((p) => p !== path)
      : [...current, path];
    setField('selectedFolders', next);
    if (config.scope !== 'folders') setField('scope', 'folders');
  };

  // ── Document list (used in scope=documents) ────────────────────────────
  const visibleDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter(
      (doc) =>
        (doc.name || '').toLowerCase().includes(term)
        || (doc.relative_path || '').toLowerCase().includes(term),
    );
  }, [documents, search]);

  const isDocSelected = (docId) => (config.selectedDocumentIds || []).includes(docId);
  const toggleDocument = (docId) => {
    const current = config.selectedDocumentIds || [];
    const next = current.includes(docId)
      ? current.filter((id) => id !== docId)
      : [...current, docId];
    setField('selectedDocumentIds', next);
    if (config.scope !== 'documents') setField('scope', 'documents');
  };

  // ── Resolved selection summary ─────────────────────────────────────────
  const resolved = useMemo(() => resolveSelection(documents, config), [documents, config]);
  const totalBytes = useMemo(
    () => resolved.reduce((sum, d) => sum + (d.size_bytes || 0), 0),
    [resolved],
  );
  const totalChunks = useMemo(
    () => resolved.reduce((sum, d) => sum + (d.chunk_count || 0), 0),
    [resolved],
  );

  // ── Validation warnings ────────────────────────────────────────────────
  const warnings = [];
  if (!loading && !loadError && documents.length === 0) {
    warnings.push('The knowledge base is empty — upload documents on the Documents page.');
  }
  if (config.scope === 'folders' && (config.selectedFolders || []).length === 0) {
    warnings.push('Folders mode is selected but no folder is checked.');
  }
  if (config.scope === 'documents' && (config.selectedDocumentIds || []).length === 0) {
    warnings.push('Documents mode is selected but no document is checked.');
  }
  if (!loading && resolved.length === 0 && documents.length > 0) {
    warnings.push('The current filters do not match any document.');
  }

  return (
    <div className="space-y-3">
      {/* ── Knowledge base banner ──────────────────────────────────────── */}
      <div className="rounded-xl border border-fuchsia-700/40 bg-fuchsia-900/15 p-3">
        <div className="flex items-start gap-2">
          <Layers size={14} className="mt-0.5 text-fuchsia-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-fuchsia-300">
              Knowledge base · {documents.length} documents
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              This node references files uploaded on the{' '}
              <span className="font-semibold text-slate-200">Documents</span> page. Here you only
              pick which documents / folders enter the pipeline — uploading
              still happens on the Documents page.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 rounded-lg border border-fuchsia-700/50 bg-[#0d1117] p-1.5 text-fuchsia-300 transition hover:bg-fuchsia-900/30"
            title="Refresh list"
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-rose-700/40 bg-rose-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-rose-400">
          Load error: {loadError}
        </div>
      )}

      {/* ── Scope picker ───────────────────────────────────────────────── */}
      <div>
        <FieldLabel title="Selection scope" help="What the node forwards to Chunking." />
        <div className="grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
          <ScopeChip
            active={config.scope === 'all'}
            onClick={() => setField('scope', 'all')}
            icon={Sparkles}
            label="All"
            hint="Every indexed document."
          />
          <ScopeChip
            active={config.scope === 'folders'}
            onClick={() => setField('scope', 'folders')}
            icon={Folder}
            label="Folders"
            hint="One or more folders (recursive)."
          />
          <ScopeChip
            active={config.scope === 'documents'}
            onClick={() => setField('scope', 'documents')}
            icon={FileText}
            label="Documents"
            hint="Pick specific files."
          />
        </div>
      </div>

      {/* ── Folder tree (when scope=folders) ───────────────────────────── */}
      {config.scope === 'folders' && (
        <div className="space-y-1.5 rounded-xl border border-slate-700/50 bg-[#0d1117] p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Folder tree
            </p>
            <span className="font-mono text-[9.5px] text-slate-400">
              {(config.selectedFolders || []).length} selected
            </span>
          </div>
          {documents.length === 0 ? (
            <p className="rounded bg-slate-800/40 px-2 py-3 text-center text-[10.5px] text-slate-400">
              {loading ? 'Loading…' : 'No uploaded documents.'}
            </p>
          ) : (
            <div className="max-h-64 overflow-auto rounded border border-slate-700/50 bg-slate-900/60 py-1">
              <FolderTreeNode
                node={tree}
                depth={0}
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                isFolderSelected={isFolderSelected}
                toggleFolder={toggleFolder}
              />
            </div>
          )}
          {(config.selectedFolders || []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {config.selectedFolders.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => toggleFolder(path)}
                  className="flex items-center gap-1 rounded-md border border-fuchsia-700/50 bg-fuchsia-900/20 px-1.5 py-0.5 text-[10px] font-mono text-fuchsia-300 hover:border-rose-700/50 hover:bg-rose-900/20 hover:text-rose-400"
                  title="Remove"
                >
                  <Folder size={9} />
                  {path === '' ? '/' : path}
                  <span className="ml-0.5 text-rose-500">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Document picker (when scope=documents) ─────────────────────── */}
      {config.scope === 'documents' && (
        <div className="space-y-1.5 rounded-xl border border-slate-700/50 bg-[#0d1117] p-2">
          <div className="relative">
            <Search
              size={11}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or path…"
              className={`${inputClass} pl-7`}
            />
          </div>
          {visibleDocuments.length === 0 ? (
            <p className="rounded bg-slate-800/40 px-2 py-3 text-center text-[10.5px] text-slate-400">
              {loading ? 'Loading…' : 'No results.'}
            </p>
          ) : (
            <div className="max-h-64 overflow-auto rounded border border-slate-700/50 bg-slate-900/60">
              {visibleDocuments.map((doc) => {
                const checked = isDocSelected(doc.id);
                const folder = folderOf(doc.relative_path, doc.name);
                return (
                  <label
                    key={doc.id}
                    className={`flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-[10.5px] hover:bg-fuchsia-900/25 ${
                      checked ? 'bg-fuchsia-900/20' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDocument(doc.id)}
                      className="h-3 w-3 accent-fuchsia-500"
                    />
                    <FileText size={10} className="text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-200">{doc.name}</div>
                      {folder && (
                        <div className="truncate font-mono text-[9px] text-slate-400">{folder}/</div>
                      )}
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">
                      {formatBytes(doc.size_bytes)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {(config.selectedDocumentIds || []).length > 0 && (
            <p className="text-[10px] font-bold text-fuchsia-400">
              {config.selectedDocumentIds.length} documents selected
            </p>
          )}
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-700/50 bg-[#0d1117] p-3">
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-slate-400" />
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Filters
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Status" />
            <select
              value={config.statusFilter}
              onChange={(event) => setField('statusFilter', event.target.value)}
              className={inputClass}
            >
              <option value="all">Any status</option>
              <option value="indexed">Indexed only</option>
              <option value="pending">Pending only</option>
              <option value="error">Errored only</option>
            </select>
          </div>
          <div>
            <FieldLabel title="Content type" />
            <select
              value={config.contentTypeFilter}
              onChange={(event) => setField('contentTypeFilter', event.target.value)}
              className={inputClass}
            >
              <option value="all">Any type</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
              <option value="txt">Plain text</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Resolved selection summary ─────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
          Resolved selection
        </p>
        <div className="mt-1.5 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5 text-[11px]">
          <div className="rounded-lg bg-slate-900/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Docs</p>
            <p className="font-mono text-[12px] font-bold text-slate-100">{resolved.length}</p>
          </div>
          <div className="rounded-lg bg-slate-900/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Size</p>
            <p className="font-mono text-[12px] font-bold text-slate-100">{formatBytes(totalBytes)}</p>
          </div>
          <div className="rounded-lg bg-slate-900/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Chunks</p>
            <p className="font-mono text-[12px] font-bold text-slate-100">{totalChunks}</p>
          </div>
        </div>
      </div>

      {/* ── Pre-processing (compact) ───────────────────────────────────── */}
      <details className="rounded-xl border border-slate-700/50 bg-[#0d1117] p-3" open>
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-400">
          Pre-processing & metadata
        </summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <label className="flex items-center gap-1.5 rounded border border-slate-700/50 px-2 py-1 text-[10.5px]">
              <input
                type="checkbox"
                checked={Boolean(config.remove_headers_footers)}
                onChange={(event) => setField('remove_headers_footers', event.target.checked)}
                className="h-3 w-3 accent-fuchsia-500"
              />
              remove_headers_footers
            </label>
            <label className="flex items-center gap-1.5 rounded border border-slate-700/50 px-2 py-1 text-[10.5px]">
              <input
                type="checkbox"
                checked={Boolean(config.normalize_whitespace)}
                onChange={(event) => setField('normalize_whitespace', event.target.checked)}
                className="h-3 w-3 accent-fuchsia-500"
              />
              normalize_whitespace
            </label>
            <label className="flex items-center gap-1.5 rounded border border-slate-700/50 px-2 py-1 text-[10.5px]">
              <input
                type="checkbox"
                checked={Boolean(config.ocr_enabled)}
                onChange={(event) => setField('ocr_enabled', event.target.checked)}
                className="h-3 w-3 accent-fuchsia-500"
              />
              ocr_enabled
            </label>
            <label className="flex items-center gap-1.5 rounded border border-slate-700/50 px-2 py-1 text-[10.5px]">
              <input
                type="checkbox"
                checked={Boolean(config.auto_tagging)}
                onChange={(event) => setField('auto_tagging', event.target.checked)}
                className="h-3 w-3 accent-fuchsia-500"
              />
              auto_tagging
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel title="OCR DPI" />
              <input
                type="number"
                min={150}
                max={600}
                step={50}
                value={Number(config.ocr_dpi || 300)}
                onChange={(event) => setField('ocr_dpi', Number(event.target.value || 300))}
                className={inputClass}
                disabled={!config.ocr_enabled}
              />
            </div>
            <div>
              <FieldLabel title="Image handling" />
              <select
                value={(config.image_handling || 'ignore').toLowerCase()}
                onChange={(event) => setField('image_handling', event.target.value)}
                className={inputClass}
              >
                <option value="ignore">Ignore</option>
                <option value="extract">Extract</option>
              </select>
            </div>
          </div>
          <div>
            <FieldLabel title="Page range" help='e.g. "1-10, 15". Empty = all pages.' />
            <input
              type="text"
              value={config.page_range || ''}
              onChange={(event) => setField('page_range', event.target.value)}
              className={inputClass}
              placeholder="1-10, 15"
            />
          </div>
          <div>
            <FieldLabel title="Source label" help="Provenance / audit label for downstream nodes." />
            <input
              type="text"
              value={config.source_label || ''}
              onChange={(event) => setField('source_label', event.target.value)}
              className={inputClass}
              placeholder="knowledge_base"
            />
          </div>
        </div>
      </details>

      {/* ── Warnings / OK ──────────────────────────────────────────────── */}
      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300"
            >
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-300">
          <CheckCircle2 size={11} />
          {resolved.length} documents will be forwarded to the Chunking node.
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-fuchsia-500" />
        Output: <span className="font-mono">documents</span> → Chunking, Cleaning, Graph DB
      </div>
    </div>
  );
}
