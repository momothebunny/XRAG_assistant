import { useMemo, useState } from 'react';
import { ArrowRightLeft, GitCompareArrows, Layers3, Sigma, Sparkles } from 'lucide-react';

const HASH_MOD = 997;

const DIFF_FOCUS_AREAS = [
  'Recovery Time Objective thresholds',
  'Incident escalation matrix',
  'Regulatory notification workflow',
  'Vendor dependency fallback paths',
  'Audit evidence retention policy',
  'Crisis communication protocol',
];

const SEMANTIC_SECTIONS = [
  'Remote access requirements',
  'Privileged account governance',
  'Incident response ownership',
  'Audit trail retention',
  'Third-party continuity controls',
  'Emergency approval workflow',
];

const hashText = (value) => {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % HASH_MOD;
  }
  return result;
};

const buildComparisonStats = (leftDocument, rightDocument) => {
  const pairSeed = hashText(`${leftDocument.id}-${rightDocument.id}-${leftDocument.name}-${rightDocument.name}`);
  const semanticDrift = 0.12 + (pairSeed % 46) / 100;
  const overlapScore = Math.max(0.28, 0.96 - semanticDrift * 0.8);
  const changedChunkRatio = 0.18 + ((pairSeed * 3) % 52) / 100;

  const sectionDiffs = SEMANTIC_SECTIONS.map((section, index) => {
    const sectionSeed = hashText(`${section}-${pairSeed}-${index}`);
    const cosineSimilarity = 0.54 + (sectionSeed % 42) / 100;
    const semanticShift = 1 - cosineSimilarity;

    return {
      section,
      cosineSimilarity,
      semanticShift,
    };
  }).sort((firstSection, secondSection) => secondSection.semanticShift - firstSection.semanticShift);

  const topSemanticShift = sectionDiffs[0];

  const generatedSemanticSummary =
    topSemanticShift.section === 'Remote access requirements'
      ? `A 2024-es frissítés szigorította a távoli elérés feltételeit a 2023-as verzióhoz képest. Kötelezővé vált a többfaktoros hitelesítés és az eszköz-megfelelőségi ellenőrzés.`
      : `${rightDocument.name} a(z) "${topSemanticShift.section}" területen szigorúbb működési kontrollokat vezet be, mint ${leftDocument.name}.`;

  const topDifferences = DIFF_FOCUS_AREAS.slice(0, 4).map((topic, index) => {
    const topicSeed = hashText(`${topic}-${pairSeed}-${index}`);
    return {
      topic,
      shift: 38 + (topicSeed % 57),
      confidence: 0.71 + (topicSeed % 24) / 100,
      summary:
        index % 2 === 0
          ? `${leftDocument.name} defines stricter controls, while ${rightDocument.name} introduces broader execution conditions.`
          : `${rightDocument.name} adds operational details that are less explicit in ${leftDocument.name}.`,
    };
  });

  return {
    semanticDrift,
    overlapScore,
    changedChunkRatio,
    sectionDiffs,
    topSemanticShift,
    generatedSemanticSummary,
    topDifferences,
  };
};

const DocumentComparisonView = ({ documents }) => {
  const comparableDocuments = useMemo(() => documents.filter((document) => document.status === 'Indexed'), [documents]);

  const [leftDocumentId, setLeftDocumentId] = useState(comparableDocuments[0]?.id ?? null);
  const [rightDocumentId, setRightDocumentId] = useState(comparableDocuments[1]?.id ?? comparableDocuments[0]?.id ?? null);

  const leftDocument = comparableDocuments.find((document) => document.id === leftDocumentId) || comparableDocuments[0] || null;
  const rightDocument =
    comparableDocuments.find((document) => document.id === rightDocumentId) ||
    comparableDocuments.find((document) => document.id !== leftDocument?.id) ||
    comparableDocuments[0] ||
    null;

  const comparison = useMemo(() => {
    if (!leftDocument || !rightDocument) {
      return null;
    }

    return buildComparisonStats(leftDocument, rightDocument);
  }, [leftDocument, rightDocument]);

  const applyBcpPreset = () => {
    const bcp2023 = comparableDocuments.find((document) => document.name.includes('BCP_Plan_2023'));
    const bcp2024 = comparableDocuments.find((document) => document.name.includes('BCP_Plan_2024'));

    if (!bcp2023 || !bcp2024) {
      return;
    }

    setLeftDocumentId(bcp2023.id);
    setRightDocumentId(bcp2024.id);
  };

  if (!leftDocument || !rightDocument || !comparison) {
    return null;
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full">
      <header className="px-5 py-4 md:px-6 md:py-5 border-b border-slate-100 bg-gradient-to-r from-violet-50/80 to-indigo-50/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">Dedicated Mode</p>
            <h3 className="text-sm md:text-base font-black tracking-tight text-slate-800">Document Comparison View</h3>
            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wide">Semantic/vector delta analysis between two knowledge sources</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-violet-200 text-[10px] font-black uppercase tracking-wider text-violet-700">
            <GitCompareArrows size={12} /> XRAG diff simulation
          </span>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={applyBcpPreset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-200 bg-violet-50 text-[10px] font-black uppercase tracking-wider text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <GitCompareArrows size={12} /> Compare BCP 2023 vs 2024
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Document A</label>
            <select
              value={leftDocument.id}
              onChange={(event) => setLeftDocumentId(Number(event.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-violet-500"
            >
              {comparableDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-violet-600 shrink-0 mb-1">
            <ArrowRightLeft size={16} />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Document B</label>
            <select
              value={rightDocument.id}
              onChange={(event) => setRightDocumentId(Number(event.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-violet-500"
            >
              {comparableDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Semantic drift</p>
            <p className="text-2xl font-black text-slate-800">{comparison.semanticDrift.toFixed(2)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">Cosine distance (avg)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Topic overlap</p>
            <p className="text-2xl font-black text-slate-800">{Math.round(comparison.overlapScore * 100)}%</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">Embedding neighborhood match</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Changed chunk ratio</p>
            <p className="text-2xl font-black text-slate-800">{Math.round(comparison.changedChunkRatio * 100)}%</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">Estimated semantic delta</p>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <p className="text-xs font-black uppercase tracking-wider text-violet-800">Change Management Simulation · Semantic Diff</p>
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-white border border-violet-200 rounded-full px-2 py-0.5">
              Cosine shift {(comparison.topSemanticShift.semanticShift * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-sm font-bold text-violet-900 leading-relaxed">{comparison.generatedSemanticSummary}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-violet-700/80">
            Highest drift area: {comparison.topSemanticShift.section} · similarity {comparison.topSemanticShift.cosineSimilarity.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-black uppercase tracking-wider text-slate-700">Semantic section monitor</p>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cosine similarity by policy area</span>
          </div>

          <div className="space-y-2.5">
            {comparison.sectionDiffs.map((sectionDiff) => (
              <div key={sectionDiff.section} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-black text-slate-800 tracking-tight">{sectionDiff.section}</p>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                    <span className="text-slate-500">sim {sectionDiff.cosineSimilarity.toFixed(2)}</span>
                    <span className="text-violet-700 bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5">
                      drift {(sectionDiff.semanticShift * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: `${Math.max(8, sectionDiff.cosineSimilarity * 100)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-black uppercase tracking-wider text-slate-700">Top vector differences</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-violet-600">
              <Sparkles size={12} /> Simulated insights
            </span>
          </div>

          <div className="space-y-3">
            {comparison.topDifferences.map((difference, index) => (
              <article key={`${difference.topic}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-black text-slate-800 tracking-tight">{difference.topic}</h4>
                  <span className="text-[10px] font-black uppercase tracking-wider text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full">
                    shift {difference.shift}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{difference.summary}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Layers3 size={12} className="text-slate-400" />
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${difference.shift}%` }}></div>
                  </div>
                  <span className="text-[10px] font-black text-slate-500">{Math.round(difference.confidence * 100)}% conf</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 flex items-start gap-2.5">
          <Sigma size={14} className="text-violet-600 mt-0.5" />
          <p className="text-[11px] font-bold text-violet-900 leading-relaxed">
            Recommended query prompt: “Compare policy changes between {leftDocument.name} and {rightDocument.name}, prioritize operational impact and compliance deltas.”
          </p>
        </div>
      </div>
    </section>
  );
};

export default DocumentComparisonView;