import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Files,
  FolderUp,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import KnowledgeUploadProgress from './KnowledgeUploadProgress';

const ACCEPTED_FORMATS = 'image/jpeg,image/png,image/webp,image/gif,image/tiff,image/bmp';
const ACCEPT_LABEL = 'JPG · PNG · WebP · GIF · TIFF · BMP';

const STATUS_BADGES = {
  captioned: { label: 'Captioned', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  pending:   { label: 'Pending',   className: 'bg-amber-50  text-amber-700  border-amber-200',  Icon: Loader2 },
  error:     { label: 'Error',     className: 'bg-rose-50   text-rose-700   border-rose-200',   Icon: AlertCircle },
};

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// ── Individual image row ──────────────────────────────────────────────────────
const renderImageRow = (image, ctx) => {
  const { selectedImageId, setSelectedImageId, handleDelete, handleReplace, handleGenerateCaption, captioningId } = ctx;
  const badge = STATUS_BADGES[image.status] || STATUS_BADGES.pending;
  const BadgeIcon = badge.Icon;
  const isSelected = selectedImageId === image.id;

  return (
    <li
      key={image.id}
      data-img-row="true"
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        isSelected ? 'bg-sky-50/60' : 'hover:bg-slate-50'
      }`}
      onClick={(e) => { e.stopPropagation(); setSelectedImageId(image.id); }}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
        {image.thumbnail_url ? (
          <img
            src={image.thumbnail_url}
            alt={image.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={18} className="text-slate-400" />
        )}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate" title={image.name}>
          {image.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {image.width && image.height && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {image.width}×{image.height}
            </span>
          )}
          {image.format && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-slate-900 px-1.5 py-0.5 text-[10px] font-black text-amber-200 uppercase">
              {image.format}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
            <HardDrive size={10} />
            {formatBytes(image.size_bytes)}
          </span>
          {image.created_at && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200"
              title={new Date(image.created_at).toLocaleString('en-US')}
            >
              <Clock size={10} />
              {new Date(image.created_at).toLocaleDateString('en-US')}
            </span>
          )}
        </div>
        {image.error && (
          <p className="mt-1 text-[10px] text-rose-600 truncate" title={image.error}>
            {image.error}
          </p>
        )}
      </div>

      {/* Status badge */}
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}>
        <BadgeIcon size={11} className={image.status === 'pending' ? 'animate-spin' : ''} />
        {badge.label}
      </span>

      {/* Actions */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleReplace(image.id); }}
        title="Replace image"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
      >
        <Upload size={12} />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleGenerateCaption(image.id); }}
        disabled={captioningId === image.id}
        title="Generate caption with Vision LLM"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-60"
      >
        {captioningId === image.id
          ? <Loader2 size={12} className="animate-spin" />
          : <Eye size={12} />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleDelete(image.id); }}
        title="Delete"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
};

// ── Image detail / caption preview panel ─────────────────────────────────────
const ImageDetailPanel = ({ image }) => {
  if (!image) return null;
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 p-3">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Format</p>
          <p className="mt-0.5 text-sm font-black text-slate-800 uppercase">{image.format || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Resolution</p>
          <p className="mt-0.5 text-sm font-black text-slate-800">
            {image.width && image.height ? `${image.width}×${image.height}` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-sky-600">Size</p>
          <p className="mt-0.5 text-sm font-black text-sky-800">{formatBytes(image.size_bytes)}</p>
        </div>
      </div>

      {/* Preview */}
      {image.thumbnail_url && (
        <div className="rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center" style={{ maxHeight: 200 }}>
          <img
            src={image.thumbnail_url}
            alt={image.name}
            className="max-w-full max-h-[200px] object-contain"
          />
        </div>
      )}

      {/* Caption */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-3">
        <p className="text-[9px] font-black uppercase tracking-wider text-amber-600 mb-2">Vision Caption</p>
        {image.caption ? (
          <p className="text-xs text-slate-700 leading-relaxed">{image.caption}</p>
        ) : (
          <p className="text-xs text-slate-400 italic">No caption yet. Click the <Eye size={10} className="inline" /> button to generate one.</p>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const ImageLibraryPanel = () => {
  const [images, setImages]               = useState([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadState, setUploadState]     = useState({
    activeFile: '', progress: 0, isFinishing: false, hasError: false, totalFiles: 0, doneFiles: 0,
  });
  const [errorMessage, setErrorMessage]   = useState('');
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedImageDetail, setSelectedImageDetail] = useState(null);
  const [isDragOver, setIsDragOver]       = useState(false);
  const [captioningId, setCaptioningId]   = useState(null);
  const [isCaptioningAll, setIsCaptioningAll] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const fileInputRef   = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetIdRef = useRef(null);

  // ── Stubbed data for UI demo ─────────────────────────────────────────────
  const loadImages = () => {
    setIsLoading(true);
    window.setTimeout(() => {
      setImages([]);
      setIsLoading(false);
    }, 300);
  };

  useEffect(() => { loadImages(); }, []);

  // Click-outside to deselect
  useEffect(() => {
    if (!selectedImageId) return undefined;
    const handler = (e) => {
      if (e.target.closest('[data-img-row]') || e.target.closest('[data-img-preview]')) return;
      setSelectedImageId(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [selectedImageId]);

  // Sync detail panel
  useEffect(() => {
    if (!selectedImageId) { setSelectedImageDetail(null); return; }
    const img = images.find((i) => i.id === selectedImageId);
    setSelectedImageDetail(img || null);
  }, [selectedImageId, images]);

  // ── Upload ───────────────────────────────────────────────────────────────
  const isImageFile = (file) => file.type.startsWith('image/');

  const performUpload = async (files) => {
    const imageFiles = files.filter(isImageFile);
    if (!imageFiles.length) {
      setErrorMessage('No supported image files found. Accepted: JPG, PNG, WebP, GIF, TIFF, BMP.');
      return;
    }
    setIsUploading(true);
    setErrorMessage('');
    const total = imageFiles.length;
    setUploadState({ activeFile: imageFiles[0]?.name || '', progress: 1, isFinishing: false, hasError: false, totalFiles: total, doneFiles: 0 });

    // Simulate upload per-file (real impl would call xragApi.uploadImage)
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      setUploadState((p) => ({ ...p, activeFile: file.name, progress: Math.max(p.progress, (i / total) * 100 + 2) }));
      await new Promise((r) => window.setTimeout(r, 600 + Math.random() * 400));
      const objectUrl = URL.createObjectURL(file);
      const newImage = {
        id: `img-${Date.now()}-${i}`,
        name: file.name,
        format: file.name.split('.').pop().toLowerCase(),
        size_bytes: file.size,
        status: 'pending',
        thumbnail_url: objectUrl,
        width: null,
        height: null,
        caption: null,
        created_at: new Date().toISOString(),
      };
      setImages((prev) => [...prev, newImage]);
      window.setTimeout(() => {
        setImages((prev) => prev.map((img) => (
          img.id === newImage.id && img.status === 'pending'
            ? { ...img, status: 'captioned', caption: img.caption || simulateCaption(newImage.id) }
            : img
        )));
      }, 900 + i * 180);
      setUploadState((p) => ({ ...p, doneFiles: i + 1, progress: ((i + 1) / total) * 100 }));
    }

    setUploadState((p) => ({ ...p, isFinishing: true, progress: 100 }));
    window.setTimeout(() => {
      setIsUploading(false);
      setUploadState({ activeFile: '', progress: 0, isFinishing: false, hasError: false, totalFiles: 0, doneFiles: 0 });
    }, 1800);
  };

  const handleFileInput = async (e) => {
    if (!e.target.files?.length) return;
    await performUpload(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) await performUpload(files);
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleReplace = (imageId) => {
    replaceTargetIdRef.current = imageId;
    if (replaceInputRef.current) { replaceInputRef.current.value = ''; replaceInputRef.current.click(); }
  };

  const handleReplaceFileChange = async (e) => {
    const file = e.target.files?.[0];
    const id = replaceTargetIdRef.current;
    e.target.value = '';
    replaceTargetIdRef.current = null;
    if (!file || !id || !isImageFile(file)) return;
    const objectUrl = URL.createObjectURL(file);
    setImages((prev) => prev.map((img) =>
      img.id === id
        ? { ...img, name: file.name, format: file.name.split('.').pop().toLowerCase(), size_bytes: file.size, thumbnail_url: objectUrl, status: 'pending', caption: null }
        : img
    ));
    window.setTimeout(() => {
      setImages((prev) => prev.map((img) => (
        img.id === id && img.status === 'pending'
          ? { ...img, status: 'captioned', caption: img.caption || simulateCaption(id) }
          : img
      )));
    }, 950);
  };

  const handleDelete = (imageId) => {
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    if (selectedImageId === imageId) setSelectedImageId(null);
  };

  const handleDeleteAll = () => {
    if (!window.confirm(`Are you sure you want to delete all ${images.length} image(s)? This cannot be undone.`)) return;
    setImages([]);
    setSelectedImageId(null);
  };

  const simulateCaption = (imageId) => {
    const captions = [
      'A detailed technical diagram showing a neural network architecture with multiple layers, annotated with dimension labels and activation functions.',
      'A bar chart comparing retrieval accuracy across five RAG strategies: similarity search, MMR, hybrid, HyDE, and corrective RAG.',
      'A photograph of a whiteboard session with handwritten notes about knowledge graph extraction pipelines.',
      'A screenshot of a code editor showing a Python function implementing cosine similarity scoring for vector embeddings.',
      'An infographic illustrating the data ingestion pipeline: document upload → chunking → embedding → vector index.',
    ];
    return captions[Math.floor(Math.random() * captions.length)];
  };

  const handleGenerateCaption = async (imageId) => {
    setCaptioningId(imageId);
    await new Promise((r) => window.setTimeout(r, 1200 + Math.random() * 800));
    const generatedCaption = simulateCaption(imageId);
    setImages((prev) => prev.map((img) =>
      img.id === imageId ? { ...img, status: 'captioned', caption: generatedCaption } : img
    ));
    setCaptioningId(null);
    if (selectedImageId === imageId) {
      setSelectedImageDetail((prev) => prev ? { ...prev, status: 'captioned', caption: generatedCaption } : prev);
    }
  };

  const handleCaptionAll = async () => {
    const uncaptioned = images.filter((i) => i.status !== 'captioned');
    if (!uncaptioned.length) return;
    setIsCaptioningAll(true);
    for (const img of uncaptioned) {
      await handleGenerateCaption(img.id);
    }
    setIsCaptioningAll(false);
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => images.reduce(
    (acc, img) => {
      acc.bytes += img.size_bytes || 0;
      if (img.status === 'captioned') acc.captioned += 1;
      if (img.status === 'error') acc.errors += 1;
      return acc;
    },
    { bytes: 0, captioned: 0, errors: 0 }
  ), [images]);

  return (
    <section className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 shadow-md">
            <ImageIcon className="text-white" size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">Image Library</h2>
            <p className="text-[11px] text-slate-500 leading-snug max-w-2xl">
              Upload images for multimodal RAG. Vision LLM generates searchable captions at ingestion time — these get embedded into the
              <span className="mx-1 rounded border border-amber-400/50 bg-slate-900 px-1.5 py-0.5 text-[10px] font-black text-amber-200">Multimodal Index</span>
              alongside text chunks.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadImages}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Images',    value: images.length,    Icon: Files,      tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Captioned', value: totals.captioned, Icon: Eye,        tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Errors',    value: totals.errors,    Icon: AlertCircle, tint: totals.errors > 0 ? 'border border-amber-400/40 bg-slate-900 text-amber-300' : 'border border-amber-400/40 bg-slate-900 text-amber-300' },
          { label: 'Total size',value: formatBytes(totals.bytes), Icon: HardDrive, tint: 'border border-amber-400/40 bg-slate-900 text-amber-300' },
        ].map((stat) => {
          const StatIcon = stat.Icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tint}`}>
                <StatIcon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</p>
                <p className="text-xl font-black text-slate-900 leading-tight truncate">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      <div className={`grid gap-4 items-stretch ${selectedImageId ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>

        {/* Image list card */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px] max-h-[70vh]">

          {/* Drop zone + controls */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-b transition-all ${isDragOver ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 bg-slate-50/60'}`}
          >
            <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-3 transition-all ${isDragOver ? 'border-sky-200 bg-sky-50/80' : 'border-dashed border-slate-200'}`}>
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${isDragOver ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
                <ImageIcon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold transition-colors ${isDragOver ? 'text-sky-700' : 'text-slate-600'}`}>
                  {isDragOver ? 'Drop images here…' : 'Drag image files here'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{ACCEPT_LABEL}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  <ImageIcon size={13} /> Choose images
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept={ACCEPTED_FORMATS}
                onChange={handleFileInput}
              />
              <input
                ref={replaceInputRef}
                type="file"
                hidden
                accept={ACCEPTED_FORMATS}
                onChange={handleReplaceFileChange}
              />
            </div>

            {/* Upload progress */}
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

            {/* Error */}
            {errorMessage && (
              <div className="mx-4 my-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span className="flex-1 whitespace-pre-line">{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700"><X size={14} /></button>
              </div>
            )}

            {/* List header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <ImageIcon size={14} className="text-slate-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">Uploaded images</h3>
              </div>
              <div className="flex items-center gap-2">
                {isLoading && <Loader2 className="animate-spin text-slate-400" size={14} />}
                {images.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCaptionAll}
                    disabled={isCaptioningAll || images.every((i) => i.status === 'captioned')}
                    title="Generate captions for all uncaptioned images"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-500 to-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:from-amber-600 hover:to-amber-700 disabled:opacity-60"
                  >
                    {isCaptioningAll ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {isCaptioningAll ? 'Captioning…' : 'Auto-Caption All'}
                  </button>
                )}
                {images.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={isDeletingAll}
                    title={`Delete all images (${images.length})`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60"
                  >
                    {isDeletingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* List body */}
          {images.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center text-xs text-slate-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FolderUp size={20} />
              </div>
              <p className="font-bold text-slate-600">No images yet</p>
              <p>Húzz képfájlokat a drop zone-ba, vagy kattints a „Choose images"-re.</p>
              <p className="text-[10px] text-slate-400">{ACCEPT_LABEL}</p>
            </div>
          ) : (
            <ul className="flex-1 min-h-0 overflow-auto divide-y divide-slate-100" style={{ scrollbarGutter: 'stable' }}>
              {images.map((image) =>
                renderImageRow(image, {
                  selectedImageId,
                  setSelectedImageId,
                  handleDelete,
                  handleReplace,
                  handleGenerateCaption,
                  captioningId,
                })
              )}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        {selectedImageId && (
          <div data-img-preview="true" className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px] max-h-[70vh]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-sky-50/80 via-cyan-50/60 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                  <Eye size={14} />
                </div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Image preview</h3>
              </div>
              {selectedImageDetail && (
                <span className="truncate max-w-[260px] text-[10px] font-bold text-slate-500" title={selectedImageDetail.name}>
                  {selectedImageDetail.name}
                </span>
              )}
            </div>
            {selectedImageDetail ? (
              <ImageDetailPanel image={selectedImageDetail} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center text-xs text-slate-500">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <ImageIcon size={22} />
                </div>
                <p className="font-bold text-slate-700">No image selected</p>
                <p>Click an image to see its details and caption.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default ImageLibraryPanel;
