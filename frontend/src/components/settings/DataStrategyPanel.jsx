import { Database, HardDrive, Pin, RotateCw, SlidersHorizontal, Unplug } from 'lucide-react';
import { useMemo, useState } from 'react';

const INITIAL_CAG_FILES = [
  { id: 'doc1', name: 'Important Project Overview.pdf', pinned: false },
  { id: 'doc2', name: 'Q4 Financial Report.xlsx', pinned: true },
  { id: 'doc3', name: 'Customer Feedback Analysis.docx', pinned: false },
];

const INITIAL_RAG_SOURCES = [
  { id: 'folder1', name: 'Client Documents Archive' },
  { id: 'db1', name: 'Product Database' },
  { id: 'folder2', name: 'Research Papers' },
];

const CACHE_LIMIT = 1000000;
const RERANKER_MODELS = ['cohere-rerank-v3', 'bge-reranker-v2-m3', 'jina-reranker-v2'];
const LLM_MODELS = ['Gemini 2.5 Flash', 'Gemini 1.5 Pro', 'GPT-4o', 'Claude 3.5 Sonnet'];
const DEFAULT_SYSTEM_PROMPT = 'You are a professional research assistant. Always cite your sources and clearly separate verified context from assumptions.';

const DataStrategyPanel = ({ aiConfig, onAiConfigChange, retrievalConfig, onRetrievalConfigChange }) => {
  const [cagFiles, setCagFiles] = useState(INITIAL_CAG_FILES);
  const [ragSources] = useState(INITIAL_RAG_SOURCES);
  const [recentlyReindexed, setRecentlyReindexed] = useState(null);

  const selectedModel = aiConfig?.model || 'GPT-4o';
  const temperature = aiConfig?.temperature ?? 0.7;
  const systemPrompt = aiConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const strictMode = aiConfig?.strictMode ?? true;
  const hybridAlpha = retrievalConfig?.hybridAlpha ?? 0.5;
  const topK = retrievalConfig?.topK ?? 5;
  const rerankerEnabled = retrievalConfig?.rerankerEnabled ?? true;
  const rerankerModel = retrievalConfig?.rerankerModel || RERANKER_MODELS[0];

  const pinnedCount = useMemo(() => cagFiles.filter((file) => file.pinned).length, [cagFiles]);
  const cacheUsed = Math.min(CACHE_LIMIT, pinnedCount * 250000);
  const cachePercentage = (cacheUsed / CACHE_LIMIT) * 100;

  const togglePin = (id) => {
    setCagFiles((prevFiles) => prevFiles.map((file) => (file.id === id ? { ...file, pinned: !file.pinned } : file)));
  };

  const handleReindex = (id) => {
    const source = ragSources.find((item) => item.id === id);
    setRecentlyReindexed(source?.name ?? null);
  };

  const handleTopKChange = (event) => {
    const value = Number(event.target.value);

    if (Number.isNaN(value)) {
      return;
    }

    updateRetrievalConfig({ topK: Math.min(50, Math.max(1, value)) });
  };

  const updateAiConfig = (nextValues) => {
    onAiConfigChange((previous) => ({
      ...previous,
      ...nextValues,
    }));
  };

  const updateRetrievalConfig = (nextValues) => {
    onRetrievalConfigChange((previous) => ({
      ...previous,
      ...nextValues,
    }));
  };

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <HardDrive size={16} /> Data Strategy
      </h3>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-800">
              <Pin size={16} className="text-indigo-600" />
              <h4 className="text-sm font-black uppercase tracking-wide">CAG Cache Zone</h4>
            </div>
            <p className="text-xs text-slate-500 mt-1">Pin high-priority docs for lower-latency generation.</p>
          </div>

          <div className="p-6 space-y-4">
            <ul className="space-y-2">
              {cagFiles.map((file) => (
                <li key={file.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700 truncate pr-3">{file.name}</span>
                  <button
                    onClick={() => togglePin(file.id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                      file.pinned
                        ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    }`}
                  >
                    {file.pinned ? 'Unpin' : 'Pin'}
                  </button>
                </li>
              ))}
            </ul>

            <div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full transition-all ${cachePercentage > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${cachePercentage}%` }}
                ></div>
              </div>
              <p className="mt-2 text-[11px] font-bold text-slate-500">
                Active Cache Utilization: {cacheUsed.toLocaleString()} / {CACHE_LIMIT.toLocaleString()} tokens
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-800">
              <Database size={16} className="text-blue-600" />
              <h4 className="text-sm font-black uppercase tracking-wide">RAG Vector Zone</h4>
            </div>
            <p className="text-xs text-slate-500 mt-1">Maintain searchable sources for scalable retrieval.</p>
          </div>

          <div className="p-6 space-y-2">
            {ragSources.map((source) => (
              <div key={source.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-700 truncate pr-3">{source.name}</span>
                <button
                  onClick={() => handleReindex(source.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  <RotateCw size={11} /> Re-index
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {recentlyReindexed && (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
          <Unplug size={14} className="text-emerald-600" /> Re-index queued for: {recentlyReindexed}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800">
            <SlidersHorizontal size={16} className="text-amber-600" />
            <h4 className="text-sm font-black uppercase tracking-wide">Retrieval Strategy</h4>
          </div>
          <p className="text-xs text-slate-500 mt-1">Tune how the retrieval engine selects and prioritizes context.</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance Vector vs. Keyword Search</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={hybridAlpha}
              onChange={(event) => updateRetrievalConfig({ hybridAlpha: Number(event.target.value) })}
              className="w-full accent-indigo-600"
            />
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>0.0 (BM25 Only)</span>
              <span>0.5 (Hybrid)</span>
              <span>1.0 (Semantic Only)</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Number of Context Chunks to Retrieve</label>
            <input
              type="number"
              min="1"
              max="50"
              step="1"
              value={topK}
              onChange={handleTopKChange}
              className="w-28 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enable Post-Retrieval Re-ranking (Improves Relevance)</p>
                <p className="text-xs font-bold text-slate-500 mt-1">State: {rerankerEnabled ? 'ON' : 'OFF'}</p>
              </div>
              <button
                type="button"
                onClick={() => updateRetrievalConfig({ rerankerEnabled: !rerankerEnabled })}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  rerankerEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                aria-pressed={rerankerEnabled}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    rerankerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reranker Model</label>
              <select
                value={rerankerModel}
                onChange={(event) => updateRetrievalConfig({ rerankerModel: event.target.value })}
                disabled={!rerankerEnabled}
                className="w-full md:w-72 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {RERANKER_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800">
            <SlidersHorizontal size={16} className="text-amber-600" />
            <h4 className="text-sm font-black uppercase tracking-wide">LLM Configuration</h4>
          </div>
          <p className="text-xs text-slate-500 mt-1">Control model behavior, style, and grounding constraints.</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Model Selection</label>
            <select
              value={selectedModel}
              onChange={(event) => updateAiConfig({ model: event.target.value })}
              className="w-full md:w-80 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              {LLM_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Response Creativity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(event) => updateAiConfig({ temperature: Number(event.target.value) })}
              className="w-full accent-indigo-600"
            />
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>0.0 (Precise/Robot)</span>
              <span>0.7 (Balanced)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(event) => updateAiConfig({ systemPrompt: event.target.value })}
              rows={6}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-y"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Only Answer from Provided Context (No Hallucinations)</p>
              <p className="text-xs font-bold text-slate-500 mt-1">State: {strictMode ? 'ON' : 'OFF'}</p>
            </div>
            <button
              type="button"
              onClick={() => updateAiConfig({ strictMode: !strictMode })}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                strictMode ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
              aria-pressed={strictMode}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  strictMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DataStrategyPanel;
