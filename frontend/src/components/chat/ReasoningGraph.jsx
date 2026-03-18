import { useState } from 'react';
import { ChevronDown, GitCommit } from 'lucide-react';

const DEFAULT_TRACE_STEPS = [
  { label: 'Search', duration: '128 ms' },
  { label: 'Filter', duration: '94 ms' },
  { label: 'Ground', duration: '137 ms' },
  { label: 'Answer', duration: '66 ms' },
];

const ReasoningGraph = ({ steps }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeStep, setActiveStep] = useState(null);

  const traceSteps = steps?.length ? steps : DEFAULT_TRACE_STEPS;

  if (!traceSteps.length) {
    return null;
  }

  return (
    <div className="mt-3 pt-2 border-t border-slate-100/70">
      <button
        onClick={() => setIsExpanded((previousValue) => !previousValue)}
        className="flex items-center gap-1.5 text-indigo-500/80 hover:text-indigo-600 transition-colors group"
        type="button"
      >
        <GitCommit size={12} className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
        <span className="text-[9px] font-black uppercase tracking-widest">XRAG Trace</span>
        <ChevronDown size={10} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="relative flex items-center justify-between px-4 py-3 mt-2">
          <div className="absolute left-6 right-6 h-[1px] bg-slate-100 top-1/2 -translate-y-1/2"></div>

          {traceSteps.map((step, stepIndex) => (
            <div key={`${step.label}-${stepIndex}`} className="relative z-10 flex flex-col items-center">
              <button
                onMouseEnter={() => setActiveStep(stepIndex)}
                onMouseLeave={() => setActiveStep(null)}
                className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 transform ${
                  activeStep === stepIndex
                    ? 'bg-indigo-600 border-indigo-200 scale-125 shadow-[0_0_8px_rgba(79,70,229,0.4)]'
                    : 'bg-white border-slate-300 hover:border-indigo-400'
                }`}
                type="button"
              />

              <span
                className={`absolute top-4 text-[7px] font-bold uppercase tracking-tighter whitespace-nowrap transition-colors ${
                  activeStep === stepIndex ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>

              {activeStep === stepIndex && (
                <div className="absolute bottom-5 bg-slate-900 text-white text-[9px] px-2 py-1 rounded shadow-xl z-20 whitespace-nowrap border border-slate-700 pointer-events-none">
                  <span className="font-bold">{step.duration}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReasoningGraph;
