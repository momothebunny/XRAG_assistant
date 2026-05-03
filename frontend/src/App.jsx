import { Activity, BarChart3, ClipboardCheck, FileText, Globe, Info, Menu, MessageSquare, Search, Settings, Workflow, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import NavItem from './components/NavItem';
import CanvasTab from './components/tabs/CanvasTab';
import ChatTab from './components/tabs/ChatTab';
import DocumentsTab from './components/tabs/DocumentsTab';
import HealthTab from './components/tabs/HealthTab';
import MetricsTab from './components/tabs/MetricsTab';
import SettingsTab from './components/tabs/SettingsTab';
import AuditTab from './components/tabs/AuditTab';
import SharedSpaceTab from './components/tabs/SharedSpaceTab';
import { INITIAL_DOCS, VECTOR_PROVIDERS } from './data/constants';
import { useChat } from './hooks/useChat';
import { xragApi } from './services/xragApi';

const TAB_TITLES = {
  chat: 'Intelligent Reasoning Interface',
  documents: 'Knowledge Ecosystem',
  canvas: 'No-Code RAG Canvas',
  'shared-space': 'Shared Space',
  audit: 'Flow Audit Arena',
  metrics: 'Performance Deep Dive',
  health: 'LLM Status & Health',
  settings: 'Infrastructure Config',
};

const AI_CONFIG_STORAGE_KEY = 'xrag-ai-config-v1';
const SAVED_ANSWERS_STORAGE_KEY = 'xrag-saved-answers-v1';
const RETRIEVAL_CONFIG_STORAGE_KEY = 'xrag-retrieval-config-v1';

const DEFAULT_AI_CONFIG = {
  model: 'GPT-4o',
  temperature: 0.7,
  systemPrompt:
    'You are a professional research assistant. Always cite your sources and clearly separate verified context from assumptions.',
  strictMode: true,
};

const DEFAULT_RETRIEVAL_CONFIG = {
  hybridAlpha: 0.5,
  topK: 5,
  rerankerEnabled: true,
  rerankerModel: 'cohere-rerank-v3',
};

const readStoredJson = (key, fallbackValue) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallbackValue;
    }

    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
};

const App = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedDB, setSelectedDB] = useState(VECTOR_PROVIDERS[0]);
  const [isMainNavCollapsed, setIsMainNavCollapsed] = useState(false);
  const [isMainNavOpen, setIsMainNavOpen] = useState(false);
  const [documents] = useState(INITIAL_DOCS);
  const [aiConfig, setAiConfig] = useState(() => ({ ...DEFAULT_AI_CONFIG, ...readStoredJson(AI_CONFIG_STORAGE_KEY, {}) }));
  const [retrievalConfig, setRetrievalConfig] = useState(() => ({
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...readStoredJson(RETRIEVAL_CONFIG_STORAGE_KEY, {}),
  }));
  const [savedAnswers, setSavedAnswers] = useState(() => readStoredJson(SAVED_ANSWERS_STORAGE_KEY, []));

  const { messages, inputValue, isTyping, chatEndRef, setInputValue, handleSendMessage } = useChat(selectedDB.name);

  useEffect(() => {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    const handler = () => setActiveTab('canvas');
    window.addEventListener('xrag-switch-to-canvas', handler);
    return () => window.removeEventListener('xrag-switch-to-canvas', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem(RETRIEVAL_CONFIG_STORAGE_KEY, JSON.stringify(retrievalConfig));
  }, [retrievalConfig]);

  useEffect(() => {
    localStorage.setItem(SAVED_ANSWERS_STORAGE_KEY, JSON.stringify(savedAnswers));
  }, [savedAnswers]);

  useEffect(() => {
    const normalizedModel = (aiConfig.model || '').toLowerCase();
    const llmProvider = normalizedModel.includes('gemini') ? 'gemini' : 'openai';
    const llmApiKeyEnv = llmProvider === 'gemini' ? 'GOOGLE_API_KEY' : 'OPENAI_API_KEY';

    xragApi
      .saveSettings({
        vector_store: {
          id: selectedDB.id,
          name: selectedDB.name,
          type: selectedDB.type,
        },
        retrieval: {
          hybrid_alpha: retrievalConfig.hybridAlpha,
          top_k: retrievalConfig.topK,
          reranker_enabled: retrievalConfig.rerankerEnabled,
          reranker_model: retrievalConfig.rerankerModel,
        },
        llm: {
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          system_prompt: aiConfig.systemPrompt,
          strict_mode: aiConfig.strictMode,
          provider: llmProvider,
          api_key_env: llmApiKeyEnv,
        },
      })
      .catch(() => {
        // Keep UI responsive even if backend sync is temporarily unavailable.
      });
  }, [selectedDB, retrievalConfig, aiConfig]);

  useEffect(() => {
    xragApi
      .listAnswers()
      .then((items) => setSavedAnswers(items))
      .catch(() => {
        // Keep local cache if backend cannot be reached.
      });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMainNavOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSaveAnswer = async (answerPayload) => {
    try {
      const result = await xragApi.saveAnswer(answerPayload);
      if (result?.answer) {
        setSavedAnswers((previous) => {
          const exists = previous.some((item) => item.id === result.answer.id);
          if (exists) {
            return previous;
          }

          return [result.answer, ...previous].slice(0, 100);
        });
      }

      return Boolean(result?.saved);
    } catch {
      return false;
    }
  };

  const handleDeleteAnswer = async (answerId) => {
    try {
      await xragApi.deleteAnswer(answerId);
      setSavedAnswers((prev) => prev.filter((a) => a.id !== answerId));
    } catch {
      // ignore
    }
  };

  const renderTabContent = () => {
    // CanvasTab is kept mounted across tab switches so the user's in-progress
    // flow (nodes, edges, drafts, run state) is preserved when navigating away.
    // We use visibility/position trickery (NOT display:none) so React Flow keeps
    // its measured dimensions — otherwise the minimap and viewport reset on return.
    const canvasInactive = activeTab !== 'canvas';
    const canvasPane = (
      <div
        key="canvas-pane"
        className="absolute inset-0"
        style={
          canvasInactive
            ? { visibility: 'hidden', pointerEvents: 'none', zIndex: 0 }
            : { zIndex: 1 }
        }
        aria-hidden={canvasInactive}
      >
        <CanvasTab />
      </div>
    );
    const overlayPane = (children) => (
      <div className="relative z-10 h-full w-full bg-slate-50">{children}</div>
    );

    if (activeTab === 'chat') {
      return (
        <>
          {canvasPane}
          {overlayPane(
            <ChatTab
              messages={messages}
              isTyping={isTyping}
              chatEndRef={chatEndRef}
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSendMessage={handleSendMessage}
              onSaveAnswer={handleSaveAnswer}
            />
          )}
        </>
      );
    }

    if (activeTab === 'documents') {
      return (
        <>
          {canvasPane}
          {overlayPane(<DocumentsTab documents={documents} />)}
        </>
      );
    }

    if (activeTab === 'canvas') {
      return canvasPane;
    }

    if (activeTab === 'shared-space') {
      return (
        <>
          {canvasPane}
          {overlayPane(<SharedSpaceTab />)}
        </>
      );
    }

    if (activeTab === 'audit') {
      return (
        <>
          {canvasPane}
          {overlayPane(<AuditTab />)}
        </>
      );
    }

    if (activeTab === 'metrics') {
      return (
        <>
          {canvasPane}
          {overlayPane(<MetricsTab />)}
        </>
      );
    }

    if (activeTab === 'health') {
      return (
        <>
          {canvasPane}
          {overlayPane(<HealthTab />)}
        </>
      );
    }

    if (activeTab === 'settings') {
      return (
        <>
          {canvasPane}
          {overlayPane(
            <SettingsTab
              selectedDB={selectedDB}
              onSelectDB={setSelectedDB}
              aiConfig={aiConfig}
              onAiConfigChange={setAiConfig}
              retrievalConfig={retrievalConfig}
              onRetrievalConfigChange={setRetrievalConfig}
            />
          )}
        </>
      );
    }

    return canvasPane;
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {isMainNavOpen && <button type="button" aria-label="Close main menu" onClick={() => setIsMainNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-400 shadow-2xl transition-transform duration-300 ease-out md:static md:z-auto md:shadow-xl md:transition-[width] ${
          isMainNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isMainNavCollapsed ? 'md:w-[76px]' : 'md:w-64'}`}
      >
        <div className="relative flex h-full flex-col overflow-hidden">
          <button
            type="button"
            onClick={() => setIsMainNavOpen(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 md:hidden"
            aria-label="Close main menu"
          >
            <X size={16} />
          </button>

          <div className={`p-4 md:p-6 ${isMainNavCollapsed ? 'md:px-2' : ''}`}>
            <div className={`mb-4 flex items-center ${isMainNavCollapsed ? 'justify-center' : 'justify-start'} md:mb-4`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-900/30">
                  <img src="/logo.png" alt="XRAG logo" className="h-10 w-10 object-contain" />
                </div>
                <div className={`${isMainNavCollapsed ? 'hidden md:hidden' : 'block'}`}>
                  <span className="block text-xl font-black leading-none tracking-tighter">
                    <span className="text-white" style={{ textShadow: '1px 1px 0 #4f46e5, 2px 2px 0 #4338ca, 3px 3px 0 #3730a3' }}>Au;Relia</span>
                  </span>
                  <span className="mt-1 block text-[9px] font-black uppercase tracking-widest text-indigo-300">Aurelia Platform</span>
                </div>
              </div>
            </div>

            <div className={`mb-6 hidden md:flex items-center ${isMainNavCollapsed ? 'justify-center' : 'justify-between'}`}>
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => setIsMainNavCollapsed((previous) => !previous)}
                  aria-label={isMainNavCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-all duration-200 hover:bg-slate-900 hover:text-indigo-400"
                >
                  <Menu size={18} />
                </button>
                <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap">
                  {isMainNavCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                </span>
              </div>

              {!isMainNavCollapsed && (
                <div className="group relative">
                  <button
                    type="button"
                    aria-label="Search menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-all hover:bg-slate-900 hover:text-indigo-400"
                  >
                    <Search size={17} />
                  </button>
                  <span className="pointer-events-none absolute right-0 top-full mt-2 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap">
                    Search menu
                  </span>
                </div>
              )}
            </div>

            <div className={`space-y-2 ${isMainNavCollapsed ? 'flex flex-col items-center' : ''}`}>
              <NavItem icon={<MessageSquare size={18} />} label="XRAG Assistant" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<FileText size={18} />} label="Knowledge Base" active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Workflow size={18} />} label="Canvas" active={activeTab === 'canvas'} onClick={() => setActiveTab('canvas')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Globe size={18} />} label="Shared Space" active={activeTab === 'shared-space'} onClick={() => setActiveTab('shared-space')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<ClipboardCheck size={18} />} label="Flow Arena" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<BarChart3 size={18} />} label="Metrics" active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Activity size={18} />} label="Model Health" active={activeTab === 'health'} onClick={() => setActiveTab('health')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Settings size={18} />} label="System Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} collapsed={isMainNavCollapsed} />
            </div>
          </div>

          <div className={`mt-auto p-3 md:p-6 ${isMainNavCollapsed ? 'hidden md:hidden' : ''}`}>
            <div className="mb-6 hidden rounded-2xl border border-slate-800/50 bg-slate-900/50 p-4 md:block">
              <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
                <span>Cost Limit</span>
                <span className="text-white">72%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-[72%] bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 overflow-hidden border-t border-slate-800 pt-6 md:justify-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 font-black text-sm text-indigo-400">AD</div>
              <div className="overflow-hidden md:block">
                <p className="truncate text-xs font-black text-white">Admin_Dávid</p>
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-600">XRAG Architect</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setIsMainNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-indigo-600 md:hidden"
              aria-label="Open main menu"
            >
              <Menu size={18} />
            </button>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <h1 className="truncate text-sm font-black uppercase tracking-[0.2em] text-slate-800">{TAB_TITLES[activeTab]}</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1.5 lg:flex">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Engine:</span>
              <span className="text-xs font-black uppercase italic tracking-tight text-indigo-600">XRAG-GPT-4o</span>
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 shadow-sm transition-all hover:bg-slate-50 hover:text-indigo-600">
              <Info size={18} />
            </button>
          </div>
        </header>

        <section className="relative flex-1 overflow-hidden">{renderTabContent()}</section>
      </main>
    </div>
  );
};

export default App;
