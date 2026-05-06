import { CheckCircle2, RefreshCw } from 'lucide-react';
import { SafeDatabase, VECTOR_PROVIDERS } from '../../data/constants';
import DataStrategyPanel from '../settings/DataStrategyPanel';
import ApiKeyImportPanel from '../settings/ApiKeyImportPanel';

const SettingsTab = ({ selectedDB, onSelectDB, aiConfig, onAiConfigChange, retrievalConfig, onRetrievalConfigChange }) => {
  return (
    <div data-xrag-tab="settings" className="xrag-settings-theme h-full space-y-8 overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-8">
      <header>
        <h2 className="text-2xl font-black tracking-tight text-amber-200">XRAG Infrastructure</h2>
        <p className="text-sm font-medium text-slate-300">Technical configurations and provider management</p>
      </header>

      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-300">
          <SafeDatabase size={16} /> Active Vector Store
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {VECTOR_PROVIDERS.map((provider) => {
            const ProviderIcon = provider.icon;

            return (
              <button
                key={provider.id}
                onClick={() => onSelectDB(provider)}
                className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 ${
                  selectedDB.id === provider.id
                    ? 'scale-[1.02] border-amber-400 bg-slate-900 shadow-md'
                    : 'border-slate-700 bg-slate-900 hover:border-amber-500/40 shadow-sm'
                }`}
              >
                <ProviderIcon size={20} className={selectedDB.id === provider.id ? 'text-amber-300' : 'text-slate-400'} />
                <div>
                  <p className="text-xs font-black text-slate-100">{provider.name}</p>
                  <p className="text-[9px] uppercase tracking-tighter text-slate-400">{provider.type}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-sm">
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Provider Endpoint</label>
                <input
                  type="text"
                  placeholder={`https://${selectedDB.id}-cluster-xrag.api`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none transition-all focus:ring-2 focus:ring-amber-500/25"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">API Key</label>
                <input
                  type="password"
                  defaultValue="ENC:SECRET_XRAG_PRO"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none transition-all focus:ring-2 focus:ring-amber-500/25"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-amber-300" />
                <span className="text-xs font-bold text-slate-300">Configuration is valid</span>
              </div>
              <button className="flex items-center gap-2 rounded-xl border border-amber-400 bg-amber-500 px-8 py-2.5 text-xs font-black text-slate-950 shadow-lg transition-all hover:bg-amber-400 active:scale-95">
                <RefreshCw size={14} /> Refresh Settings
              </button>
            </div>
          </div>
        </div>
      </section>

      <ApiKeyImportPanel />

      <DataStrategyPanel
        aiConfig={aiConfig}
        onAiConfigChange={onAiConfigChange}
        retrievalConfig={retrievalConfig}
        onRetrievalConfigChange={onRetrievalConfigChange}
      />
    </div>
  );
};

export default SettingsTab;
