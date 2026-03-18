import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, GitBranch, Radar } from 'lucide-react';

const IMPACTED_DOCUMENTS = [
  { id: 1, name: 'Remote_Access_Standard.docx', status: 'Outdated', risk: 'High' },
  { id: 2, name: 'Vendor_Onboarding_Policy.pdf', status: 'Review Required', risk: 'Medium' },
  { id: 3, name: 'Privileged_Admin_Guide.md', status: 'Outdated', risk: 'High' },
  { id: 4, name: 'SOC_Runbook_Incident.csv', status: 'Review Required', risk: 'Medium' },
  { id: 5, name: 'MFA_Enrollment_Manual.pdf', status: 'Outdated', risk: 'High' },
  { id: 6, name: 'ThirdParty_BCP_Contract.docx', status: 'Review Required', risk: 'Medium' },
  { id: 7, name: 'Firewall_Exceptions_Log.xlsx', status: 'Outdated', risk: 'High' },
  { id: 8, name: 'Emergency_Communication_Playbook.pdf', status: 'Review Required', risk: 'Medium' },
  { id: 9, name: 'Audit_Evidence_Policy_v1.docx', status: 'Outdated', risk: 'High' },
  { id: 10, name: 'Data_Retention_Annex.md', status: 'Review Required', risk: 'Medium' },
];

const ImpactAnalysisGraph = ({ documents }) => {
  const indexedDocuments = useMemo(() => documents.filter((document) => document.status === 'Indexed'), [documents]);
  const [baseDocumentId, setBaseDocumentId] = useState(indexedDocuments[0]?.id ?? null);
  const [activeImpactedId, setActiveImpactedId] = useState(IMPACTED_DOCUMENTS[0].id);
  const [zoom, setZoom] = useState(1.26);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef(null);
  const dragStateRef = useRef({
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  const baseDocument = indexedDocuments.find((document) => document.id === baseDocumentId) || indexedDocuments[0] || null;
  const activeImpactedDocument = IMPACTED_DOCUMENTS.find((document) => document.id === activeImpactedId) || IMPACTED_DOCUMENTS[0];

  const clampPan = (nextPanX, nextPanY, targetZoom = zoom) => {
    const viewportWidth = viewportRef.current?.clientWidth || 0;
    const viewportHeight = viewportRef.current?.clientHeight || 0;
    const maxPanX = Math.max(0, ((targetZoom - 1) * viewportWidth) / 2);
    const maxPanY = Math.max(0, ((targetZoom - 1) * viewportHeight) / 2);

    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, nextPanX)),
      y: Math.min(maxPanY, Math.max(-maxPanY, nextPanY)),
    };
  };

  const handleWheelZoom = (event) => {
    if (!event.shiftKey) {
      return;
    }

    event.preventDefault();

    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoom((previousZoom) => {
      const nextZoom = Math.min(2.2, Math.max(1, previousZoom + delta));

      setPan((previousPan) => clampPan(previousPan.x, previousPan.y, nextZoom));
      return nextZoom;
    });
  };

  const handleDragStart = (event) => {
    if (event.button !== 0) {
      return;
    }

    setIsDragging(true);
    dragStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleDragMove = (event) => {
    if (!isDragging) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startClientX;
    const deltaY = event.clientY - dragStateRef.current.startClientY;
    const nextPan = clampPan(dragStateRef.current.startPanX + deltaX, dragStateRef.current.startPanY + deltaY);

    setPan(nextPan);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  if (!baseDocument) {
    return null;
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full">
      <header className="px-5 py-4 md:px-6 md:py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/80 to-yellow-50/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Change Management Simulation</p>
            <h3 className="text-sm md:text-base font-black tracking-tight text-slate-800">Impact Analysis Graph</h3>
            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wide">If the core policy changes, dependent documents become outdated or review-required</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-amber-200 text-[10px] font-black uppercase tracking-wider text-amber-700">
            <Radar size={12} /> Conflict Risk Monitoring
          </span>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Main policy document</label>
            <select
              value={baseDocument.id}
              onChange={(event) => setBaseDocumentId(Number(event.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-amber-500"
            >
              {indexedDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-700">
            <GitBranch size={12} /> 10 impacted documents
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-5 items-stretch">
          <div
            ref={viewportRef}
            className={`relative rounded-2xl border border-amber-200/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4 overflow-hidden select-none h-[390px] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={handleWheelZoom}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
          >
            <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(251,191,36,0.14) 1px, transparent 0)', backgroundSize: '18px 18px' }}></div>

            <div className="h-full w-full flex items-center justify-center overflow-hidden rounded-xl border border-amber-300/20 bg-slate-950/20">
              <svg
                viewBox="0 0 760 420"
                className="w-full h-full"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
              >
              <defs>
                <radialGradient id="coreGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fde68a" stopOpacity="1" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.9" />
                </radialGradient>
                <linearGradient id="linkGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.25" />
                </linearGradient>
              </defs>

              <circle cx="380" cy="210" r="62" fill="url(#coreGradient)" className="stroke-amber-300" strokeWidth="2.5" />
              <text x="380" y="195" textAnchor="middle" className="fill-amber-950 text-[12px] font-bold">
                Main Policy
              </text>
              <text x="380" y="214" textAnchor="middle" className="fill-amber-950 text-[11px] font-bold">
                {baseDocument.name.slice(0, 26)}
              </text>
              <text x="380" y="230" textAnchor="middle" className="fill-amber-900 text-[9px] font-bold uppercase tracking-widest">
                Changed
              </text>

              {IMPACTED_DOCUMENTS.map((document, index) => {
                const angle = (Math.PI * 2 * index) / IMPACTED_DOCUMENTS.length - Math.PI / 2;
                const radius = 136;
                const x = 380 + Math.cos(angle) * radius;
                const y = 210 + Math.sin(angle) * radius;
                const isActive = activeImpactedId === document.id;
                const isHighRisk = document.risk === 'High';

                return (
                  <g key={document.id} onClick={() => setActiveImpactedId(document.id)} className="cursor-pointer">
                    <line
                      x1="380"
                      y1="210"
                      x2={x}
                      y2={y}
                      className={isActive ? 'stroke-amber-300' : 'stroke-amber-200/40'}
                      strokeWidth={isActive ? '2.2' : '1.4'}
                      stroke={isActive ? 'url(#linkGradient)' : undefined}
                    />
                    {isActive && (
                      <g opacity="1">
                        <circle
                          cx={x}
                          cy={y}
                          r="13"
                          fill="none"
                          stroke="rgba(254, 243, 199, 1)"
                          strokeWidth="2.8"
                        >
                          <animate attributeName="r" values="13;88" dur="2.15s" begin="0s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="1;0" dur="2.15s" begin="0s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={x}
                          cy={y}
                          r="15"
                          fill="none"
                          stroke="rgba(252, 211, 77, 0.95)"
                          strokeWidth="2.5"
                        >
                          <animate attributeName="r" values="15;96" dur="2.15s" begin="0.36s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.95;0" dur="2.15s" begin="0.36s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={x}
                          cy={y}
                          r="17"
                          fill="none"
                          stroke="rgba(251, 191, 36, 0.88)"
                          strokeWidth="2.2"
                        >
                          <animate attributeName="r" values="17;104" dur="2.15s" begin="0.72s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.88;0" dur="2.15s" begin="0.72s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={x}
                          cy={y}
                          r="19"
                          fill="none"
                          stroke="rgba(245, 158, 11, 0.74)"
                          strokeWidth="1.9"
                        >
                          <animate attributeName="r" values="19;114" dur="2.15s" begin="1.08s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.78;0" dur="2.15s" begin="1.08s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={isActive ? '24' : '20'}
                      className={isHighRisk ? (isActive ? 'fill-amber-300 stroke-amber-100' : 'fill-amber-200 stroke-amber-300') : (isActive ? 'fill-yellow-200 stroke-yellow-300' : 'fill-yellow-100 stroke-yellow-300')}
                      strokeWidth="2"
                    />
                    <text x={x} y={y - 1} textAnchor="middle" className="fill-amber-950 text-[10px] font-bold">⚠</text>
                    <text x={x} y={y + 11} textAnchor="middle" className="fill-amber-950/90 text-[8px] font-bold">{document.id}</text>
                  </g>
                );
              })}
              </svg>
            </div>

            <div className="absolute top-3 right-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-100 bg-slate-950/70 border border-amber-300/40 rounded-lg px-2.5 py-1 pointer-events-none">
              <span>Drag</span>
              <span>·</span>
              <span>Shift+Wheel Zoom {Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 h-[390px] flex flex-col">
            <p className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">Impacted documents</p>
            <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
              {IMPACTED_DOCUMENTS.map((document) => {
                const isActive = activeImpactedId === document.id;
                const isOutdated = document.status === 'Outdated';

                return (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => setActiveImpactedId(document.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      isActive ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[11px] font-black text-slate-800 truncate">{document.name}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5">
                        <AlertTriangle size={11} /> {document.risk}
                      </span>
                    </div>
                    <p className={`text-[10px] font-black uppercase tracking-wider ${isOutdated ? 'text-rose-600' : 'text-amber-600'}`}>{document.status}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1">Active impact summary</p>
              <p className="text-[11px] font-bold text-amber-900 leading-relaxed">
                {activeImpactedDocument.name} is now {activeImpactedDocument.status.toLowerCase()} because its controls depend on the updated baseline in {baseDocument.name}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ImpactAnalysisGraph;