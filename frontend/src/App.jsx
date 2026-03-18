import { BarChart3, FileText, Info, MessageSquare, Settings, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import NavItem from './components/NavItem';
import ChatTab from './components/tabs/ChatTab';
import DocumentsTab from './components/tabs/DocumentsTab';
import MetricsTab from './components/tabs/MetricsTab';
import SettingsTab from './components/tabs/SettingsTab';
import { INITIAL_DOCS, VECTOR_PROVIDERS } from './data/constants';
import { useChat } from './hooks/useChat';

const TAB_TITLES = {
  chat: 'Intelligent Reasoning Interface',
  documents: 'Knowledge Ecosystem',
  metrics: 'Performance Deep Dive',
  settings: 'Infrastructure Config',
};

const AI_CONFIG_STORAGE_KEY = 'xrag-ai-config-v1';
const PROMPT_PRESET_STORAGE_KEY = 'xrag-prompt-presets-v1';
const SAVED_ANSWERS_STORAGE_KEY = 'xrag-saved-answers-v1';

const DEFAULT_AI_CONFIG = {
  model: 'GPT-4o',
  temperature: 0.7,
  systemPrompt:
    'You are a professional research assistant. Always cite your sources and clearly separate verified context from assumptions.',
  strictMode: true,
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
  const [documents] = useState(INITIAL_DOCS);
  const [aiConfig, setAiConfig] = useState(() => ({ ...DEFAULT_AI_CONFIG, ...readStoredJson(AI_CONFIG_STORAGE_KEY, {}) }));
  const [savedPromptPresets, setSavedPromptPresets] = useState(() => readStoredJson(PROMPT_PRESET_STORAGE_KEY, []));
  const [savedAnswers, setSavedAnswers] = useState(() => readStoredJson(SAVED_ANSWERS_STORAGE_KEY, []));

  const { messages, inputValue, isTyping, chatEndRef, setInputValue, handleSendMessage } = useChat(selectedDB.name, aiConfig);

  useEffect(() => {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem(PROMPT_PRESET_STORAGE_KEY, JSON.stringify(savedPromptPresets));
  }, [savedPromptPresets]);

  useEffect(() => {
    localStorage.setItem(SAVED_ANSWERS_STORAGE_KEY, JSON.stringify(savedAnswers));
  }, [savedAnswers]);

  const handleSavePromptPreset = (name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    const preset = {
      id: `preset-${Date.now()}`,
      name: trimmedName,
      createdAt: Date.now(),
      config: {
        ...aiConfig,
      },
    };

    setSavedPromptPresets((previousPresets) => [preset, ...previousPresets]);
    return preset;
  };

  const handleSaveAnswer = (answerPayload) => {
    if (!answerPayload?.content?.trim()) {
      return false;
    }

    const normalizedContent = answerPayload.content.trim();
    let wasAdded = false;

    setSavedAnswers((previousAnswers) => {
      const exists = previousAnswers.some((item) => item.content === normalizedContent);
      if (exists) {
        return previousAnswers;
      }

      wasAdded = true;
      const nextItem = {
        id: `answer-${Date.now()}`,
        content: normalizedContent,
        reasoning: answerPayload.reasoning || '',
        sources: answerPayload.sources || [],
        promptReference: answerPayload.promptReference || null,
        createdAt: Date.now(),
      };

      return [nextItem, ...previousAnswers].slice(0, 100);
    });

    return wasAdded;
  };

  const renderTabContent = () => {
    if (activeTab === 'chat') {
      return (
        <ChatTab
          messages={messages}
          isTyping={isTyping}
          chatEndRef={chatEndRef}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSendMessage={handleSendMessage}
          aiConfig={aiConfig}
          savedPromptPresets={savedPromptPresets}
          onSavePromptPreset={handleSavePromptPreset}
          savedAnswers={savedAnswers}
          onSaveAnswer={handleSaveAnswer}
        />
      );
    }

    if (activeTab === 'documents') {
      return <DocumentsTab documents={documents} />;
    }

    if (activeTab === 'metrics') {
      return <MetricsTab />;
    }

    if (activeTab === 'settings') {
      return <SettingsTab selectedDB={selectedDB} onSelectDB={setSelectedDB} aiConfig={aiConfig} onAiConfigChange={setAiConfig} />;
    }

    return null;
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <nav className="w-20 md:w-64 bg-slate-950 text-slate-400 flex flex-col shrink-0 border-r border-slate-800 shadow-xl">
        <div className="p-3 md:p-6">
          <div className="flex items-center justify-center md:justify-start gap-3 text-white mb-8 md:mb-12">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap size={22} className="fill-white" />
            </div>
            <div className="hidden md:block">
              <span className="text-xl font-black tracking-tighter block leading-none">NEXUS</span>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">XRAG Platform</span>
            </div>
          </div>

          <div className="space-y-2">
            <NavItem icon={<MessageSquare size={18} />} label="XRAG Assistant" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
            <NavItem
              icon={<FileText size={18} />}
              label="Knowledge Base"
              active={activeTab === 'documents'}
              onClick={() => setActiveTab('documents')}
            />
            <NavItem icon={<BarChart3 size={18} />} label="Audit Report" active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')} />
            <NavItem
              icon={<Settings size={18} />}
              label="System Settings"
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
            />
          </div>
        </div>

        <div className="mt-auto p-3 md:p-6">
          <div className="hidden md:block bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50 mb-6">
            <div className="flex items-center justify-between mb-2 text-[10px] font-black uppercase text-slate-500">
              <span>Cost Limit</span>
              <span className="text-white">72%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-[72%] shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
            </div>
          </div>
          <div className="flex items-center justify-center md:justify-start gap-3 border-t border-slate-800 pt-6 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center font-black text-sm text-indigo-400 border border-slate-700 shrink-0">AD</div>
            <div className="overflow-hidden hidden md:block">
              <p className="text-xs font-black text-white truncate">Admin_Dávid</p>
              <p className="text-[10px] font-bold text-slate-600 truncate uppercase tracking-widest">XRAG Architect</p>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
            <h1 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] truncate">{TAB_TITLES[activeTab]}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-200 hidden lg:flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Engine:</span>
              <span className="text-xs font-black text-indigo-600 uppercase italic tracking-tight">XRAG-GPT-4o</span>
            </div>
            <button className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all hover:bg-slate-50 shadow-sm">
              <Info size={18} />
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-hidden relative">{renderTabContent()}</section>
      </main>
    </div>
  );
};

export default App;
