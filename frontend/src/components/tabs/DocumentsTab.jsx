import { BookMarked, ChevronDown, ChevronRight, Database, GitCompareArrows, Image as ImageIcon, Plus } from 'lucide-react';
import { useState } from 'react';
import DocumentComparisonView from '../knowledge/DocumentComparisonView';
import ImageLibraryPanel from '../knowledge/ImageLibraryPanel';
import KnowledgeBasePanel from '../knowledge/KnowledgeBasePanel';
import PopularDocsRanking from '../knowledge/PopularDocsRanking';
import SavedPromptsPanel from '../knowledge/SavedPromptsPanel';
import VectorSpaceCloud from '../VectorSpaceCloud';

const DocumentsTab = ({ documents }) => {
  const [activeSection, setActiveSection] = useState('documents');
  const [vectorRefreshKey, setVectorRefreshKey] = useState(0);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">

      {/* ── Section tab bar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-8 flex items-center gap-0 pt-0">
        <button
          type="button"
          onClick={() => setActiveSection('documents')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
            activeSection === 'documents'
              ? 'text-indigo-700 border-indigo-500'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <Database size={13} />
          Uploaded Documents
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('images')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
            activeSection === 'images'
              ? 'text-sky-700 border-sky-500'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <ImageIcon size={13} />
          Image Library
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('prompts')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
            activeSection === 'prompts'
              ? 'text-violet-700 border-violet-500'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <BookMarked size={13} />
          Saved AI Prompts
        </button>
        <div className="ml-auto pb-1">
          {activeSection === 'documents' && (
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
              <Plus size={14} /> Upload New Document
            </button>
          )}
          {activeSection === 'images' && (
            <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-black shadow-md shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95">
              <Plus size={14} /> Upload Images
            </button>
          )}
        </div>
      </div>

      {/* ── Section 1: Uploaded Documents ───────────────────────────── */}
      {activeSection === 'documents' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          <KnowledgeBasePanel onAfterClassify={() => setVectorRefreshKey((k) => k + 1)} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <VectorSpaceCloud refreshKey={vectorRefreshKey} />
            <PopularDocsRanking />
          </div>

          {(() => {
            const canCompare = documents.length >= 2;
            return (
              <div className={`rounded-3xl border bg-white shadow-sm overflow-hidden transition-colors ${
                canCompare ? 'border-slate-200' : 'border-slate-200/70 opacity-80'
              }`}>
                <button
                  type="button"
                  disabled={!canCompare}
                  onClick={() => canCompare && setIsCompareOpen((v) => !v)}
                  className={`w-full flex items-center justify-between gap-4 px-6 py-5 md:px-8 md:py-6 text-left transition-colors ${
                    canCompare
                      ? 'bg-gradient-to-r from-blue-50/80 to-violet-50/70 hover:from-blue-100/60 hover:to-violet-100/60 cursor-pointer'
                      : 'bg-gradient-to-r from-slate-50 to-slate-50/60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      canCompare ? 'bg-blue-100' : 'bg-slate-100'
                    }`}>
                      <GitCompareArrows size={20} className={canCompare ? 'text-blue-500' : 'text-slate-400'} />
                    </div>
                    <div>
                      <p className="text-base font-black tracking-tight text-slate-800">Document Comparator</p>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">
                        Volume · Density · Chunking · Complexity · Temporal · Taxonomy
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {!canCompare && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-700">
                        Upload at least 2 documents to compare
                      </span>
                    )}
                    {canCompare && (
                      isCompareOpen
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    )}
                  </div>
                </button>
                {isCompareOpen && canCompare && (
                  <div className="border-t border-slate-100">
                    <DocumentComparisonView />
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* ── Section 2: Image Library ──────────────────────────────── */}
      {activeSection === 'images' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <ImageLibraryPanel />
        </div>
      )}

      {/* ── Section 3: Saved AI Prompts ──────────────────────────────── */}
      {activeSection === 'prompts' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <SavedPromptsPanel />
        </div>
      )}
    </div>
  );
};

export default DocumentsTab;
