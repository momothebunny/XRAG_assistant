import { FileText, Layers, ScanSearch, ScanText } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Visual mirror of ProcessingSimulationBar but driven by real upload state.
 *
 * Props:
 *  - activeFile: string (currently uploading file name)
 *  - progress: 0-100 (derived from done / total + in-flight portion)
 *  - isFinishing: boolean (all files done, briefly show success state)
 *  - totalFiles, doneFiles: numbers shown in the right-hand badge
 */
const KnowledgeUploadProgress = ({ activeFile, progress, isFinishing, hasError, totalFiles, doneFiles }) => {
  const [fallingDocs, setFallingDocs] = useState([]);

  // Three visual modes: in-progress (indigo), success (emerald), error (rose).
  const mode = isFinishing ? (hasError ? 'error' : 'success') : 'progress';
  const palette = {
    progress: {
      border: 'border-indigo-500/45',
      bg: 'bg-slate-950',
      iconBox: 'border border-indigo-500/45 bg-indigo-600/15',
      iconText: 'text-indigo-300',
      label: 'text-indigo-300/90',
      counter: 'rgb(199 210 254)',
      barBorder: 'border-indigo-500/25',
      barFrom: 'from-indigo-600 via-indigo-500 to-indigo-400',
      stage: 'text-indigo-200/85',
      stageDot: 'text-indigo-400/60',
    },
    success: {
      border: 'border-emerald-500/45',
      bg: 'bg-gradient-to-r from-slate-950 via-emerald-950/35 to-slate-950',
      iconBox: 'border border-emerald-500/45 bg-emerald-600/15',
      iconText: 'text-emerald-300',
      label: 'text-emerald-300/90',
      counter: 'rgb(134 239 172)',
      barBorder: 'border-emerald-500/25',
      barFrom: 'from-emerald-600 via-emerald-500 to-green-400',
      stage: 'text-emerald-200/85',
      stageDot: 'text-emerald-400/60',
    },
    error: {
      border: 'border-rose-500/55',
      bg: 'bg-gradient-to-r from-slate-950 via-rose-950/40 to-slate-950',
      iconBox: 'border border-rose-500/55 bg-rose-600/20',
      iconText: 'text-rose-300',
      label: 'text-rose-300/90',
      counter: 'rgb(253 164 175)',
      barBorder: 'border-rose-500/30',
      barFrom: 'from-rose-600 via-rose-500 to-red-400',
      stage: 'text-rose-200/85',
      stageDot: 'text-rose-400/60',
    },
  }[mode];

  useEffect(() => {
    const animationTimer = setInterval(() => {
      const depthLayer = Math.floor(Math.random() * 3);
      const depthConfigs = [
        { scale: 0.8, speed: 3.2, opacity: 0.38, z: 1 },
        { scale: 1.0, speed: 2.8, opacity: 0.55, z: 2 },
        { scale: 1.2, speed: 2.35, opacity: 0.78, z: 3 },
      ];
      const selectedDepth = depthConfigs[depthLayer];
      const purpleShades = [
        'rgba(196,181,253,1)',
        'rgba(167,139,250,1)',
        'rgba(139,92,246,1)',
        'rgba(124,58,237,1)',
        'rgba(109,40,217,1)',
      ];
      const greenShades = [
        'rgba(187,247,208,1)',
        'rgba(134,239,172,1)',
        'rgba(74,222,128,1)',
        'rgba(34,197,94,1)',
        'rgba(22,163,74,1)',
      ];
      const roseShades = [
        'rgba(254,205,211,1)',
        'rgba(253,164,175,1)',
        'rgba(251,113,133,1)',
        'rgba(244,63,94,1)',
        'rgba(225,29,72,1)',
      ];

      const nextDoc = {
        id: Date.now() + Math.random(),
        left: 4 + Math.random() * 92,
        duration: selectedDepth.speed + Math.random() * 1.6,
        rotationStart: -20 + Math.random() * 40,
        rotationEnd: -10 + Math.random() * 20,
        drift: -10 + Math.random() * 20,
        size: (12 + Math.random() * 8) * selectedDepth.scale,
        depthLayer,
        depthOpacity: selectedDepth.opacity,
        zIndex: selectedDepth.z,
        color: purpleShades[Math.floor(Math.random() * purpleShades.length)],
        successColor: greenShades[Math.floor(Math.random() * greenShades.length)],
        errorColor: roseShades[Math.floor(Math.random() * roseShades.length)],
      };

      setFallingDocs((previousDocs) => [...previousDocs.slice(-26), nextDoc]);
    }, isFinishing ? 170 : 260);

    return () => clearInterval(animationTimer);
  }, [isFinishing]);

  return (
    <div
      className={`rounded-2xl p-4 md:p-5 overflow-hidden relative transition-all duration-700 border ${palette.border} ${palette.bg}`}
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        {fallingDocs.map((doc) => (
          <div
            key={doc.id}
            className="absolute top-[-16px] animate-doc-fall-bg"
            style={{
              left: `${doc.left}%`,
              animationDuration: `${doc.duration}s`,
              '--doc-rot-start': `${doc.rotationStart}deg`,
              '--doc-rot-end': `${doc.rotationEnd}deg`,
              '--doc-drift': `${doc.drift}px`,
              '--doc-scale': doc.depthLayer === 2 ? '1.18' : doc.depthLayer === 1 ? '1' : '0.82',
              color: isFinishing ? (hasError ? doc.errorColor : doc.successColor) : doc.color,
              opacity: doc.depthOpacity,
              zIndex: doc.zIndex,
              filter: doc.depthLayer === 0 ? 'blur(0.4px)' : 'none',
              transition: 'color 650ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <FileText size={doc.size} />
          </div>
        ))}
      </div>

      {isFinishing && !hasError && (
        <div className="absolute inset-0 z-[2] pointer-events-none bg-[linear-gradient(to_right,rgba(34,197,94,0.08),rgba(74,222,128,0.04),rgba(34,197,94,0.08))]"></div>
      )}
      {isFinishing && hasError && (
        <div className="absolute inset-0 z-[2] pointer-events-none bg-[linear-gradient(to_right,rgba(244,63,94,0.10),rgba(251,113,133,0.05),rgba(244,63,94,0.10))]"></div>
      )}

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-700 ${palette.iconBox}`}
            >
              <ScanSearch
                size={18}
                className={`transition-colors duration-700 ${palette.iconText}`}
              />
            </div>
            <div className="min-w-0">
              <p
                className={`text-[10px] font-black uppercase tracking-widest transition-colors duration-700 ${palette.label}`}
              >
                Knowledge Upload Pipeline
              </p>
              <p className="text-sm font-black text-white truncate">
                {activeFile || (isFinishing ? (hasError ? 'Upload finished with errors' : 'All files indexed') : 'Preparing…')}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors duration-500"
            style={{ color: palette.counter }}
          >
            <Layers size={14} />
            <span>
              {isFinishing
                ? (hasError
                    ? `Errors — ${doneFiles}/${totalFiles}`
                    : `Indexed ${doneFiles}/${totalFiles}`)
                : `${Math.floor(progress)}% • ${doneFiles}/${totalFiles}`}
            </span>
          </div>
        </div>

        <div>
          <div
            className={`w-full h-2.5 rounded-full bg-black/40 overflow-hidden transition-all duration-700 border ${palette.barBorder}`}
          >
            <div
              className="h-full rounded-full relative overflow-hidden transition-all duration-300"
              style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-r ${palette.barFrom} transition-opacity duration-700`}
              ></div>
            </div>
          </div>

          <div
            className={`mt-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wide flex-wrap transition-colors duration-700 ${palette.stage}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <ScanText size={12} /> OCR
            </span>
            <span className={palette.stageDot}>•</span>
            <span className="inline-flex items-center gap-1.5">
              <FileText size={12} /> Extract
            </span>
            <span className={palette.stageDot}>•</span>
            <span>Chunking</span>
            <span className={palette.stageDot}>•</span>
            <span>Embedding</span>
            <span className={palette.stageDot}>•</span>
            <span>Vector Store Write</span>
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes doc-fall-bg {
            0% {
              transform: translate3d(-50%, 0, 0) rotate(var(--doc-rot-start)) scale(var(--doc-scale));
              opacity: 0;
            }
            10% {
              opacity: 0.98;
            }
            85% {
              opacity: 0.9;
              transform: translate3d(calc(-50% + var(--doc-drift)), 128px, 0) rotate(var(--doc-rot-end)) scale(var(--doc-scale));
            }
            100% {
              transform: translate3d(calc(-50% + var(--doc-drift)), 164px, 0) rotate(var(--doc-rot-end)) scale(calc(var(--doc-scale) * 0.8));
              opacity: 0;
            }
          }

          .animate-doc-fall-bg {
            animation-name: doc-fall-bg;
            animation-timing-function: linear;
            animation-fill-mode: forwards;
          }
        `}
      </style>
    </div>
  );
};

export default KnowledgeUploadProgress;
