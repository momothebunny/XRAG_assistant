import { FileText, Layers, ScanSearch } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const SIMULATED_FILES = ['Training_Log.csv', 'BCP_Plan_2024.pdf', 'Infra_Security_v2.docx'];

const ProcessingSimulationBar = ({ onStatusChange, onFinishCycle }) => {
  const [progress, setProgress] = useState(18);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [fallingDocs, setFallingDocs] = useState([]);
  const [isFinishingCycle, setIsFinishingCycle] = useState(false);

  const activeFile = useMemo(() => SIMULATED_FILES[activeFileIndex], [activeFileIndex]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((previousProgress) => {
        if (isFinishingCycle) {
          return 100;
        }

        const nextProgress = previousProgress + 4 + Math.random() * 6;

        if (nextProgress >= 100) {
          setIsFinishingCycle(true);
          return 100;
        }

        return nextProgress;
      });
    }, 850);

    return () => clearInterval(timer);
  }, [isFinishingCycle]);

  useEffect(() => {
    if (!isFinishingCycle) {
      return undefined;
    }

    const finishTimer = setTimeout(() => {
      setIsFinishingCycle(false);
      setActiveFileIndex((previousIndex) => (previousIndex + 1) % SIMULATED_FILES.length);
      setProgress(8);
    }, 1700);

    return () => clearTimeout(finishTimer);
  }, [isFinishingCycle]);

  useEffect(() => {
    if (!onStatusChange) {
      return;
    }

    onStatusChange(isFinishingCycle);
  }, [isFinishingCycle, onStatusChange]);

  useEffect(() => {
    if (!isFinishingCycle || !onFinishCycle) {
      return;
    }

    onFinishCycle();
  }, [isFinishingCycle, onFinishCycle]);

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
        'rgba(252,211,77,1)',
        'rgba(251,191,36,1)',
        'rgba(245,158,11,1)',
        'rgba(217,119,6,1)',
        'rgba(180,83,9,1)',
      ];
      const greenShades = [
        'rgba(187,247,208,1)',
        'rgba(134,239,172,1)',
        'rgba(74,222,128,1)',
        'rgba(34,197,94,1)',
        'rgba(22,163,74,1)',
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
      };

      setFallingDocs((previousDocs) => [...previousDocs.slice(-26), nextDoc]);
    }, isFinishingCycle ? 170 : 260);

    return () => clearInterval(animationTimer);
  }, [isFinishingCycle]);

  return (
    <div
      className={`rounded-2xl p-4 md:p-5 overflow-hidden relative transition-all duration-700 ${
        isFinishingCycle
          ? 'border border-emerald-500/45 bg-gradient-to-r from-slate-950 via-emerald-950/35 to-slate-950'
          : 'border border-indigo-500/45 bg-slate-950'
      }`}
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
              color: isFinishingCycle ? doc.successColor : doc.color,
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

      {isFinishingCycle && (
        <div className="absolute inset-0 z-[2] pointer-events-none bg-[linear-gradient(to_right,rgba(34,197,94,0.08),rgba(74,222,128,0.04),rgba(34,197,94,0.08))]"></div>
      )}

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-700 ${
                isFinishingCycle ? 'border border-emerald-500/45 bg-emerald-600/15' : 'border border-indigo-500/45 bg-indigo-600/15'
              }`}
            >
              <ScanSearch size={18} className={`transition-colors duration-700 ${isFinishingCycle ? 'text-emerald-300' : 'text-indigo-300'}`} />
            </div>
            <div className="min-w-0">
              <p
                className={`text-[10px] font-black uppercase tracking-widest transition-colors duration-700 ${
                  isFinishingCycle ? 'text-emerald-300/90' : 'text-indigo-300/90'
                }`}
              >
                Document Processing Simulation
              </p>
              <p className="text-sm font-black text-white truncate">{activeFile}</p>
            </div>
          </div>

          <div
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors duration-500"
            style={{ color: isFinishingCycle ? 'rgb(134 239 172)' : 'rgb(199 210 254)' }}
          >
            <Layers size={14} />
            <span>{isFinishingCycle ? 'Finished' : `${Math.floor(progress)}% indexed`}</span>
          </div>
        </div>

        <div>
          <div
            className={`w-full h-2.5 rounded-full bg-black/40 overflow-hidden transition-all duration-700 ${
              isFinishingCycle ? 'border border-emerald-500/25' : 'border border-indigo-500/25'
            }`}
          >
            <div
              className="h-full rounded-full relative overflow-hidden transition-all duration-700"
              style={{ width: `${progress}%` }}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400 transition-opacity duration-700"
                style={{ opacity: isFinishingCycle ? 0 : 1 }}
              ></div>
              <div
                className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-400 transition-opacity duration-700"
                style={{ opacity: isFinishingCycle ? 1 : 0 }}
              ></div>
            </div>
          </div>

          <div
            className={`mt-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wide flex-wrap transition-colors duration-700 ${
              isFinishingCycle ? 'text-emerald-200/85' : 'text-indigo-200/85'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <FileText size={12} /> Chunking
            </span>
            <span className={`${isFinishingCycle ? 'text-emerald-400/60' : 'text-indigo-400/60'} transition-colors duration-700`}>•</span>
            <span>Embedding</span>
            <span className={`${isFinishingCycle ? 'text-emerald-400/60' : 'text-indigo-400/60'} transition-colors duration-700`}>•</span>
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

export default ProcessingSimulationBar;
