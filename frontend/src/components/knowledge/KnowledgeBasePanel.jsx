import { AlertCircle, AlertTriangle, BrainCircuit, CheckCircle2, ChevronDown, ChevronRight, Clock, Database, FileText, Files, Folder, FolderOpen, FolderUp, HardDrive, Layers, Loader2, RefreshCw, ShieldCheck, ShieldAlert, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { xragApi } from '../../services/xragApi';
import KnowledgeUploadProgress from './KnowledgeUploadProgress';

const STATUS_BADGES = {
  indexed: { label: 'Indexed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Loader2 },
  error: { label: 'Error', className: 'bg-rose-50 text-rose-700 border-rose-200', Icon: AlertCircle },
};

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const renderDocumentRow = (document, ctx) => {
  const { selectedDocumentId, setSelectedDocumentId, handleReindex, handleDelete, handleReplace, handleFactCheck, factCheckingId, indent } = ctx;
  const status = STATUS_BADGES[document.status] || STATUS_BADGES.pending;
  const StatusIcon = status.Icon;
  const isSelected = selectedDocumentId === document.id;
  return (
    <li
      key={document.id}
      data-doc-row="true"
      className={`flex items-center gap-3 ${indent ? 'pl-10 pr-4' : 'px-4'} py-3 cursor-pointer transition-colors ${
        isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
      }`}
      onClick={(event) => {
        event.stopPropagation();
        setSelectedDocumentId(document.id);
      }}
    >
      <FileText className="flex-shrink-0 text-indigo-500" size={16} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate" title={document.relative_path || document.name}>
          {document.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {document.relative_path && document.relative_path !== document.name && (
            <span className="truncate text-slate-500" title={document.relative_path}>
              {document.relative_path}
            </span>
          )}
          {document.page_count != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {document.page_count} pages
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-100">
            <HardDrive size={10} />
            {formatBytes(document.size_bytes)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
            <Layers size={10} />
            {document.chunk_count} chunks
          </span>
          {document.created_at ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200"
              title={new Date(document.created_at).toLocaleString('en-US')}
            >
              <Clock size={10} />
              {new Date(document.created_at).toLocaleDateString('en-US')}
            </span>
          ) : null}
        </div>
        {document.error && (
          <p className="mt-1 text-[10px] text-rose-600 truncate" title={document.error}>
            {document.error}
          </p>
        )}
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.className}`}
      >
        <StatusIcon size={11} className={document.status === 'pending' ? 'animate-spin' : ''} />
        {status.label}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleReplace(document.id);
        }}
        title="Update – upload new file (overwrite)"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
      >
        <Upload size={12} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleFactCheck(document.id);
        }}
        disabled={factCheckingId === document.id}
        title="Fact-check – currency check with LLM"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-60"
      >
        {factCheckingId === document.id
          ? <Loader2 size={12} className="animate-spin" />
          : <ShieldCheck size={12} />}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleReindex(document.id);
        }}
        title="Re-chunk with selected flow"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
      >
        <RefreshCw size={12} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleDelete(document.id);
        }}
        title="Delete"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
};

const KnowledgeBasePanel = ({ onAfterClassify } = {}) => {
  const [documents, setDocuments] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadState, setUploadState] = useState({
    activeFile: '',
    progress: 0,
    isFinishing: false,
    hasError: false,
    totalFiles: 0,
    doneFiles: 0,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isReindexingAll, setIsReindexingAll] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [factCheckingId, setFactCheckingId] = useState(null);
  const [factCheckResult, setFactCheckResult] = useState(null); // {doc, result}
  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetIdRef = useRef(null);

  const handleReplace = (documentId) => {
    replaceTargetIdRef.current = documentId;
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
      replaceInputRef.current.click();
    }
  };

  const handleReplaceFileChange = async (event) => {
    const file = event.target.files?.[0];
    const documentId = replaceTargetIdRef.current;
    event.target.value = '';
    replaceTargetIdRef.current = null;
    if (!file || !documentId) return;
    setErrorMessage('');
    try {
      await xragApi.replaceKnowledgeDocument({
        documentId,
        file,
        flowId: selectedFlowId || undefined,
      });
      await refreshDocuments();
      if (selectedDocumentId === documentId) {
        const detail = await xragApi.getKnowledgeDocument(documentId);
        setSelectedDocumentDetail(detail);
      }
    } catch (error) {
      setErrorMessage(`Update failed: ${error.message}`);
    }
  };
  const folderInputRef = useRef(null);

  const refreshFlows = async () => {
    try {
      const list = await xragApi.listCanvasFlows();
      setFlows(list);
      if (list.length > 0 && !list.some((flow) => flow.id === selectedFlowId)) {
        setSelectedFlowId(list[0].id);
      }
    } catch (error) {
      // Non-fatal — uploads still work with backend defaults.
      // eslint-disable-next-line no-console
      console.warn('Could not fetch canvas flows:', error.message);
    }
  };

  const refreshDocuments = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const list = await xragApi.listKnowledgeDocuments();
      setDocuments(list);
    } catch (error) {
      setErrorMessage(`Document list failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshDocuments();
    refreshFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDocumentId) return undefined;
    const handlePointerDown = (event) => {
      // Keep selection if the click landed on the row itself or anywhere
      // inside the chunk preview / detail panel. Otherwise clear it.
      if (
        event.target.closest('[data-doc-row]') ||
        event.target.closest('[data-chunk-preview]')
      ) {
        return;
      }
      setSelectedDocumentId(null);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedDocumentDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await xragApi.getKnowledgeDocument(selectedDocumentId);
        if (!cancelled) setSelectedDocumentDetail(detail);
      } catch (error) {
        if (!cancelled) setErrorMessage(`Could not load chunks: ${error.message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId]);

  const collectFileEntries = (fileList) => {
    const entries = [];
    Array.from(fileList).forEach((file) => {
      entries.push({
        file,
        relativePath: file.webkitRelativePath || file.name,
      });
    });
    return entries;
  };

  const performUpload = async (entries) => {
    if (!entries.length) return;
    setIsUploading(true);
    setErrorMessage('');

    const total = entries.length;
    setUploadState({
      activeFile: entries[0]?.file?.name || '',
      progress: 1,
      isFinishing: false,
      hasError: false,
      totalFiles: total,
      doneFiles: 0,
    });

    let hadError = false;
    const uploadErrors = [];

    // Upload sequentially so we can drive a real per-file progress bar.
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const fileName = entry.file?.name || `file ${index + 1}`;

      setUploadState((previous) => ({
        ...previous,
        activeFile: fileName,
        progress: Math.max(previous.progress, (index / total) * 100 + 2),
      }));

      try {
        await xragApi.uploadKnowledgeDocuments({
          files: [entry],
          flowId: selectedFlowId || undefined,
        });
      } catch (error) {
        hadError = true;
        uploadErrors.push(`• ${fileName}: ${error.message}`);
      }

      setUploadState((previous) => ({
        ...previous,
        doneFiles: index + 1,
        progress: ((index + 1) / total) * 100,
      }));
    }

    setUploadState((previous) => ({
      ...previous,
      isFinishing: true,
      hasError: hadError,
      progress: 100,
    }));

    await refreshDocuments();

    // Re-apply error message AFTER refresh (which clears errorMessage).
    if (uploadErrors.length) {
      setErrorMessage(
        uploadErrors.length === 1
          ? `Upload failed: ${uploadErrors[0].replace(/^•\s*/, '')}`
          : `${uploadErrors.length} upload(s) failed:\n${uploadErrors.join('\n')}`
      );
    }

    // Hold the success/error state visible briefly, then collapse the widget.
    window.setTimeout(
      () => {
        setIsUploading(false);
        setUploadState({
          activeFile: '',
          progress: 0,
          isFinishing: false,
          hasError: false,
          totalFiles: 0,
          doneFiles: 0,
        });
      },
      hadError ? 3200 : 1800,
    );
  };

  const handleFileInput = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await performUpload(collectFileEntries(files));
    event.target.value = '';
  };

  const handleFolderInput = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await performUpload(collectFileEntries(files));
    event.target.value = '';
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragOver(false);
    const items = event.dataTransfer?.items;
    if (items && items.length > 0) {
      const entries = await collectDataTransferEntries(items);
      if (entries.length) {
        await performUpload(entries);
        return;
      }
    }
    if (event.dataTransfer?.files?.length) {
      await performUpload(collectFileEntries(event.dataTransfer.files));
    }
  };

  // Walk dropped folders recursively using the (non-standard but widely supported)
  // FileSystemEntry API exposed via DataTransferItem.webkitGetAsEntry.
  const collectDataTransferEntries = async (items) => {
    const collected = [];
    const walkers = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        walkers.push(walkEntry(entry, '', collected));
      } else {
        const file = item.getAsFile?.();
        if (file) collected.push({ file, relativePath: file.name });
      }
    }
    await Promise.all(walkers);
    return collected;
  };

  const walkEntry = (entry, parentPath, sink) =>
    new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => {
          sink.push({
            file,
            relativePath: parentPath ? `${parentPath}/${entry.name}` : entry.name,
          });
          resolve();
        }, () => resolve());
        return;
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const childPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        const readBatch = () => {
          reader.readEntries(async (children) => {
            if (!children.length) {
              resolve();
              return;
            }
            await Promise.all(children.map((child) => walkEntry(child, childPath, sink)));
            readBatch();
          }, () => resolve());
        };
        readBatch();
        return;
      }
      resolve();
    });

  const handleDelete = async (documentId) => {
    setErrorMessage('');
    try {
      await xragApi.deleteKnowledgeDocument(documentId);
      if (selectedDocumentId === documentId) {
        setSelectedDocumentId(null);
      }
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(`Delete failed: ${error.message}`);
    }
  };

  const handleDeleteAll = async () => {
    return handleDeleteMany(documents, 'all documents');
  };

  const handleDeleteMany = async (docs, label = `${docs.length} document(s)`) => {
    if (!docs || !docs.length) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete – ${label} (${docs.length} db)? This action cannot be undone.`
    );
    if (!confirmed) return;
    setErrorMessage('');
    setIsDeletingAll(true);
    try {
      const ids = new Set(docs.map((d) => d.id));
      const results = await Promise.allSettled(
        docs.map((doc) => xragApi.deleteKnowledgeDocument(doc.id))
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (selectedDocumentId && ids.has(selectedDocumentId)) {
        setSelectedDocumentId(null);
      }
      await refreshDocuments();
      if (failed.length) {
        setErrorMessage(`${failed.length} document(s) failed to delete.`);
      }
    } catch (error) {
      setErrorMessage(`Deletion failed: ${error.message}`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleReindex = async (documentId) => {
    setErrorMessage('');
    try {
      await xragApi.reindexKnowledgeDocument(documentId, selectedFlowId || undefined);
      await refreshDocuments();
      if (selectedDocumentId === documentId) {
        const detail = await xragApi.getKnowledgeDocument(documentId);
        setSelectedDocumentDetail(detail);
      }
    } catch (error) {
      setErrorMessage(`Reindex failed: ${error.message}`);
    }
  };

  const handleReindexAll = async () => {
    return handleReindexMany(documents, 'all documents');
  };

  const handleReindexMany = async (docs, label = `${docs.length} document(s)`) => {
    if (!docs || !docs.length) return;
    const confirmed = window.confirm(
      `Are you sure you want to re-chunk – ${label} (${docs.length} db)?`
    );
    if (!confirmed) return;
    setErrorMessage('');
    setIsReindexingAll(true);
    try {
      const results = await Promise.allSettled(
        docs.map((doc) =>
          xragApi.reindexKnowledgeDocument(doc.id, selectedFlowId || undefined)
        )
      );
      const failed = results.filter((r) => r.status === 'rejected');
      await refreshDocuments();
      if (selectedDocumentId) {
        try {
          const detail = await xragApi.getKnowledgeDocument(selectedDocumentId);
          setSelectedDocumentDetail(detail);
        } catch {
          /* ignore */
        }
      }
      if (failed.length) {
        setErrorMessage(`${failed.length} document(s) failed to re-chunk.`);
      }
    } catch (error) {
      setErrorMessage(`Re-chunking failed: ${error.message}`);
    } finally {
      setIsReindexingAll(false);
    }
  };

  const handleClassify = async () => {
    setErrorMessage('');
    setIsClassifying(true);
    try {
      await xragApi.classifyKnowledgeDocuments({ language: 'hu' });
      await refreshDocuments();
      onAfterClassify?.();
    } catch (error) {
      setErrorMessage(`Classification failed: ${error.message}`);
    } finally {
      setIsClassifying(false);
    }
  };

  const handleFactCheck = async (documentId) => {
    setFactCheckingId(documentId);
    setFactCheckResult(null);
    try {
      const result = await xragApi.factCheckDocument(documentId);
      const doc = documents.find((d) => d.id === documentId);
      setFactCheckResult({ doc, result });
    } catch (error) {
      setErrorMessage(`Fact-check failed: ${error.message}`);
    } finally {
      setFactCheckingId(null);
    }
  };

  const toggleGroup = (key) => {
    setCollapsedGroups((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  // Default: all category/subcategory groups are collapsed when first encountered.
  useEffect(() => {
    const hasCategories = documents.some((d) => d.category);
    if (!hasCategories) return;
    setCollapsedGroups((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const doc of documents) {
        const cat = doc.category || 'Other';
        const catKey = `cat:${cat}`;
        if (!(catKey in next)) {
          next[catKey] = true;
          changed = true;
        }
        if (doc.subcategory) {
          const subKey = `sub:${cat}::${doc.subcategory}`;
          if (!(subKey in next)) {
            next[subKey] = true;
            changed = true;
          }
        }
      }
      return changed ? next : previous;
    });
  }, [documents]);

  const groupedDocuments = useMemo(() => {
    // Returns { hasCategories, groups, uncategorized }
    const hasCategories = documents.some((d) => d.category);
    if (!hasCategories) {
      return { hasCategories: false, groups: [], uncategorized: [] };
    }
    const buckets = new Map();
    const uncategorized = [];
    for (const doc of documents) {
      if (!doc.category) {
        uncategorized.push(doc);
        continue;
      }
      const cat = doc.category;
      const sub = doc.subcategory || '';
      if (!buckets.has(cat)) buckets.set(cat, new Map());
      const subs = buckets.get(cat);
      if (!subs.has(sub)) subs.set(sub, []);
      subs.get(sub).push(doc);
    }
    const groups = Array.from(buckets.entries()).map(([category, subs]) => ({
      category,
      subgroups: Array.from(subs.entries()).map(([name, docs]) => ({ name, docs })),
    }));
    groups.sort((a, b) => a.category.localeCompare(b.category, 'hu'));
    return { hasCategories: true, groups, uncategorized };
  }, [documents]);

  const totals = useMemo(() => {
    return documents.reduce(
      (acc, document) => {
        acc.bytes += document.size_bytes || 0;
        acc.chunks += document.chunk_count || 0;
        acc.tokens += document.token_estimate || 0;
        if (document.status === 'error') acc.errors += 1;
        if (document.status === 'indexed') acc.indexed += 1;
        return acc;
      },
      { bytes: 0, chunks: 0, tokens: 0, errors: 0, indexed: 0 }
    );
  }, [documents]);

  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-600 shadow-md">
            <Database className="text-white" size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">Knowledge Base</h2>
            <p className="text-[11px] text-slate-500 leading-snug max-w-2xl">
              Upload documents or entire folders. Chunking runs using the
              <span className="mx-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">Chunking</span>
              node parameters of the selected canvas flow.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedFlowId}
            onChange={(event) => setSelectedFlowId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Default chunking (no flow)</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name} ({flow.node_count} nodes)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              refreshFlows();
              refreshDocuments();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Documents', value: documents.length, Icon: Files, tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Indexed', value: totals.indexed, Icon: CheckCircle2, tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Total chunks', value: totals.chunks, Icon: Layers, tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Est. tokens', value: totals.tokens.toLocaleString('en-US'), Icon: BrainCircuit, tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Total size', value: formatBytes(totals.bytes), Icon: HardDrive, tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
        ].map((stat) => {
          const StatIcon = stat.Icon;
          return (
            <div key={stat.label} className="min-w-0 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tint}`}>
                <StatIcon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500">{stat.label}</p>
                <p className="text-base sm:text-lg md:text-xl font-black text-slate-900 leading-tight break-words">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Documents grid */}
      <div
        className={`grid gap-4 items-stretch ${
          selectedDocumentId ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'lg:grid-cols-1'
        }`}
      >
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px] max-h-[70vh]">
          {/* Merged upload + header */}
          <div
            onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-b transition-all ${
              isDragOver
                ? 'border-indigo-300 bg-indigo-50/60'
                : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            {/* Drop zone strip */}
            <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-3 transition-all ${
              isDragOver ? 'border-indigo-200 bg-indigo-50/80' : 'border-dashed border-slate-200'
            }`}>
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                isDragOver ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
              }`}>
                <Upload size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold transition-colors ${
                  isDragOver ? 'text-indigo-700' : 'text-slate-600'
                }`}>
                  {isDragOver ? 'Drop files here…' : 'Drag files or folders here'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  PDF · DOCX · TXT · MD · CSV · JSON · HTML
                  {selectedFlow && (
                    <> — chunking: <span className="font-bold text-indigo-600">{selectedFlow.name}</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
                >
                  <FileText size={13} /> Choose files
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-slate-900 px-3 py-1.5 text-xs font-black text-amber-300 shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  <FolderUp size={13} /> Choose folder
                </button>
              </div>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInput} />
              <input ref={folderInputRef} type="file" multiple hidden webkitdirectory="" directory="" onChange={handleFolderInput} />
              <input ref={replaceInputRef} type="file" hidden onChange={handleReplaceFileChange} />
            </div>

            {/* Upload progress (inside card) */}
            {isUploading && (
              <div className="px-4 py-2">
                <KnowledgeUploadProgress
                  activeFile={uploadState.activeFile}
                  progress={uploadState.progress}
                  isFinishing={uploadState.isFinishing}
                  hasError={uploadState.hasError}
                  totalFiles={uploadState.totalFiles}
                  doneFiles={uploadState.doneFiles}
                />
              </div>
            )}

            {/* Error message (inside card) */}
            {errorMessage && (
              <div className="mx-4 my-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span className="flex-1 whitespace-pre-line">{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Docs list header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Files size={14} className="text-slate-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">Uploaded documents</h3>
                {groupedDocuments.hasCategories && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {groupedDocuments.groups.length} folder(s)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isLoading && <Loader2 className="animate-spin text-slate-400" size={14} />}
                {documents.length >= 1 && (
                  <button
                    type="button"
                    onClick={handleReindexAll}
                    disabled={isReindexingAll}
                    title={`Re-chunk all documents (${documents.length})`}
                    aria-label="Re-chunk all documents"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-60"
                  >
                    {isReindexingAll ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                )}
                {documents.length >= 1 && (
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={isDeletingAll}
                    title={`Delete all documents (${documents.length})`}
                    aria-label="Delete all documents"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60"
                  >
                    {isDeletingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
                {documents.length >= 1 && (
                  <button
                    type="button"
                    onClick={handleClassify}
                    disabled={isClassifying}
                    title={
                      groupedDocuments.hasCategories
                        ? 'Classify new documents into existing folders; create new folders if needed'
                        : 'Builds up to 2-level folder structure from documents using LLM'
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-500 to-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:from-indigo-600 hover:to-amber-700 disabled:opacity-60"
                  >
                    {isClassifying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {isClassifying
                      ? 'Classifying…'
                      : groupedDocuments.hasCategories
                        ? 'AI Re-classify'
                        : 'AI Classify'}
                  </button>
                )}
              </div>
            </div>
          </div>
          {documents.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center text-xs text-slate-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Upload size={20} />
              </div>
              <p className="font-bold text-slate-600">No documents yet</p>
              <p>Húzz fájlokat fent a drop zone-ba, vagy kattints a „Choose files”-ra.</p>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 overflow-auto"
              style={{ scrollbarGutter: 'stable' }}
            >
          {!groupedDocuments.hasCategories ? (
            <>
              {documents.length > 0 && (
                <div className="flex items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                    <AlertTriangle size={13} />
                  </div>
                  <p className="flex-1 text-xs font-medium text-amber-800">
                    No documents have been classified. Run AI Classify to organize them.
                  </p>
                  <button
                    type="button"
                    onClick={handleClassify}
                    disabled={isClassifying}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-400 disabled:opacity-60"
                  >
                    {isClassifying ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {isClassifying ? 'Classifying...' : 'AI Classify'}
                  </button>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {documents.map((document) =>
                  renderDocumentRow(document, {
                    selectedDocumentId,
                    setSelectedDocumentId,
                    handleReindex,
                    handleDelete,
                    handleReplace,
                    handleFactCheck,
                    factCheckingId,
                  })
                )}
              </ul>
            </>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedDocuments.uncategorized.length > 0 && (() => {
                const uncatKey = 'cat:__uncategorized__';
                const uncatCollapsed = !!collapsedGroups[uncatKey];
                return (
                  <div>
                    <div className="flex w-full items-center gap-2.5 border-l-4 border-amber-400 bg-slate-900 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(uncatKey)}
                        className="flex flex-1 items-center gap-2.5 text-left"
                      >
                        {uncatCollapsed ? (
                          <ChevronRight size={14} className="text-amber-600" />
                        ) : (
                          <ChevronDown size={14} className="text-amber-600" />
                        )}
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle size={12} />
                        </div>
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                          Uncategorized
                        </span>
                        <span className="text-[10px] font-medium text-amber-200/70">
                          ({groupedDocuments.uncategorized.length} docs)
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClassify}
                        disabled={isClassifying}
                        title="Run AI Classify"
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                      >
                        {isClassifying ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                        {isClassifying ? 'Running...' : 'Classify'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReindexMany(groupedDocuments.uncategorized, 'uncategorized documents')}
                        disabled={isReindexingAll}
                        title={`Re-chunk uncategorized documents (${groupedDocuments.uncategorized.length})`}
                        aria-label="Re-chunk uncategorized documents"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-white text-slate-600 hover:bg-amber-50 hover:text-indigo-600 disabled:opacity-60"
                      >
                        {isReindexingAll ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMany(groupedDocuments.uncategorized, 'uncategorized documents')}
                        disabled={isDeletingAll}
                        title={`Delete uncategorized documents (${groupedDocuments.uncategorized.length})`}
                        aria-label="Delete uncategorized documents"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-white text-slate-600 hover:bg-amber-50 hover:text-slate-800 disabled:opacity-60"
                      >
                        {isDeletingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-amber-300 shadow-sm ring-1 ring-amber-400/40">
                        {groupedDocuments.uncategorized.length} dok
                      </span>
                    </div>
                    {!uncatCollapsed && (
                      <ul className="divide-y divide-slate-700 bg-slate-900/40">
                        {groupedDocuments.uncategorized.map((document) =>
                          renderDocumentRow(document, {
                            selectedDocumentId,
                            setSelectedDocumentId,
                            handleReindex,
                            handleDelete,
                            handleReplace,
                            handleFactCheck,
                            factCheckingId,
                          })
                        )}
                      </ul>
                    )}
                  </div>
                );
              })()}
              {groupedDocuments.groups.map((group) => {
                const catKey = `cat:${group.category}`;
                const catCollapsed = !!collapsedGroups[catKey];
                const totalDocs = group.subgroups.reduce((sum, sg) => sum + sg.docs.length, 0);
                return (
                  <div key={group.category}>
                    <div
                      className="flex w-full items-center gap-2.5 border-l-4 border-amber-400 bg-slate-900 px-4 py-2.5 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(catKey)}
                        className="flex flex-1 items-center gap-2.5 text-left"
                      >
                        {catCollapsed ? (
                          <ChevronRight size={14} className="text-amber-300" />
                        ) : (
                          <ChevronDown size={14} className="text-amber-300" />
                        )}
                        {catCollapsed ? (
                          <Folder size={16} className="text-amber-300" />
                        ) : (
                          <FolderOpen size={16} className="text-amber-300" />
                        )}
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                          {group.category}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const docs = group.subgroups.flatMap((sg) => sg.docs);
                          handleReindexMany(docs, `„${group.category}” folder(s)`);
                        }}
                        disabled={isReindexingAll}
                        title={`„${group.category}” folder(s) újrachunkolása (${totalDocs} db)`}
                        aria-label={`„${group.category}” folder(s) újrachunkolása`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/40 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-amber-300 disabled:opacity-60"
                      >
                        {isReindexingAll ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const docs = group.subgroups.flatMap((sg) => sg.docs);
                          handleDeleteMany(docs, `„${group.category}” folder(s)`);
                        }}
                        disabled={isDeletingAll}
                        title={`„${group.category}” folder(s) törlése (${totalDocs} db)`}
                        aria-label={`„${group.category}” folder(s) törlése`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/40 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-amber-300 disabled:opacity-60"
                      >
                        {isDeletingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-amber-300 shadow-sm ring-1 ring-amber-400/40">
                        {totalDocs} dok
                      </span>
                    </div>
                    {!catCollapsed &&
                      group.subgroups.map((sub) => {
                        const subKey = `sub:${group.category}::${sub.name}`;
                        const subCollapsed = !!collapsedGroups[subKey];
                        const hasSubName = !!sub.name;
                        return (
                          <div key={subKey}>
                            {hasSubName && (
                              <div
                                className="flex w-full items-center gap-2 border-t border-slate-100 bg-white px-6 py-2 hover:bg-amber-50/40"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(subKey)}
                                  className="flex flex-1 items-center gap-2 text-left"
                                >
                                  {subCollapsed ? (
                                    <ChevronRight size={12} className="text-slate-400" />
                                  ) : (
                                    <ChevronDown size={12} className="text-slate-400" />
                                  )}
                                  <Folder size={12} className="text-amber-500" />
                                  <span className="text-[11px] font-bold text-slate-600">{sub.name}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReindexMany(sub.docs, `„${sub.name}” almappa`)}
                                  disabled={isReindexingAll}
                                  title={`„${sub.name}” subfolder re-chunk (${sub.docs.length} db)`}
                                  aria-label={`„${sub.name}” subfolder re-chunk`}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-60"
                                >
                                  {isReindexingAll ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMany(sub.docs, `„${sub.name}” almappa`)}
                                  disabled={isDeletingAll}
                                  title={`„${sub.name}” subfolder delete (${sub.docs.length} db)`}
                                  aria-label={`„${sub.name}” subfolder delete`}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60"
                                >
                                  {isDeletingAll ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                </button>
                                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  {sub.docs.length}
                                </span>
                              </div>
                            )}
                            {(!hasSubName || !subCollapsed) && (
                              <ul className="divide-y divide-slate-100">
                                {sub.docs.map((document) =>
                                  renderDocumentRow(document, {
                                    selectedDocumentId,
                                    setSelectedDocumentId,
                                    handleReindex,
                                    handleDelete,
                                    handleReplace,
                                    handleFactCheck,
                                    factCheckingId,
                                    indent: hasSubName,
                                  })
                                )}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
            </div>
          )}
        </div>

        {/* Detail / chunk preview */}
        {selectedDocumentId && (
        <div data-chunk-preview="true" className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px] max-h-[70vh]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-indigo-50/80 via-amber-50/60 to-transparent px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-amber-600 text-white shadow-sm">
                <Layers size={14} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Chunk preview</h3>
            </div>
            {selectedDocumentDetail && (
              <span
                className="truncate max-w-[260px] text-[10px] font-bold text-slate-500"
                title={selectedDocumentDetail.name}
              >
                {selectedDocumentDetail.name}
              </span>
            )}
          </div>
          {!selectedDocumentDetail ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-xs text-slate-500">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-3xl bg-gradient-to-br from-indigo-100 to-amber-100 blur-xl opacity-60" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400 ring-1 ring-slate-200">
                  <FileText size={22} />
                </div>
              </div>
              <p className="font-bold text-slate-700">No document selected</p>
              <p className="text-slate-500">Click a document to view its chunks.</p>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 flex-col gap-3 p-3">
              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Chars</p>
                  <p className="mt-0.5 text-sm font-black text-slate-800">
                    {selectedDocumentDetail.char_count.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Words</p>
                  <p className="mt-0.5 text-sm font-black text-slate-800">
                    {selectedDocumentDetail.word_count.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Size</p>
                  <p className="mt-0.5 text-sm font-black text-slate-800">
                    {formatBytes(selectedDocumentDetail.size_bytes || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-amber-50 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">Chunks</p>
                  <p className="mt-0.5 text-sm font-black text-indigo-800">
                    {selectedDocumentDetail.chunk_count.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Chunking config pills */}
              {selectedDocumentDetail.chunking_config && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Chunking</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                    size <span className="text-indigo-600">{selectedDocumentDetail.chunking_config.chunkSize ?? '?'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                    overlap <span className="text-indigo-600">{selectedDocumentDetail.chunking_config.overlap ?? '?'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                    strategy <span className="text-amber-600">{selectedDocumentDetail.chunking_config.strategy ?? '?'}</span>
                  </span>
                </div>
              )}

              {/* Chunk list */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {selectedDocumentDetail.chunks.slice(0, 50).map((chunk) => (
                  <div
                    key={chunk.id}
                    className="group rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-indigo-300 hover:shadow-sm"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-amber-600 px-1.5 text-[10px] font-black text-white shadow-sm">
                          #{chunk.index}
                        </span>
                        <span className="truncate text-[10px] font-mono text-slate-400" title={chunk.id}>
                          {chunk.id}
                        </span>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                          {chunk.char_count} ch
                        </span>
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                          ~{chunk.token_estimate} tok
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
                      {chunk.text}
                    </p>
                  </div>
                ))}
                {selectedDocumentDetail.chunks.length > 50 && (
                  <p className="text-center text-[10px] font-medium text-slate-400">
                    showing first 50 of {selectedDocumentDetail.chunks.length} chunks
                  </p>
                )}
                {selectedDocumentDetail.chunks.length === 0 && (
                  <p className="text-center text-[11px] text-slate-500">No chunks were produced.</p>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Fact-check result modal ── */}
      {factCheckResult && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setFactCheckResult(null)}
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* header */}
            <div className={`flex items-center gap-3 px-5 py-4 border-b ${
              factCheckResult.result.status === 'ok'
                ? 'bg-emerald-50 border-emerald-100'
                : factCheckResult.result.status === 'error'
                ? 'bg-red-50 border-red-100'
                : 'bg-amber-50 border-amber-100'
            }`}>
              {factCheckResult.result.status === 'ok' ? (
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              ) : factCheckResult.result.status === 'error' ? (
                <AlertCircle size={20} className="text-red-600 shrink-0" />
              ) : (
                <ShieldAlert size={20} className="text-amber-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate">
                  Fact-check: {factCheckResult.doc?.name ?? factCheckResult.result.document_name}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {factCheckResult.result.status === 'ok' && 'No issues found.'}
                  {factCheckResult.result.status === 'issues_found' && `${factCheckResult.result.issues.length} issue(s) found`}
                  {factCheckResult.result.status === 'error' && 'An error occurred during the check.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFactCheckResult(null)}
                className="rounded-lg p-1.5 hover:bg-black/10 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* summary */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <p className="text-xs text-slate-600 leading-relaxed">{factCheckResult.result.summary}</p>
            </div>

            {/* issues list */}
            {factCheckResult.result.issues.length > 0 && (
              <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                {factCheckResult.result.issues.map((issue, i) => (
                  <div key={i} className="px-5 py-4 space-y-2">
                    {/* claim */}
                    <div className="flex gap-2 items-start">
                      <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                        Claim
                      </span>
                      <p className="text-xs text-slate-700 italic">"{issue.claim}"</p>
                    </div>
                    {/* explanation */}
                    <div className="flex gap-2 items-start">
                      <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                        Reason
                      </span>
                      <p className="text-xs text-slate-600">{issue.explanation}</p>
                    </div>
                    {/* suggestion */}
                    <div className="flex gap-2 items-start">
                      <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                        Suggestion
                      </span>
                      <p className="text-xs text-amber-800">{issue.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFactCheckResult(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default KnowledgeBasePanel;
