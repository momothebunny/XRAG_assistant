import { Activity, ChevronUp, ClipboardList, FileText, Globe, Menu, MessageSquare, Search, Settings, Workflow, X, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import NavItem from './components/NavItem';
import CanvasTab from './components/tabs/CanvasTab';
import ChatTab from './components/tabs/ChatTab';
import DocumentsTab from './components/tabs/DocumentsTab';
import AuditTab from './components/tabs/AuditTab';
import HealthTab from './components/tabs/HealthTab';
import SettingsTab from './components/tabs/SettingsTab';
import SharedSpaceTab from './components/tabs/SharedSpaceTab';
import AuthScreen from './components/auth/AuthScreen';
import { VECTOR_PROVIDERS } from './data/constants';
import { useChat } from './hooks/useChat';
import { xragApi, setAuthToken, getAuthToken } from './services/xragApi';

const TAB_TITLES = {
  chat: 'Chat',
  documents: 'Knowledge Ecosystem',
  canvas: 'No-Code RAG Canvas',
  audit: 'RAG Audit Arena',
  'shared-space': 'Shared Space',
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
  environmentProfile: 'staging',
  promptVersions: [],
  selectedPromptVersionId: '',
};

const DEFAULT_RETRIEVAL_CONFIG = {
  hybridAlpha: 0.5,
  topK: 5,
  rerankerEnabled: true,
  rerankerModel: 'cohere-rerank-v3',
  costGuardrails: {
    dailyBudgetUsd: 25,
    monthlyBudgetUsd: 400,
    perRequestTokenCap: 8000,
    hardStopOnLimit: true,
  },
  retryPolicy: {
    timeoutMs: 12000,
    maxRetries: 2,
    backoffStrategy: 'exponential',
    requestsPerMinute: 60,
  },
  observability: {
    logLevel: 'info',
    piiMasking: true,
    retentionDays: 30,
    traceSamplingPercent: 25,
  },
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
  // ── Authentication state ────────────────────────────────────────────
  // `currentUser` is the logged-in user object returned by the backend
  // (id / email / display_name / role / …). When null we render the
  // <AuthScreen> instead of the main UI.
  // `authChecked` flips to true once the initial `/api/auth/me` probe
  // completes, so we don't flash the AuthScreen for a returning user
  // whose token is still valid.
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    xragApi
      .authMe()
      .then((user) => setCurrentUser(user))
      .catch(() => setAuthToken(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
  };

  const [activeTab, setActiveTab] = useState('chat');
  const [selectedDB, setSelectedDB] = useState(VECTOR_PROVIDERS[0]);
  const [isMainNavCollapsed, setIsMainNavCollapsed] = useState(false);
  // Bumps every time the brand mark swaps so the glitch keyframes
  // restart cleanly (steps() animations need a fresh element instance).
  const [brandSwapKey, setBrandSwapKey] = useState(0);
  useEffect(() => {
    setBrandSwapKey((k) => k + 1);
  }, [isMainNavCollapsed]);
  const [isMainNavOpen, setIsMainNavOpen] = useState(false);
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
    const overlayPane = (children, themeClassName = 'bg-slate-50') => (
      <div className={`relative z-10 h-full w-full ${themeClassName}`}>{children}</div>
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
              onSendMessage={(msg, flowId) => handleSendMessage(msg, flowId)}
              onSaveAnswer={handleSaveAnswer}
            />,
            'xrag-chat-theme bg-slate-950'
          )}
        </>
      );
    }

    if (activeTab === 'documents') {
      return (
        <>
          {canvasPane}
          {overlayPane(<DocumentsTab />, 'xrag-kb-theme bg-slate-950')}
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
          {overlayPane(<SharedSpaceTab />, 'xrag-shared-theme bg-slate-950')}
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

    if (activeTab === 'health') {
      return (
        <>
          {canvasPane}
          {overlayPane(<HealthTab />, 'bg-slate-50')}
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
            />,
            'xrag-settings-theme bg-slate-950'
          )}
        </>
      );
    }

    return canvasPane;
  };

  // Auth gate — show the login / register screen until the user is signed in.
  // While the initial /me probe is in flight we render a tiny loader on a
  // matching warm background so a returning user doesn't see a blue flash
  // before being recognised.
  if (!authChecked) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-amber-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
      </div>
    );
  }
  if (!currentUser) {
    return <AuthScreen onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  // Initials shown in the avatar tile at the bottom of the sidebar.
  const userInitials = (currentUser.display_name || currentUser.email || 'U')
    .split(/\s+/)
    .map((piece) => piece.charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('') || 'U';
  const userRoleLabel = currentUser.role === 'admin' ? 'Aurelia Architect' : 'Aurelia Member';

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {isMainNavOpen && <button type="button" aria-label="Close main menu" onClick={() => setIsMainNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-950 text-slate-400 shadow-2xl transition-transform duration-300 ease-out md:static md:z-auto md:shadow-xl md:transition-[width] ${
          isMainNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isMainNavCollapsed ? 'md:w-[76px]' : 'md:w-60'}`}
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

          <div className={`px-4 pt-2 pb-4 md:px-6 md:pt-2 md:pb-6 ${isMainNavCollapsed ? 'md:px-2' : ''}`}>
            <div className={`mb-2 flex items-center md:mb-2 ${isMainNavCollapsed ? 'justify-center' : 'justify-center'}`}>
              {/* Brand swap: clean horizontal clip-path reveal + a single
                  indigo light-sweep across the new mark. No blur, no
                  glitch — just a crisp digital reveal. */}
              <div
                className={`relative flex items-center transition-[width,height] duration-300 ease-out ${isMainNavCollapsed ? 'justify-center' : 'justify-center'}`}
                style={{
                  width: isMainNavCollapsed ? '3rem' : '100%',
                  height: isMainNavCollapsed ? '3rem' : 'auto',
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_50%,rgba(251,191,36,0.45),transparent_70%)] blur-xl"
                />

                {isMainNavCollapsed ? (
                  <div
                    key={`brand-collapsed-${brandSwapKey}`}
                    className="xrag-brand-reveal relative flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-50 shadow-lg shadow-yellow-200/40"
                  >
                    <img src="/logo.png" alt="XRAG logo" className="h-10 w-10 object-contain" />
                  </div>
                ) : (
                  <div
                    key={`brand-expanded-${brandSwapKey}`}
                    className="xrag-brand-reveal relative flex items-center justify-center"
                  >
                    <img
                      src="/aurelia.png"
                      alt="Aurelia"
                      className="h-20 w-auto object-contain drop-shadow-[0_3px_14px_rgba(245,158,11,0.65)]"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className={`mb-6 hidden md:flex items-center ${isMainNavCollapsed ? 'justify-center' : 'justify-between'}`}>
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => setIsMainNavCollapsed((previous) => !previous)}
                  aria-label={isMainNavCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-all duration-200 hover:text-amber-400"
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
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-all hover:text-amber-400"
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
              <NavItem icon={<MessageSquare size={18} />} label="Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<FileText size={18} />} label="Knowledge Base" active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Workflow size={18} />} label="Canvas" active={activeTab === 'canvas'} onClick={() => setActiveTab('canvas')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<ClipboardList size={18} />} label="Audit Arena" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Globe size={18} />} label="Shared Space" active={activeTab === 'shared-space'} onClick={() => setActiveTab('shared-space')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Activity size={18} />} label="Model Health" active={activeTab === 'health'} onClick={() => setActiveTab('health')} collapsed={isMainNavCollapsed} />
              <NavItem icon={<Settings size={18} />} label="System Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} collapsed={isMainNavCollapsed} />
            </div>
          </div>

          <div className={`mt-auto p-3 md:p-6 ${isMainNavCollapsed ? 'hidden md:hidden' : ''}`}>
            <div className="relative flex items-center gap-3 border-t border-slate-800 pt-6">
              <UserMenu
                currentUser={currentUser}
                userInitials={userInitials}
                userRoleLabel={userRoleLabel}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setIsMainNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-300 shadow-sm transition-all hover:bg-slate-900 hover:text-amber-300 md:hidden"
              aria-label="Open main menu"
            >
              <Menu size={18} />
            </button>
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.45)]" />
            <h1 className="truncate text-sm font-black uppercase tracking-[0.2em] text-amber-200">{TAB_TITLES[activeTab]}</h1>
          </div>
        </header>

        <section className="relative flex-1 overflow-hidden">{renderTabContent()}</section>
      </main>
    </div>
  );
};

const UserMenu = ({ currentUser, userInitials, userRoleLabel, onLogout }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left transition ${
          open
            ? 'border-amber-400/60 bg-amber-500/10'
            : 'border-transparent hover:border-slate-700 hover:bg-slate-900/60'
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-400 to-orange-500 font-black text-sm text-white shadow-md shadow-amber-900/30">
          {userInitials}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-xs font-black text-white" title={currentUser.email}>
            {currentUser.display_name}
          </p>
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
            {userRoleLabel}
          </p>
        </div>
        <ChevronUp
          size={14}
          className={`shrink-0 text-slate-400 transition-transform ${open ? '' : 'rotate-180'}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60"
        >
          <div className="border-b border-slate-800 px-3 py-2.5">
            <p className="truncate text-[11px] font-bold text-white">
              {currentUser.display_name}
            </p>
            <p className="truncate text-[10px] text-slate-400" title={currentUser.email}>
              {currentUser.email}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] font-bold text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
