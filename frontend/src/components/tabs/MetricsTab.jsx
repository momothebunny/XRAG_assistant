import { ArrowUpRight, DollarSign, FileText, ShieldCheck, Target, Zap } from 'lucide-react';
import { useState } from 'react';
import { SafeActivity } from '../../data/constants';
import HallucinationHeatmap from '../metrics/HallucinationHeatmap';

const MetricsTab = () => {
  const [isTrustCorrectionOpen, setIsTrustCorrectionOpen] = useState(false);
  const [trustCorrectionSource, setTrustCorrectionSource] = useState('');
  const [trustCorrectionReason, setTrustCorrectionReason] = useState('');
  const [trustCorrectionSubmitted, setTrustCorrectionSubmitted] = useState(false);

  const keyPerformanceIndicators = [
    { label: 'Response Accuracy', val: '98.2%', icon: Target, color: 'text-emerald-500', desc: 'Based on expert feedback' },
    { label: 'Search Latency', val: '185ms', icon: Zap, color: 'text-amber-500', desc: 'Average response time' },
    { label: 'Token Usage', val: '1.4k/req', icon: SafeActivity, color: 'text-indigo-500', desc: 'Optimized' },
    { label: 'AI Trust Index', val: '9.2/10', icon: ShieldCheck, color: 'text-blue-500', desc: 'Audited answers' },
  ];

  const sourceRelevanceData = [
    { name: 'BCP_Plan_2024.pdf', queries: 240, score: '0.94' },
    { name: 'Infra_Security_v2.docx', queries: 185, score: '0.88' },
    { name: 'FAQ_Internal.md', queries: 412, score: '0.96' },
  ];

  const usageSeries = [50, 65, 45, 80, 55, 90, 75, 60, 85, 45, 55, 75, 95, 40, 60];

  const submitTrustCorrection = () => {
    if (!trustCorrectionSource || !trustCorrectionReason.trim()) {
      return;
    }

    setTrustCorrectionSubmitted(true);
    setIsTrustCorrectionOpen(false);
  };

  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full space-y-8 bg-slate-50">
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">XRAG Intelligence Report</h2>
          <p className="text-sm text-slate-500 font-medium">Detailed audit and system health analysis</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50">
            <FileText size={14} /> Export Report
          </button>
          <select className="bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl outline-none border-none">
            <option>Last month summary</option>
            <option>Weekly report</option>
          </select>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {keyPerformanceIndicators.map((kpi, kpiIndex) => (
          <div
            key={kpiIndex}
            className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl bg-slate-50 ${kpi.color}`}>
                <kpi.icon size={22} />
              </div>
              <ArrowUpRight size={18} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </div>
            <div>
              <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{kpi.label}</h3>
              <p className="text-3xl font-black text-slate-800 mt-1">{kpi.val}</p>
              <p className="text-[10px] text-slate-400 mt-2 font-medium italic">{kpi.desc}</p>

              {kpi.label === 'AI Trust Index' && (
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsTrustCorrectionOpen((previous) => !previous)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors"
                  >
                    Correct it
                  </button>

                  {trustCorrectionSubmitted && !isTrustCorrectionOpen && (
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Correction saved for tuning</p>
                  )}

                  {isTrustCorrectionOpen && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Correct source</label>
                        <select
                          value={trustCorrectionSource}
                          onChange={(event) => setTrustCorrectionSource(event.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">Select source...</option>
                          {sourceRelevanceData.map((sourceDocument) => (
                            <option key={sourceDocument.name} value={sourceDocument.name}>
                              {sourceDocument.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Short reason</label>
                        <textarea
                          rows={2}
                          value={trustCorrectionReason}
                          onChange={(event) => setTrustCorrectionReason(event.target.value)}
                          placeholder="What was wrong in the source selection?"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={submitTrustCorrection}
                          disabled={!trustCorrectionSource || !trustCorrectionReason.trim()}
                          className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-600 text-[10px] font-black uppercase tracking-wider text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <HallucinationHeatmap />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm min-h-[400px]">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter mb-8">
              <DollarSign className="text-emerald-500" /> Resource Management Mirror
            </h3>
            <div className="h-64 w-full flex items-end gap-3 px-2">
              {usageSeries.map((usage, usageIndex) => (
                <div key={usageIndex} className="flex-1 group relative">
                  <div
                    className="w-full bg-indigo-600 rounded-t-lg transition-all group-hover:bg-indigo-400"
                    style={{ height: `${usage}%` }}
                  ></div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[8px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {usage}% usage
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly LLM Cost</p>
                <p className="text-xl font-black text-slate-800">$1,280.42</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">VectorDB Cost</p>
                <p className="text-xl font-black text-slate-800">$122.15</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter mb-6">
            <FileText className="text-indigo-500" /> Source Relevance Audit
          </h3>
          <div className="space-y-4 flex-1">
            {sourceRelevanceData.map((sourceDocument, sourceDocumentIndex) => (
              <div key={sourceDocumentIndex} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-black text-slate-800 truncate max-w-[150px]">{sourceDocument.name}</p>
                  <span className="text-[10px] font-black text-indigo-600 bg-white px-2 py-0.5 rounded-lg shadow-sm border border-indigo-50">
                    {sourceDocument.queries} q
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full transition-all" style={{ width: `${parseFloat(sourceDocument.score) * 100}%` }}></div>
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Relevance Score: {sourceDocument.score}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-indigo-600 rounded-2xl text-white">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">System Recommendation</p>
            <p className="text-[11px] font-bold leading-relaxed italic">
              The Training_Log.csv file shows low relevance. Updating the chunking strategy is recommended.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsTab;
