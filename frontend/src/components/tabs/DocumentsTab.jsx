import { ArrowLeft, BookMarked, Database, GitCompareArrows, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import DocumentComparisonView from '../knowledge/DocumentComparisonView';
import ImageLibraryPanel from '../knowledge/ImageLibraryPanel';
import KnowledgeBasePanel from '../knowledge/KnowledgeBasePanel';
import PopularDocsRanking from '../knowledge/PopularDocsRanking';
import SavedPromptsPanel from '../knowledge/SavedPromptsPanel';
import VectorSpaceCloud from '../VectorSpaceCloud';

const DocumentsTab = () => {
  const [activeSection, setActiveSection] = useState('documents');
  const [vectorRefreshKey, setVectorRefreshKey] = useState(0);
  const [showComparatorPage, setShowComparatorPage] = useState(false);

  return (
    <div className="xrag-kb-theme flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">

      {/* ── Section tab bar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 md:px-8 flex items-center gap-0 pt-0">
        <button
          type="button"
          onClick={() => setActiveSection('documents')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
            activeSection === 'documents'
              ? 'text-amber-300 border-amber-500'
              : 'text-slate-400 border-transparent hover:text-amber-300'
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
              ? 'text-amber-300 border-amber-500'
              : 'text-slate-400 border-transparent hover:text-amber-300'
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
              ? 'text-amber-300 border-amber-500'
              : 'text-slate-400 border-transparent hover:text-amber-300'
          }`}
        >
          <BookMarked size={13} />
          Saved AI Prompts
        </button>
      </div>

      {/* ── Section 1: Uploaded Documents ───────────────────────────── */}
      {activeSection === 'documents' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {!showComparatorPage ? (
            <div className="space-y-8">
              <KnowledgeBasePanel onAfterClassify={() => setVectorRefreshKey((k) => k + 1)} />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <VectorSpaceCloud refreshKey={vectorRefreshKey} />
                <PopularDocsRanking />
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/40 overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => setShowComparatorPage(true)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 md:px-8 md:py-6 text-left transition-colors bg-slate-950 hover:bg-slate-900 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
                      <GitCompareArrows size={20} className="text-amber-300" />
                    </div>
                    <div>
                      <p className="text-base font-black tracking-tight text-amber-300">Document Comparator</p>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                        Volume · Density · Chunking · Complexity · Temporal · Taxonomy
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wide text-amber-300">Open</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/40 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-6 py-4 md:px-8">
                <button
                  type="button"
                  onClick={() => setShowComparatorPage(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-300 hover:bg-amber-500/20"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <p className="text-xs font-black uppercase tracking-wider text-amber-300">Document Comparator</p>
              </div>
              <DocumentComparisonView />
            </div>
          )}
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
