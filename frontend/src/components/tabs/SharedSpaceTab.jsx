import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Eye,
  Globe,
  Heart,
  Network,
  Search,
  Share2,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { useRef, useState, useEffect, useMemo } from 'react';
import { SHARED_FLOWS, loadUserSharedFlows } from '../../data/sharedFlows';

const SORT_OPTIONS = [
  { key: 'likes',   label: 'Most Liked',  Icon: Heart,      accent: 'rose'   },
  { key: 'views',   label: 'Most Viewed', Icon: Eye,        accent: 'sky'    },
  { key: 'newest',  label: 'Newest',      Icon: TrendingUp, accent: 'violet' },
];

const SORT_ACCENTS = {
  rose:   { ring: 'border-rose-300 bg-rose-50 text-rose-800',       dot: 'bg-rose-500',    soft: 'text-rose-600'    },
  sky:    { ring: 'border-sky-300 bg-sky-50 text-sky-800',          dot: 'bg-sky-500',     soft: 'text-sky-600'     },
  violet: { ring: 'border-violet-300 bg-violet-50 text-violet-800', dot: 'bg-violet-500',  soft: 'text-violet-600'  },
};

const ALL_TAGS = [...new Set(SHARED_FLOWS.flatMap((f) => f.tags))].sort();

const TAG_COLORS = {
  enterprise: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  compliance: 'bg-violet-50 text-violet-700 border-violet-200',
  reranker: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  pinecone: 'bg-sky-50 text-sky-700 border-sky-200',
  multilingual: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  hyde: 'bg-purple-50 text-purple-700 border-purple-200',
  support: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  helpdesk: 'bg-teal-50 text-teal-700 border-teal-200',
  legal: 'bg-amber-50 text-amber-700 border-amber-200',
  contracts: 'bg-orange-50 text-orange-700 border-orange-200',
  pii: 'bg-rose-50 text-rose-700 border-rose-200',
  'context-compression': 'bg-pink-50 text-pink-700 border-pink-200',
  medical: 'bg-green-50 text-green-700 border-green-200',
  graphrag: 'bg-lime-50 text-lime-700 border-lime-200',
  neo4j: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'hallucination-guard': 'bg-red-50 text-red-700 border-red-200',
  finance: 'bg-blue-50 text-blue-700 border-blue-200',
  reports: 'bg-sky-50 text-sky-700 border-sky-200',
  'query-rewriter': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  citations: 'bg-violet-50 text-violet-700 border-violet-200',
  code: 'bg-slate-100 text-slate-700 border-slate-300',
  review: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  'reflection-loop': 'bg-purple-50 text-purple-700 border-purple-200',
  devops: 'bg-orange-50 text-orange-700 border-orange-200',
  agentic: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  router: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  guardrails: 'bg-red-50 text-red-700 border-red-200',
  saas: 'bg-sky-50 text-sky-700 border-sky-200',
  research: 'bg-teal-50 text-teal-700 border-teal-200',
  arxiv: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  reflection: 'bg-purple-50 text-purple-700 border-purple-200',
  academic: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const TAG_DEFAULT = 'bg-slate-100 text-slate-600 border-slate-200';

const TagBadge = ({ tag, small = false, active = false, onClick }) => {
  const colorClass = TAG_COLORS[tag] || TAG_DEFAULT;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-black uppercase tracking-wider transition-all ${
        small ? 'text-[9px]' : 'text-[10px]'
      } ${active ? `${colorClass} ring-2 ring-offset-1 ring-indigo-400 scale-105` : `${colorClass} hover:scale-105`}`}
    >
      {!small && <Tag size={9} />}
      {tag}
    </button>
  );
};

const FlowCard = ({ flow, onLoadToCanvas, onDelete, userOwned = false }) => {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(flow.likes || 0);

  const handleLike = (e) => {
    e.stopPropagation();
    setLiked((prev) => {
      setLikeCount((c) => (prev ? c - 1 : c + 1));
      return !prev;
    });
  };

  return (
    <div className="group relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 overflow-hidden">
      {/* Accent top bar */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{ background: `linear-gradient(90deg, ${flow.accentFrom}, ${flow.accentTo})` }}
      />

      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Icon */}
            <div
              className="shrink-0 flex items-center justify-center rounded-2xl"
              style={{
                width: 40, height: 40,
                background: `linear-gradient(135deg, ${flow.accentFrom}30 0%, ${flow.accentTo}50 100%)`,
                border: `1.5px solid ${flow.accentFrom}40`,
              }}
            >
              <Network size={18} style={{ color: flow.accentFrom }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 truncate leading-snug">{flow.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${flow.authorColor}`}
                >
                  {flow.authorInitials}
                </div>
                <span className="text-[10px] font-black text-slate-500">{flow.author}</span>
                {flow.isUserShared && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-indigo-500 bg-indigo-50 border border-indigo-200 px-1.5 rounded-full">You</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {userOwned && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(flow.id); }}
                className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                title="Remove from Shared Space"
              >
                <Trash2 size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={handleLike}
              className={`flex items-center gap-1 h-7 px-2 rounded-full border text-[10px] font-black transition-all ${
                liked
                  ? 'border-rose-300 bg-rose-50 text-rose-600'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-500'
              }`}
            >
              <Heart size={11} className={liked ? 'fill-rose-500' : ''} />
              {likeCount}
            </button>
          </div>
        </div>

        {/* Description */}
        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">{flow.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {flow.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} small />
          ))}
        </div>

        {/* Footer stats + action */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-black">
            <span className="flex items-center gap-1">
              <Eye size={11} />
              {(flow.views || 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Network size={11} />
              {(flow.nodes || []).length} nodes
            </span>
            <span className="text-slate-300">·</span>
            <span>{flow.createdAt}</span>
          </div>

          <button
            type="button"
            onClick={() => onLoadToCanvas(flow)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${flow.accentFrom}, ${flow.accentTo})`,
              boxShadow: `0 4px 12px ${flow.accentFrom}50`,
            }}
          >
            <ArrowUpRight size={11} />
            Load to Canvas
          </button>
        </div>
      </div>
    </div>
  );
};

const SharedSpaceTab = () => {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [sortBy, setSortBy] = useState('likes');
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenuRef = useRef(null);
  const [userFlows, setUserFlows] = useState(() => loadUserSharedFlows());

  // Close sort dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allFlows = useMemo(() => {
    return [
      ...userFlows,
      ...SHARED_FLOWS,
    ];
  }, [userFlows]);

  const filtered = useMemo(() => {
    let list = allFlows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.author.toLowerCase().includes(q) ||
          f.tags.some((t) => t.includes(q))
      );
    }
    if (activeTag) {
      list = list.filter((f) => f.tags.includes(activeTag));
    }
    if (sortBy === 'likes') list = [...list].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    if (sortBy === 'views') list = [...list].sort((a, b) => (b.views || 0) - (a.views || 0));
    if (sortBy === 'newest') list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  }, [allFlows, search, activeTag, sortBy]);

  const handleLoadToCanvas = (flow) => {
    window.dispatchEvent(new CustomEvent('xrag-load-canvas-flow', { detail: { flow } }));
    window.dispatchEvent(new CustomEvent('xrag-switch-to-canvas'));
  };

  const handleDeleteUserFlow = (flowId) => {
    setUserFlows((prev) => {
      const next = prev.filter((f) => f.id !== flowId);
      try {
        localStorage.setItem('xrag-shared-space-v1', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50">
      {/* Hero header */}
      <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-10 md:px-12">
        {/* Clipped blob layer */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute -bottom-16 right-0 h-80 w-80 rounded-full bg-violet-600/15 blur-3xl" />
          <div className="absolute top-10 right-1/3 h-40 w-40 rounded-full bg-cyan-500/10 blur-2xl" />
        </div>

        <div className="relative max-w-4xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-400/30 backdrop-blur-sm">
              <Globe size={20} className="text-indigo-300" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-300">Community</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none mb-3">
            Shared Space
          </h1>
          <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
            Browse community-shared RAG architectures. Click <span className="text-indigo-300 font-black">Load to Canvas</span> to instantly load any pipeline into the canvas.
          </p>

          {/* Search bar */}
          <div className="mt-6 flex items-center gap-3 max-w-xl">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search flows, authors, tags…"
                className="w-full rounded-2xl border border-slate-700/60 bg-slate-800/60 pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 backdrop-blur-sm transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div ref={sortMenuRef} className="relative shrink-0">
              {(() => {
                const active = SORT_OPTIONS.find((o) => o.key === sortBy) || SORT_OPTIONS[0];
                const accent = SORT_ACCENTS[active.accent];
                const ActiveIcon = active.Icon;
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setSortOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={sortOpen}
                      className={`group inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2.5 text-[11px] font-black shadow-sm transition ${accent.ring} hover:shadow-md`}
                    >
                      <ActiveIcon
                        size={12}
                        className={active.accent === 'rose' ? 'fill-rose-500 text-rose-500' : ''}
                      />
                      <span>{active.label}</span>
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${sortOpen ? 'rotate-180' : ''} opacity-70 group-hover:opacity-100`}
                      />
                    </button>

                    {sortOpen && (
                      <div
                        role="listbox"
                        className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl ring-1 ring-black/5 backdrop-blur"
                      >
                        <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                          Sort by
                        </div>
                        <ul className="py-1">
                          {SORT_OPTIONS.map((opt) => {
                            const isActive = opt.key === sortBy;
                            const optAccent = SORT_ACCENTS[opt.accent];
                            const OptIcon = opt.Icon;
                            return (
                              <li key={opt.key}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={isActive}
                                  onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                                    isActive
                                      ? `${optAccent.ring} font-black`
                                      : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-lg ${
                                    isActive ? optAccent.dot + ' text-white' : 'bg-slate-100 ' + optAccent.soft
                                  }`}>
                                    <OptIcon
                                      size={11}
                                      className={
                                        opt.accent === 'rose' && isActive
                                          ? 'fill-white text-white'
                                          : opt.accent === 'rose'
                                            ? 'fill-rose-500 text-rose-500'
                                            : ''
                                      }
                                    />
                                  </span>
                                  <span className="flex-1">{opt.label}</span>
                                  {isActive && <Check size={12} className={optAccent.soft} />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-5 flex items-center gap-6 text-[11px] font-black uppercase tracking-wider">
            <span className="text-slate-400">
              <span className="text-white text-lg font-black mr-1">{allFlows.length}</span>
              flows
            </span>
            <span className="text-slate-400">
              <span className="text-white text-lg font-black mr-1">
                {allFlows.reduce((s, f) => s + (f.likes || 0), 0).toLocaleString()}
              </span>
              likes
            </span>
            <span className="text-slate-400">
              <span className="text-white text-lg font-black mr-1">
                {new Set(allFlows.map((f) => f.author)).size}
              </span>
              authors
            </span>
          </div>
        </div>
      </div>

      {/* Tag filter strip */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 md:px-12 py-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Tag size={12} className="text-slate-400 shrink-0" />
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${
              activeTag === null
                ? 'border-indigo-400 bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            All
          </button>
          {ALL_TAGS.map((tag) => (
            <TagBadge
              key={tag}
              tag={tag}
              active={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            />
          ))}
        </div>
      </div>

      {/* Flow grid */}
      <div className="px-6 md:px-12 py-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
              <Sparkles size={28} />
            </div>
            <p className="text-sm font-black text-slate-600">No results found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different keyword, author, or tag.</p>
            <button
              type="button"
              onClick={() => { setSearch(''); setActiveTag(null); }}
              className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-indigo-700 hover:bg-indigo-100"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                {filtered.length} architecture{filtered.length !== 1 ? 's' : ''}
                {activeTag && <span className="ml-2 text-indigo-600">· #{activeTag}</span>}
              </p>
              <div className="flex items-center gap-1.5">
                <Share2 size={11} className="text-slate-400" />
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                  Share from the Canvas Memory panel
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((flow) => (
                <FlowCard
                  key={flow.id}
                  flow={flow}
                  onLoadToCanvas={handleLoadToCanvas}
                  onDelete={handleDeleteUserFlow}
                  userOwned={flow.isUserShared === true}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SharedSpaceTab;
