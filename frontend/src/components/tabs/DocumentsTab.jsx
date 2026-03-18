import { AlertTriangle, ArrowUpRight, Download, FileSearch, FileText, Filter, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeActivity, SafeDatabase } from '../../data/constants';
import ChunkInspector from '../knowledge/ChunkInspector';
import DocumentComparisonView from '../knowledge/DocumentComparisonView';
import ImpactAnalysisGraph from '../knowledge/ImpactAnalysisGraph';
import PopularDocsRanking from '../knowledge/PopularDocsRanking';
import ProcessingSimulationBar from '../knowledge/ProcessingSimulationBar';
import VectorSpaceCloud from '../VectorSpaceCloud';

const DocumentsTab = ({ documents }) => {
  const [isProcessingFinished, setIsProcessingFinished] = useState(false);
  const [isWidgetVisible, setIsWidgetVisible] = useState(true);
  const [processWidgetKey, setProcessWidgetKey] = useState(0);
  const [isSunsetViewEnabled, setIsSunsetViewEnabled] = useState(true);
  const indexedDocuments = useMemo(() => documents.filter((document) => document.status === 'Indexed'), [documents]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(indexedDocuments[0]?.id ?? null);
  const hideTimerRef = useRef(null);
  const showTimerRef = useRef(null);

  useEffect(() => {
    if (!indexedDocuments.length) {
      setSelectedDocumentId(null);
      return;
    }

    const selectedStillExists = indexedDocuments.some((document) => document.id === selectedDocumentId);
    if (!selectedStillExists) {
      setSelectedDocumentId(indexedDocuments[0].id);
    }
  }, [indexedDocuments, selectedDocumentId]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
    };
  }, []);

  const handleFinishCycle = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
    }

    hideTimerRef.current = setTimeout(() => {
      setIsWidgetVisible(false);
    }, 1200);

    showTimerRef.current = setTimeout(() => {
      setProcessWidgetKey((previousKey) => previousKey + 1);
      setIsProcessingFinished(false);
      setIsWidgetVisible(true);
    }, 3600);
  };

  const selectedDocument = indexedDocuments.find((document) => document.id === selectedDocumentId) || null;

  const parseDocumentDate = (dateLabel) => {
    if (!dateLabel) {
      return null;
    }

    const normalized = dateLabel.replace(/\.$/, '');
    const [yearText, monthText, dayText] = normalized.split('.');
    if (!yearText || !monthText || !dayText) {
      return null;
    }

    const parsedDate = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  };

  const isOlderThanTwoYears = (dateLabel) => {
    const lastUpdated = parseDocumentDate(dateLabel);
    if (!lastUpdated) {
      return false;
    }

    const thresholdDate = new Date();
    thresholdDate.setFullYear(thresholdDate.getFullYear() - 2);
    return lastUpdated < thresholdDate;
  };

  const getSunsetFadeClass = (document) => {
    if (!isSunsetViewEnabled || !isOlderThanTwoYears(document.date)) {
      return '';
    }

    const variationSeed = (document.id + document.name.length) % 3;
    if (variationSeed === 0) {
      return '';
    }

    return 'opacity-35 saturate-50';
  };

  const getConflictRisk = (document) => {
    if (document.name.includes('BCP_Plan_2023') || document.name.includes('BCP_Plan_2024')) {
      return 'High';
    }

    if (document.name.includes('Infra_Security') || document.name.includes('Policy_Manual')) {
      return 'Medium';
    }

    return null;
  };

  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full space-y-8 bg-slate-50">
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Knowledge Base Ecosystem</h2>
          <p className="text-sm text-slate-500 font-medium">Document management and vectorization</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
          <Plus size={16} /> Upload New Document
        </button>
      </header>

      <div
        className={`space-y-3 transition-all duration-700 ${
          isWidgetVisible ? 'opacity-100 translate-y-0 max-h-[220px]' : 'opacity-0 -translate-y-2 max-h-0 pointer-events-none overflow-hidden'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-500 ${
              isProcessingFinished
                ? 'bg-emerald-500 border-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.65)]'
                : 'bg-violet-500 border-violet-400 animate-pulse shadow-[0_0_10px_rgba(139,92,246,0.75)]'
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={`w-2.5 h-2.5 text-white transition-all duration-500 ${isProcessingFinished ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
            >
              <path d="M5 10.5L8.3 13.8L15 7.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={`text-[10px] font-black uppercase tracking-widest transition-colors duration-500 ${isProcessingFinished ? 'text-emerald-700' : 'text-violet-700'}`}>
            {isProcessingFinished ? 'Feldolgozás kész' : 'Aktív feldolgozás'}
          </span>
        </div>
        <ProcessingSimulationBar
          key={processWidgetKey}
          onStatusChange={setIsProcessingFinished}
          onFinishCycle={handleFinishCycle}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-600">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total files</p>
            <p className="text-2xl font-black text-slate-800">{documents.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600">
            <SafeDatabase size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vector chunks</p>
            <p className="text-2xl font-black text-slate-800">14,202</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 rounded-2xl bg-amber-50 text-amber-600">
            <SafeActivity size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Indexing performance</p>
            <p className="text-2xl font-black text-slate-800">98.4%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start xl:items-stretch">
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full xl:h-[580px] flex flex-col">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center bg-white">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search files..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsSunsetViewEnabled((previous) => !previous)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-colors ${
                isSunsetViewEnabled
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle size={12} /> Sunset View {isSunsetViewEnabled ? 'ON' : 'OFF'}
            </button>
            <div className="hidden md:flex items-center mr-2 px-3 py-1 rounded-full bg-indigo-50 text-[10px] font-black uppercase tracking-wider text-indigo-700 border border-indigo-100">
              Click indexed document to inspect chunks
            </div>
            <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg border border-slate-100">
              <Filter size={16} />
            </button>
            <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg border border-slate-100">
              <Download size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto flex-1 min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name / Type</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Last updated</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Size</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Chunks</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {documents.map((document) => {
                const isSunsetCandidate = isOlderThanTwoYears(document.date);
                const sunsetFadeClass = getSunsetFadeClass(document);

                return (
                  <tr
                    key={document.id}
                    onClick={() => {
                      if (document.status === 'Indexed') {
                        setSelectedDocumentId(document.id);
                      }
                    }}
                    className={`group transition-all ${
                      document.status === 'Indexed' ? 'cursor-pointer hover:bg-indigo-50/40' : 'hover:bg-slate-50/50'
                    } ${selectedDocumentId === document.id ? 'bg-indigo-50/60' : ''} ${sunsetFadeClass}`}
                  >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${document.status === 'Error' ? 'bg-rose-50 text-rose-500' : 'bg-slate-100 text-slate-500'}`}>
                        <FileSearch size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-slate-800 tracking-tight">{document.name}</p>
                          {getConflictRisk(document) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-[9px] font-black uppercase tracking-wider text-amber-700">
                              <AlertTriangle size={10} /> Conflict Risk
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{document.type}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">{document.date || '-'}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-600">{document.size}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {document.chunks}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          document.status === 'Indexed'
                            ? 'bg-emerald-500'
                            : document.status === 'Processing'
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-rose-500'
                        }`}
                      ></div>
                      <span className="text-[10px] font-black uppercase text-slate-500">{document.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (document.status === 'Indexed') {
                            setSelectedDocumentId(document.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600"
                      >
                        <ArrowUpRight size={16} />
                      </button>
                      <button type="button" onClick={(event) => event.stopPropagation()} className="p-2 text-slate-400 hover:text-rose-600">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>

        <div className="xl:col-span-4 w-full xl:h-[580px] grid grid-rows-[auto_1fr] gap-6 min-h-0">
          <VectorSpaceCloud />
          <PopularDocsRanking documents={documents} className="h-full" />
        </div>
      </div>

      <ImpactAnalysisGraph documents={documents} />

      <DocumentComparisonView documents={documents} />

      {selectedDocument && <ChunkInspector document={selectedDocument} />}
    </div>
  );
};

export default DocumentsTab;
