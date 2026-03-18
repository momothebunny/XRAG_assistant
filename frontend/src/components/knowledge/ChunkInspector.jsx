import { useEffect, useMemo, useState } from 'react';
import { Braces, FileText, Layers3, Sigma } from 'lucide-react';

const DOCUMENT_CORPUS = {
  PDF: [
    'Business continuity planning defines how critical services remain available during disruptive events.',
    'The recovery strategy prioritizes identity, communication, and customer-facing channels by impact tier.',
    'Each process owner must document fallback operations, dependencies, and verification criteria for restore.',
    'Audit checkpoints include tabletop simulations, incident postmortems, and quarterly control remediation.',
    'Retention requirements enforce immutable logging for all high-risk operational actions and approvals.',
    'Escalation matrices identify decision authority, severity thresholds, and regulator notification timelines.',
  ],
  DOCX: [
    'Security baseline hardening includes endpoint isolation, strict patch windows, and identity-based access policies.',
    'Service accounts require scoped permissions, managed key rotation, and monthly entitlement review.',
    'Ingress traffic must pass inspection gates that enforce malware scanning and data classification tags.',
    'Risk scoring combines exploitability, business criticality, and active threat intelligence indicators.',
    'Every policy exception needs owner approval, compensating controls, and expiration checkpoints.',
  ],
  CSV: [
    'Training dataset entries include anonymized labels, validation notes, and confidence calibration indicators.',
    'Feature drift monitoring compares temporal distributions and flags statistically significant divergence.',
    'Rows with schema inconsistencies are isolated before ingestion into retrieval and ranking pipelines.',
    'Evaluation batches track latency, precision at k, and hallucination risk for each scenario family.',
  ],
};

const tokenize = (text) => text.trim().split(/\s+/).filter(Boolean);

const buildSourceText = (document) => {
  const baseParagraphs = DOCUMENT_CORPUS[document.type] || DOCUMENT_CORPUS.PDF;
  const titleBlock = `${document.name} ${document.type} knowledge extraction stream`;
  const syntheticBlocks = Array.from({ length: 3 }, (_, index) => `${baseParagraphs[index % baseParagraphs.length]} Section ${index + 1}.`);
  return [titleBlock, ...baseParagraphs, ...syntheticBlocks].join(' ');
};

const buildChunks = (sourceText, size = 46, overlap = 12) => {
  const tokens = tokenize(sourceText);
  const chunks = [];

  let cursor = 0;
  let index = 1;

  while (cursor < tokens.length) {
    const end = Math.min(cursor + size, tokens.length);
    const chunkTokens = tokens.slice(cursor, end);
    const text = chunkTokens.join(' ');

    chunks.push({
      id: index,
      tokenStart: cursor + 1,
      tokenEnd: end,
      tokenCount: chunkTokens.length,
      charCount: text.length,
      page: Math.max(1, Math.ceil(index / 3)),
      text,
    });

    if (end >= tokens.length) {
      break;
    }

    cursor += size - overlap;
    index += 1;
  }

  return chunks;
};

const ChunkInspector = ({ document }) => {
  const { sourceText, chunks } = useMemo(() => {
    const text = buildSourceText(document);
    return {
      sourceText: text,
      chunks: buildChunks(text),
    };
  }, [document]);

  const [activeChunkId, setActiveChunkId] = useState(1);

  useEffect(() => {
    setActiveChunkId(1);
  }, [document.id]);

  const activeChunk = chunks.find((chunk) => chunk.id === activeChunkId) || chunks[0];

  const activeChunkStart = Math.max(0, sourceText.indexOf(activeChunk.text));
  const beforeText = sourceText.slice(0, activeChunkStart);
  const activeText = activeChunk.text;
  const afterText = sourceText.slice(activeChunkStart + activeText.length);

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full">
      <header className="px-5 py-4 md:px-6 md:py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Interactive Chunk Inspector</p>
            <h3 className="text-sm md:text-base font-black tracking-tight text-slate-800">{document.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-slate-200">
              <Layers3 size={12} /> {chunks.length} chunks
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-slate-200">
              <Sigma size={12} /> {tokenize(sourceText).length} tokens
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className="border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/50">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <FileText size={12} /> Original PDF (simulated)
          </div>
          <div className="p-4 md:p-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 max-h-[420px] overflow-y-auto leading-7 text-sm text-slate-700">
              <span className="text-slate-400">{beforeText}</span>
              <mark className="bg-indigo-100/90 text-indigo-900 px-1 rounded">{activeText}</mark>
              <span className="text-slate-400">{afterText}</span>
            </div>
          </div>
        </div>

        <div className="bg-white">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Braces size={12} /> Chunked view (algorithm perspective)
          </div>
          <div className="p-4 md:p-5 space-y-3 max-h-[470px] overflow-y-auto">
            {chunks.map((chunk) => {
              const isActive = chunk.id === activeChunkId;

              return (
                <button
                  key={chunk.id}
                  type="button"
                  onClick={() => setActiveChunkId(chunk.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all ${
                    isActive
                      ? 'border-indigo-300 bg-indigo-50/60 shadow-[0_8px_20px_rgba(79,70,229,0.12)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-black tracking-tight text-slate-800">Chunk #{chunk.id.toString().padStart(2, '0')}</p>
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                      <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">p. {chunk.page}</span>
                      <span className="px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-100 text-indigo-700">{chunk.tokenCount} tokens</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-bold mb-2">
                    Token range: {chunk.tokenStart}-{chunk.tokenEnd} · Characters: {chunk.charCount}
                  </p>
                  <p className="text-xs leading-6 text-slate-700">{chunk.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChunkInspector;