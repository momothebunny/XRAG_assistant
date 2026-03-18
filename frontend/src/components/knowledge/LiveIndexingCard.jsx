import { Database, FileSearch } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const drawDocumentGlyph = (context, particle) => {
  const width = particle.size * 0.95;
  const height = particle.size * 1.25;
  const foldSize = Math.max(1.5, width * 0.22);

  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  context.globalAlpha = particle.alpha;

  context.fillStyle = '#818cf8';
  context.beginPath();
  context.moveTo(-width / 2, -height / 2);
  context.lineTo(width / 2 - foldSize, -height / 2);
  context.lineTo(width / 2, -height / 2 + foldSize);
  context.lineTo(width / 2, height / 2);
  context.lineTo(-width / 2, height / 2);
  context.closePath();
  context.fill();

  context.fillStyle = '#c7d2fe';
  context.beginPath();
  context.moveTo(width / 2 - foldSize, -height / 2);
  context.lineTo(width / 2 - foldSize, -height / 2 + foldSize);
  context.lineTo(width / 2, -height / 2 + foldSize);
  context.closePath();
  context.fill();

  context.strokeStyle = 'rgba(30,41,59,0.5)';
  context.lineWidth = 0.7;
  context.beginPath();
  context.moveTo(-width / 4, -height / 7);
  context.lineTo(width / 4, -height / 7);
  context.moveTo(-width / 4, 0);
  context.lineTo(width / 4, 0);
  context.moveTo(-width / 4, height / 7);
  context.lineTo(width / 6, height / 7);
  context.stroke();

  context.restore();
};

const LiveIndexingCard = ({ fileName }) => {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const [progress, setProgress] = useState(64);

  const activeFileName = useMemo(() => fileName || 'Training_Log.csv', [fileName]);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((previousProgress) => {
        const nextProgress = previousProgress + Math.random() * 2.2;

        if (nextProgress > 96) {
          return 58;
        }

        return Number(nextProgress.toFixed(1));
      });
    }, 900);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let lastSpawn = 0;

    const render = (time) => {
      const wrapperElement = wrapperRef.current;
      const canvasElement = canvasRef.current;

      if (!wrapperElement || !canvasElement) {
        animationFrame = requestAnimationFrame(render);
        return;
      }

      const rect = wrapperElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
      const targetHeight = Math.max(1, Math.floor(rect.height * dpr));

      if (canvasElement.width !== targetWidth || canvasElement.height !== targetHeight) {
        canvasElement.width = targetWidth;
        canvasElement.height = targetHeight;
      }

      const context = canvasElement.getContext('2d');
      if (!context) {
        animationFrame = requestAnimationFrame(render);
        return;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      context.fillStyle = 'rgba(2,6,23,0.78)';
      context.fillRect(0, 0, rect.width, rect.height);

      context.strokeStyle = 'rgba(71,85,105,0.28)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, 16);
      context.lineTo(rect.width, 16);
      context.stroke();

      if (time - lastSpawn > 165) {
        const lanes = 12;
        const laneWidth = rect.width / lanes;
        const lane = Math.floor(Math.random() * lanes);

        particlesRef.current.push({
          x: lane * laneWidth + laneWidth * (0.2 + Math.random() * 0.6),
          y: -12,
          speed: 1.2 + Math.random() * 1.35,
          size: 7 + Math.random() * 2.2,
          alpha: 0.78 + Math.random() * 0.2,
          rotation: (Math.random() - 0.5) * 0.3,
          spin: (Math.random() - 0.5) * 0.03,
        });

        lastSpawn = time;
      }

      const collectorTop = rect.height - 30;
      const nextParticles = [];

      particlesRef.current.forEach((particle) => {
        particle.y += particle.speed;
        particle.rotation += particle.spin;

        if (particle.y < collectorTop + 8) {
          nextParticles.push(particle);
        }

        const fade = particle.y > collectorTop ? Math.max(0, 1 - (particle.y - collectorTop) / 18) : 1;
        const trailOpacity = 0.26 * fade;

        context.strokeStyle = `rgba(129,140,248,${trailOpacity})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(particle.x, particle.y - 12);
        context.lineTo(particle.x, particle.y);
        context.stroke();

        drawDocumentGlyph(context, {
          ...particle,
          alpha: particle.alpha * fade,
        });
      });

      particlesRef.current = nextParticles.slice(-30);

      context.fillStyle = 'rgba(15,23,42,0.96)';
      context.fillRect(0, rect.height - 26, rect.width, 26);
      context.strokeStyle = 'rgba(99,102,241,0.25)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, rect.height - 26);
      context.lineTo(rect.width, rect.height - 26);
      context.stroke();

      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className="bg-slate-950 border border-slate-700 rounded-2xl p-5 md:p-6 overflow-hidden relative">
      <div className="flex flex-col lg:flex-row items-stretch gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-700">
              <FileSearch className="text-indigo-300" size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white uppercase tracking-widest truncate">{activeFileName}</h3>
              <p className="text-[10px] text-indigo-300/85 font-bold uppercase tracking-tight">Live Vector Indexing</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase">
              <span>Processing</span>
              <span className="text-indigo-300">{Math.floor(progress)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-indigo-500 to-violet-400 h-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-64 xl:w-72 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <div
            ref={wrapperRef}
            className="relative h-40 rounded-lg border border-slate-700 bg-slate-950 overflow-hidden"
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

            <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center pointer-events-none">
              <div className="w-10 h-10 rounded-lg border border-slate-600 bg-slate-900 flex items-center justify-center">
                <Database size={20} className="text-indigo-300/75" />
              </div>
              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1.5">Vector Store</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveIndexingCard;
