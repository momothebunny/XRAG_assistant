import { Clock3, Database, DollarSign, HardDrive, ListChecks, Pin, RotateCw, SlidersHorizontal, Unplug } from 'lucide-react';
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
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const BACKOFF_STRATEGIES = ['exponential', 'linear', 'fixed'];
const DEFAULT_SYSTEM_PROMPT = 'You are a professional research assistant. Always cite your sources and clearly separate verified context from assumptions.';
const PROFILE_PRESETS = {
  dev: {
    ai: { temperature: 0.8, strictMode: false },
    retrieval: { topK: 4, hybridAlpha: 0.4 },
  },
  staging: {
    ai: { temperature: 0.6, strictMode: true },
    retrieval: { topK: 6, hybridAlpha: 0.5 },
  },
  prod: {
    ai: { temperature: 0.3, strictMode: true },
    retrieval: { topK: 8, hybridAlpha: 0.6 },
  },
};

const DataStrategyPanel = ({ aiConfig, onAiConfigChange, retrievalConfig, onRetrievalConfigChange }) => {
  const [cagFiles, setCagFiles] = useState(INITIAL_CAG_FILES);
  const [ragSources] = useState(INITIAL_RAG_SOURCES);
  const [recentlyReindexed, setRecentlyReindexed] = useState(null);

  const selectedModel = aiConfig?.model || 'GPT-4o';
  const temperature = aiConfig?.temperature ?? 0.7;
  const systemPrompt = aiConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const strictMode = aiConfig?.strictMode ?? true;
  const environmentProfile = aiConfig?.environmentProfile || 'staging';
  const promptVersions = Array.isArray(aiConfig?.promptVersions) ? aiConfig.promptVersions : [];
  const selectedPromptVersionId = aiConfig?.selectedPromptVersionId || '';
  const hybridAlpha = retrievalConfig?.hybridAlpha ?? 0.5;
  const topK = retrievalConfig?.topK ?? 5;
  const rerankerEnabled = retrievalConfig?.rerankerEnabled ?? true;
  const rerankerModel = retrievalConfig?.rerankerModel || RERANKER_MODELS[0];
  const costGuardrails = retrievalConfig?.costGuardrails || {};
  const retryPolicy = retrievalConfig?.retryPolicy || {};
  const observability = retrievalConfig?.observability || {};
  const dailyBudgetUsd = Number.isFinite(costGuardrails.dailyBudgetUsd) ? costGuardrails.dailyBudgetUsd : 25;
  const monthlyBudgetUsd = Number.isFinite(costGuardrails.monthlyBudgetUsd) ? costGuardrails.monthlyBudgetUsd : 400;
  const perRequestTokenCap = Number.isFinite(costGuardrails.perRequestTokenCap) ? costGuardrails.perRequestTokenCap : 8000;
  const hardStopOnLimit = costGuardrails.hardStopOnLimit ?? true;
  const timeoutMs = Number.isFinite(retryPolicy.timeoutMs) ? retryPolicy.timeoutMs : 12000;
  const maxRetries = Number.isFinite(retryPolicy.maxRetries) ? retryPolicy.maxRetries : 2;
  const requestsPerMinute = Number.isFinite(retryPolicy.requestsPerMinute) ? retryPolicy.requestsPerMinute : 60;
  const backoffStrategy = retryPolicy.backoffStrategy || 'exponential';
  const logLevel = observability.logLevel || 'info';
  const piiMasking = observability.piiMasking ?? true;
  const retentionDays = Number.isFinite(observability.retentionDays) ? observability.retentionDays : 30;
  const traceSamplingPercent = Number.isFinite(observability.traceSamplingPercent) ? observability.traceSamplingPercent : 25;

  const selectedPromptVersion = useMemo(
    () => promptVersions.find((version) => version.id === selectedPromptVersionId) || null,
    [promptVersions, selectedPromptVersionId]
  );

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

  const saveCurrentPromptVersion = () => {
    const timestamp = Date.now();
    const nextVersion = {
      id: `prompt-${timestamp}`,
      label: `Version ${promptVersions.length + 1}`,
      prompt: systemPrompt,
      createdAt: new Date(timestamp).toISOString(),
    };

    updateAiConfig({
      promptVersions: [nextVersion, ...promptVersions].slice(0, 20),
      selectedPromptVersionId: nextVersion.id,
    });
  };

  const rollbackToPromptVersion = () => {
    if (!selectedPromptVersion) return;
    updateAiConfig({ systemPrompt: selectedPromptVersion.prompt });
  };

  const applyProfilePreset = (profile) => {
    const preset = PROFILE_PRESETS[profile];
    if (!preset) return;
    updateAiConfig({
      environmentProfile: profile,
      temperature: preset.ai.temperature,
      strictMode: preset.ai.strictMode,
    });
    updateRetrievalConfig({
      topK: preset.retrieval.topK,
      hybridAlpha: preset.retrieval.hybridAlpha,
    });
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
                        ? 'xrag-settings-amber-btn bg-amber-300 text-slate-900 hover:bg-amber-200 border border-amber-400'
                        : 'xrag-settings-dark-btn bg-slate-900 text-amber-300 hover:bg-slate-800 border border-slate-700'
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
                  className="xrag-settings-amber-btn inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-400 bg-amber-300 text-slate-900 hover:bg-amber-200 transition-colors"
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
              className="w-full accent-amber-500"
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
              className="w-28 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 transition-all"
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
                    rerankerEnabled ? 'bg-amber-500' : 'bg-slate-300'
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
                className="w-full md:w-72 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full md:w-80 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 transition-all"
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
              className="w-full accent-amber-500"
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
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-y"
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
                strictMode ? 'bg-amber-500' : 'bg-slate-300'
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

      <div className="space-y-4">
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
          <ListChecks size={14} /> Operations & Governance
        </h4>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <p className="text-sm font-black uppercase tracking-wide text-slate-800">Prompt Versioning & Rollback</p>
              <p className="mt-1 text-xs text-slate-500">Save prompt snapshots and rollback safely.</p>
            </div>
            <div className="space-y-3 p-6">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                <select
                  value={selectedPromptVersionId}
                  onChange={(event) => updateAiConfig({ selectedPromptVersionId: event.target.value })}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Select prompt version…</option>
                  {promptVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label} · {new Date(version.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={saveCurrentPromptVersion}
                  className="xrag-settings-dark-btn rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-slate-800 border border-slate-700"
                >
                  Save version
                </button>
                <button
                  type="button"
                  onClick={rollbackToPromptVersion}
                  disabled={!selectedPromptVersion}
                  className="xrag-settings-amber-btn rounded-xl bg-amber-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-900 hover:bg-amber-200 border border-amber-400 disabled:opacity-50"
                >
                  Rollback
                </button>
              </div>
              {selectedPromptVersion && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                  Selected: <span className="font-mono">{selectedPromptVersion.label}</span>
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800"><DollarSign size={14} className="text-amber-600" /> Cost Guardrails</p>
              <p className="mt-1 text-xs text-slate-500">Budget and token caps with optional hard-stop.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Daily budget (USD)</span>
                <input
                  type="number"
                  min="1"
                  value={dailyBudgetUsd}
                  onChange={(event) => updateRetrievalConfig({ costGuardrails: { ...costGuardrails, dailyBudgetUsd: Number(event.target.value) || 1 } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly budget (USD)</span>
                <input
                  type="number"
                  min="1"
                  value={monthlyBudgetUsd}
                  onChange={(event) => updateRetrievalConfig({ costGuardrails: { ...costGuardrails, monthlyBudgetUsd: Number(event.target.value) || 1 } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Per-request token cap</span>
                <input
                  type="number"
                  min="256"
                  step="256"
                  value={perRequestTokenCap}
                  onChange={(event) => updateRetrievalConfig({ costGuardrails: { ...costGuardrails, perRequestTokenCap: Number(event.target.value) || 256 } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
              <label className="md:col-span-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={hardStopOnLimit}
                  onChange={(event) => updateRetrievalConfig({ costGuardrails: { ...costGuardrails, hardStopOnLimit: event.target.checked } })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Hard stop when budget is exceeded
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800"><Clock3 size={14} className="text-blue-600" /> Rate-limit & Retry Policy</p>
              <p className="mt-1 text-xs text-slate-500">Control timeout, retries and request throughput.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Timeout (ms)</span>
                <input
                  type="number"
                  min="1000"
                  step="500"
                  value={timeoutMs}
                  onChange={(event) => updateRetrievalConfig({ retryPolicy: { ...retryPolicy, timeoutMs: Number(event.target.value) || 1000 } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max retries</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={maxRetries}
                  onChange={(event) => updateRetrievalConfig({ retryPolicy: { ...retryPolicy, maxRetries: Math.min(10, Math.max(0, Number(event.target.value) || 0)) } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Backoff strategy</span>
                <select
                  value={backoffStrategy}
                  onChange={(event) => updateRetrievalConfig({ retryPolicy: { ...retryPolicy, backoffStrategy: event.target.value } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {BACKOFF_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>{strategy}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Requests / minute</span>
                <input
                  type="number"
                  min="1"
                  value={requestsPerMinute}
                  onChange={(event) => updateRetrievalConfig({ retryPolicy: { ...retryPolicy, requestsPerMinute: Number(event.target.value) || 1 } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <p className="text-sm font-black uppercase tracking-wide text-slate-800">Observability Defaults</p>
              <p className="mt-1 text-xs text-slate-500">Logging, PII handling and trace retention defaults.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Log level</span>
                <select
                  value={logLevel}
                  onChange={(event) => updateRetrievalConfig({ observability: { ...observability, logLevel: event.target.value } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {LOG_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Retention (days)</span>
                <input
                  type="number"
                  min="1"
                  value={retentionDays}
                  onChange={(event) => updateRetrievalConfig({ observability: { ...observability, retentionDays: Number(event.target.value) || 1 } })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trace sampling (%)</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={traceSamplingPercent}
                  onChange={(event) => updateRetrievalConfig({ observability: { ...observability, traceSamplingPercent: Number(event.target.value) } })}
                  className="w-full accent-amber-500"
                />
                <p className="text-[11px] font-bold text-slate-500">Current: {traceSamplingPercent}%</p>
              </label>
              <label className="md:col-span-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={piiMasking}
                  onChange={(event) => updateRetrievalConfig({ observability: { ...observability, piiMasking: event.target.checked } })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                PII masking enabled by default
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden xl:col-span-2">
            <div className="border-b border-slate-100 p-6">
              <p className="text-sm font-black uppercase tracking-wide text-slate-800">Environment Profile Switch</p>
              <p className="mt-1 text-xs text-slate-500">Switch between dev, staging, and prod presets.</p>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {['dev', 'staging', 'prod'].map((profile) => (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => applyProfilePreset(profile)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      environmentProfile === profile
                        ? 'border-amber-400 bg-amber-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <p className="text-xs font-black uppercase tracking-wider">{profile}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Temp {PROFILE_PRESETS[profile].ai.temperature} · TopK {PROFILE_PRESETS[profile].retrieval.topK}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-slate-500">
                Active profile: <span className="font-mono text-slate-700">{environmentProfile}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DataStrategyPanel;
