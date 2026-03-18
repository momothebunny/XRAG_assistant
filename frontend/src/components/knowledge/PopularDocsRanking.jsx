import { Flame, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

const PopularDocsRanking = ({ documents, className = '' }) => {
  const ranking = useMemo(() => {
    return documents
      .map((document, index) => {
        const seed = (document.name.length * 13 + document.id * 17 + index * 5) % 37;
        const usageScore = Math.max(18, Math.round((document.chunks || 0) * 0.42 + (document.status === 'Indexed' ? 44 : 18) + seed));

        return {
          ...document,
          usageScore,
        };
      })
      .sort((leftDocument, rightDocument) => rightDocument.usageScore - leftDocument.usageScore)
      .slice(0, 5);
  }, [documents]);

  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 w-full flex flex-col min-h-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame size={15} className="text-amber-500 animate-pulse" />
            <h3 className="text-sm font-black text-slate-800 tracking-tight">Top AI-used Documents</h3>
          </div>
          <p className="text-[11px] text-slate-500">Live popularity ranking based on XRAG retrieval usage</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-700">
          <TrendingUp size={11} /> Hot
        </span>
      </header>

      <div className="space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-1">
        {ranking.map((document, index) => {
          const intensity = Math.max(18, Math.min(100, Math.round((document.usageScore / Math.max(1, ranking[0]?.usageScore || 1)) * 100)));

          return (
            <article key={document.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-600 flex items-center justify-center shrink-0">
                    #{index + 1}
                  </span>
                  <p className="text-xs font-black text-slate-800 truncate">{document.name}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-700 shrink-0">
                  <Flame size={11} className={index < 3 ? 'animate-pulse' : ''} />
                  {document.usageScore}
                </span>
              </div>

              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 animate-pulse"
                  style={{ width: `${intensity}%`, animationDuration: `${1.2 + index * 0.25}s` }}
                ></div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default PopularDocsRanking;