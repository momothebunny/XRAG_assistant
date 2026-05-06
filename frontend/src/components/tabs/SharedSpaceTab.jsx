import {
  ArrowUpRight,
  ChevronDown,
  Eye,
  Filter,
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
  { key: 'likes', label: 'Most liked', Icon: Heart },
  { key: 'views', label: 'Most viewed', Icon: Eye },
  { key: 'newest', label: 'Newest', Icon: TrendingUp },
];

const DOMAIN_RULES = [
  { key: 'enterprise', label: 'Enterprise', tags: ['enterprise', 'compliance'] },
  { key: 'support', label: 'Customer Support', tags: ['support', 'helpdesk', 'saas'] },
  { key: 'legal', label: 'Legal', tags: ['legal', 'contracts'] },
  { key: 'medical', label: 'Medical', tags: ['medical'] },
  { key: 'finance', label: 'Finance', tags: ['finance', 'reports'] },
  { key: 'engineering', label: 'Engineering', tags: ['code', 'devops', 'review'] },
  { key: 'research', label: 'Research', tags: ['research', 'arxiv', 'academic'] },
];

const DOMAIN_LOOKUP = Object.fromEntries(DOMAIN_RULES.map((item) => [item.key, item.label]));

const inferFlowDomain = (flow) => {
  const flowTags = new Set(flow.tags || []);
  const matchingDomain = DOMAIN_RULES.find((domain) => domain.tags.some((tag) => flowTags.has(tag)));
  return matchingDomain?.key || 'general';
};

const getDomainLabel = (domainKey) => DOMAIN_LOOKUP[domainKey] || 'General';

const TAG_COLORS = {
  enterprise: 'bg-slate-900 text-amber-300 border-amber-500/40',
  compliance: 'bg-slate-900 text-amber-300 border-amber-500/40',
  reranker: 'bg-slate-900 text-amber-300 border-amber-500/40',
  pinecone: 'bg-slate-900 text-slate-200 border-slate-600',
  multilingual: 'bg-slate-900 text-slate-200 border-slate-600',
  hyde: 'bg-slate-900 text-amber-300 border-amber-500/40',
  support: 'bg-slate-900 text-amber-300 border-amber-500/40',
  helpdesk: 'bg-slate-900 text-amber-300 border-amber-500/40',
  legal: 'bg-slate-900 text-amber-300 border-amber-500/40',
  contracts: 'bg-slate-900 text-slate-200 border-slate-600',
  pii: 'bg-slate-900 text-slate-200 border-slate-600',
  'context-compression': 'bg-slate-900 text-slate-200 border-slate-600',
  medical: 'bg-slate-900 text-amber-300 border-amber-500/40',
  graphrag: 'bg-slate-900 text-slate-200 border-slate-600',
  neo4j: 'bg-slate-900 text-slate-200 border-slate-600',
  'hallucination-guard': 'bg-slate-900 text-amber-300 border-amber-500/40',
  finance: 'bg-slate-900 text-amber-300 border-amber-500/40',
  reports: 'bg-slate-900 text-slate-200 border-slate-600',
  'query-rewriter': 'bg-slate-900 text-slate-200 border-slate-600',
  citations: 'bg-slate-900 text-amber-300 border-amber-500/40',
  code: 'bg-slate-900 text-amber-300 border-amber-500/40',
  review: 'bg-slate-900 text-slate-200 border-slate-600',
  'reflection-loop': 'bg-slate-900 text-slate-200 border-slate-600',
  devops: 'bg-slate-900 text-amber-300 border-amber-500/40',
  agentic: 'bg-slate-900 text-amber-300 border-amber-500/40',
  router: 'bg-slate-900 text-slate-200 border-slate-600',
  guardrails: 'bg-slate-900 text-slate-200 border-slate-600',
  saas: 'bg-slate-900 text-slate-200 border-slate-600',
  research: 'bg-slate-900 text-amber-300 border-amber-500/40',
  arxiv: 'bg-slate-900 text-slate-200 border-slate-600',
  reflection: 'bg-slate-900 text-slate-200 border-slate-600',
  academic: 'bg-slate-900 text-slate-200 border-slate-600',
};

const TAG_DEFAULT = 'bg-slate-900 text-slate-200 border-slate-600';

const TagBadge = ({ tag, small = false, active = false, onClick }) => {
  const colorClass = TAG_COLORS[tag] || TAG_DEFAULT;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-black uppercase tracking-wider transition-all ${
        small ? 'text-[9px]' : 'text-[10px]'
      } ${active ? `${colorClass} ring-2 ring-offset-1 ring-offset-slate-950 ring-amber-400 scale-105` : `${colorClass} hover:scale-105`}`}
    >
      {!small && <Tag size={9} />}
      {tag}
    </button>
  );
};

const FlowCard = ({ flow, onLoadToCanvas, onDelete, userOwned = false }) => {
  const [likeState, setLikeState] = useState({ liked: false, likeCount: flow.likes || 0 });
  const { liked, likeCount } = likeState;
  const domainKey = inferFlowDomain(flow);
  const domainLabel = getDomainLabel(domainKey);

  const handleLike = (e) => {
    e.stopPropagation();
    setLikeState((previous) => ({
      liked: !previous.liked,
      likeCount: Math.max(0, previous.likeCount + (previous.liked ? -1 : 1)),
    }));
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/50 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="h-1.5 w-full shrink-0 bg-amber-500" />

      <div className="flex flex-col flex-1 gap-3 p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-500/40 bg-slate-950">
              <Network size={18} className="text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black leading-snug text-amber-200">{flow.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-lg border border-slate-600 bg-slate-950 text-[9px] font-black text-amber-300">
                  {flow.authorInitials}
                </div>
                <span className="max-w-[9rem] truncate text-[10px] font-black text-slate-300">{flow.author}</span>
                <span className="max-w-[8.5rem] truncate rounded-full border border-amber-500/40 bg-slate-950 px-1.5 text-[9px] font-black uppercase tracking-wider text-amber-300">{domainLabel}</span>
                {flow.isUserShared && (
                  <span className="rounded-full border border-amber-500/40 bg-slate-950 px-1.5 text-[9px] font-black uppercase tracking-wider text-amber-300">You</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {userOwned && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(flow.id); }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 text-slate-400 transition-colors hover:border-amber-500/40 hover:bg-slate-800 hover:text-amber-300"
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
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : 'border-slate-600 bg-slate-950 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
              }`}
            >
              <Heart size={11} className={liked ? 'fill-slate-950' : ''} />
              {likeCount}
            </button>
          </div>
        </div>

        {/* Description */}
        <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-300">{flow.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {flow.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} small />
          ))}
        </div>

        {/* Footer stats + action */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-slate-400 sm:gap-3">
            <span className="flex items-center gap-1">
              <Eye size={11} />
              {(flow.views || 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Network size={11} />
              {(flow.nodes || []).length} nodes
            </span>
            <span className="text-slate-500">·</span>
            <span>{flow.createdAt}</span>
          </div>

          <button
            type="button"
            onClick={() => onLoadToCanvas(flow)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-950 transition-all hover:scale-105 hover:bg-amber-400 active:scale-95 sm:px-3"
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
  const [activeDomain, setActiveDomain] = useState('all');
  const [sortBy, setSortBy] = useState('likes');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const [userFlows, setUserFlows] = useState(() => loadUserSharedFlows());

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) {
        setFilterOpen(false);
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

  const allTags = useMemo(() => [...new Set(allFlows.flatMap((flow) => flow.tags || []))].sort(), [allFlows]);

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
    if (activeDomain !== 'all') {
      list = list.filter((flow) => inferFlowDomain(flow) === activeDomain);
    }
    if (activeTag) {
      list = list.filter((f) => f.tags.includes(activeTag));
    }
    if (sortBy === 'likes') list = [...list].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    if (sortBy === 'views') list = [...list].sort((a, b) => (b.views || 0) - (a.views || 0));
    if (sortBy === 'newest') list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  }, [allFlows, search, activeDomain, activeTag, sortBy]);

  const groupedByDomain = useMemo(() => {
    const groups = new Map();
    filtered.forEach((flow) => {
      const domain = inferFlowDomain(flow);
      if (!groups.has(domain)) {
        groups.set(domain, []);
      }
      groups.get(domain).push(flow);
    });

    return [...groups.entries()]
      .sort((left, right) => getDomainLabel(left[0]).localeCompare(getDomainLabel(right[0])))
      .map(([domain, flows]) => ({ domain, label: getDomainLabel(domain), flows }));
  }, [filtered]);

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
    <div data-xrag-tab="shared-space" className="xrag-shared-theme h-full w-full overflow-y-auto bg-slate-950 text-slate-100">
      {/* Hero header */}
      <div className="relative border-b border-slate-800 bg-slate-950 px-6 py-10 md:px-12">
        {/* Clipped blob layer */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute -bottom-16 right-0 h-80 w-80 rounded-full bg-amber-500/5 blur-3xl" />
        </div>

        <div className="relative max-w-4xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/40 bg-slate-900 backdrop-blur-sm">
              <Globe size={20} className="text-amber-300" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-300">Community</span>
          </div>
          <h1 className="mb-3 text-2xl font-black leading-tight tracking-tight text-amber-200 sm:text-3xl md:text-4xl">
            Shared Space
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-slate-300">
            Browse community-shared RAG architectures. Click <span className="font-black text-amber-300">Load to Canvas</span> to instantly load any pipeline into the canvas.
          </p>

          {/* Search bar */}
          <div className="mt-6 flex max-w-3xl items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search flows, authors, tags…"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div ref={filterMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setFilterOpen((previous) => !previous)}
                aria-haspopup="menu"
                aria-expanded={filterOpen}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-500/40 bg-slate-900 px-3 py-2.5 text-[11px] font-black text-amber-300 transition hover:bg-slate-800"
              >
                <Filter size={12} /> Filters
                <ChevronDown size={12} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
              </button>

              {filterOpen && (
                <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Filter criteria</p>

                  <div className="space-y-2.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Domain
                      <select
                        value={activeDomain}
                        onChange={(event) => setActiveDomain(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-500/25"
                      >
                        <option value="all">All domains</option>
                        {DOMAIN_RULES.map((domain) => (
                          <option key={domain.key} value={domain.key}>{domain.label}</option>
                        ))}
                        <option value="general">General</option>
                      </select>
                    </label>

                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Tag
                      <select
                        value={activeTag || 'all'}
                        onChange={(event) => setActiveTag(event.target.value === 'all' ? null : event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-500/25"
                      >
                        <option value="all">All tags</option>
                        {allTags.map((tag) => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Sort
                      <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-bold text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-500/25"
                      >
                        {SORT_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveDomain('all');
                        setActiveTag(null);
                        setSortBy('likes');
                      }}
                      className="w-full rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 transition hover:bg-slate-800"
                    >
                      Reset criteria
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Active:</span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-200">
              Domain · {activeDomain === 'all' ? 'All' : getDomainLabel(activeDomain)}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-200">
              Tag · {activeTag || 'All'}
            </span>
            <span className="rounded-full border border-amber-500/40 bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
              Sort · {(SORT_OPTIONS.find((option) => option.key === sortBy)?.label || 'Most liked')}
            </span>
          </div>

          {/* Stats row */}
          <div className="mt-5 flex items-center gap-6 text-[11px] font-black uppercase tracking-wider">
            <span className="text-slate-400">
              <span className="mr-1 text-lg font-black text-amber-200">{allFlows.length}</span>
              flows
            </span>
            <span className="text-slate-400">
              <span className="mr-1 text-lg font-black text-amber-200">
                {allFlows.reduce((s, f) => s + (f.likes || 0), 0).toLocaleString()}
              </span>
              likes
            </span>
            <span className="text-slate-400">
              <span className="mr-1 text-lg font-black text-amber-200">
                {new Set(allFlows.map((f) => f.author)).size}
              </span>
              authors
            </span>
          </div>
        </div>
      </div>

      {/* Flow grid */}
      <div className="px-6 md:px-12 py-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-700 bg-slate-900 text-slate-400">
              <Sparkles size={28} />
            </div>
            <p className="text-sm font-black text-amber-200">No results found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different keyword, author, or tag.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setActiveTag(null);
                setActiveDomain('all');
              }}
              className="mt-4 rounded-xl border border-amber-500/40 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-slate-800"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {filtered.length} architecture{filtered.length !== 1 ? 's' : ''}
                {activeTag && <span className="ml-2 text-amber-300">· #{activeTag}</span>}
              </p>
              <div className="flex items-center gap-1.5">
                <Share2 size={11} className="text-slate-400" />
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                  Share from the Canvas Memory panel
                </span>
              </div>
            </div>

            <div className="space-y-8">
              {groupedByDomain.map((domainGroup) => (
                <section key={domainGroup.domain} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Tag size={12} className="text-amber-300" />
                    <h2 className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">{domainGroup.label}</h2>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-300">
                      {domainGroup.flows.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {domainGroup.flows.map((flow) => (
                      <FlowCard
                        key={flow.id}
                        flow={flow}
                        onLoadToCanvas={handleLoadToCanvas}
                        onDelete={handleDeleteUserFlow}
                        userOwned={flow.isUserShared === true}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SharedSpaceTab;
