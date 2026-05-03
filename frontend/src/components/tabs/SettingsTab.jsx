import { CheckCircle2, RefreshCw } from 'lucide-react';
import { SafeDatabase, VECTOR_PROVIDERS } from '../../data/constants';
import DataStrategyPanel from '../settings/DataStrategyPanel';

const SettingsTab = ({ selectedDB, onSelectDB, aiConfig, onAiConfigChange, retrievalConfig, onRetrievalConfigChange }) => {
  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full space-y-8 bg-slate-50">
      <header>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">XRAG Infrastructure</h2>
        <p className="text-sm text-slate-500 font-medium">Technical configurations and provider management</p>
      </header>

      <section className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
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
                    ? 'border-indigo-600 bg-indigo-50 shadow-md scale-[1.02]'
                    : 'border-slate-100 bg-white hover:border-slate-300 shadow-sm'
                }`}
              >
                <ProviderIcon size={20} className={selectedDB.id === provider.id ? 'text-indigo-600' : 'text-slate-400'} />
                <div>
                  <p className="text-xs font-black text-slate-800">{provider.name}</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-tighter">{provider.type}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider Endpoint</label>
                <input
                  type="text"
                  placeholder={`https://${selectedDB.id}-cluster-xrag.api`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API Key</label>
                <input
                  type="password"
                  defaultValue="ENC:SECRET_XRAG_PRO"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-between items-center pt-6 border-t border-slate-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" />
                <span className="text-xs font-bold text-slate-600">Configuration is valid</span>
              </div>
              <button className="flex items-center gap-2 px-8 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95">
                <RefreshCw size={14} /> Refresh Settings
              </button>
            </div>
          </div>
        </div>
      </section>

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
