import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

const HallucinationHeatmap = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, hourIndex) => `${hourIndex}h`);

  const data = useMemo(() => {
    return days.map(() => Array.from({ length: 24 }, () => Math.floor(Math.random() * 5)));
  }, []);

  const stats = useMemo(() => {
    const flattened = data.flat();
    const avgRisk = flattened.reduce((sum, value) => sum + value, 0) / flattened.length;
    const highRiskSlots = flattened.filter((value) => value >= 3).length;

    return {
      avgRisk: avgRisk.toFixed(2),
      highRiskSlots,
    };
  }, [data]);

  const colors = [
    'bg-slate-50 border-slate-100',
    'bg-indigo-100 border-indigo-200',
    'bg-indigo-400 border-indigo-500',
    'bg-indigo-600 border-indigo-700',
    'bg-indigo-900 border-indigo-950',
  ];

  return (
    <div className="bg-gradient-to-b from-white to-slate-50/70 p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
            <AlertTriangle className="text-rose-500" size={20} /> Hallucination Risk and Load Calendar
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Weekly anomaly distribution over time</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wide">
              Avg Risk: {stats.avgRisk}/4
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wide">
              High-Risk Slots: {stats.highRiskSlots}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap lg:justify-end">
          <span className="text-[10px] font-black text-slate-400 uppercase">Safe</span>
          <div className="flex gap-1.5 p-1.5 rounded-xl bg-white border border-slate-200">
            {colors.map((color, colorIndex) => (
              <div key={colorIndex} className={`w-3.5 h-3.5 rounded-sm ${color.split(' ')[0]} border border-slate-200`}></div>
            ))}
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase">Risky</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 md:p-5 overflow-x-auto">
        <div className="min-w-[920px] space-y-2.5">
          <div className="flex items-center">
            <div className="w-12"></div>
            <div className="grid gap-1 px-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {hours.map((hourLabel, hourIndex) => (
                <div
                  key={hourLabel}
                  className={`w-8 text-[10px] font-black text-slate-600 text-center ${hourIndex % 2 !== 0 ? 'hidden sm:block' : ''}`}
                >
                  {hourLabel}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {days.map((dayLabel, dayIndex) => (
              <div key={dayLabel} className="flex items-center">
                <div className="w-12 text-[10px] font-black text-slate-500 uppercase tracking-tighter">{dayLabel}</div>
                <div className="grid gap-1 px-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                  {data[dayIndex].map((value, hourIndex) => (
                    <div
                      key={`${dayLabel}-${hourIndex}`}
                      className={`w-8 h-8 rounded-[4px] border transition-all hover:ring-2 hover:ring-indigo-300 cursor-crosshair group relative ${colors[value]}`}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[8px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none shadow-xl">
                        {dayLabel} {hourIndex}:00 | Risk: {value}/4
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mt-0.5 rounded-xl bg-white p-2 shadow-sm">
          <AlertTriangle size={14} className="text-amber-500" />
        </div>
        <p className="text-[10px] text-slate-500 font-bold leading-relaxed italic uppercase tracking-tight">
          Night-time spikes (02:00-04:00) correlate with scheduled database cleanup processes.
        </p>
      </div>
    </div>
  );
};

export default HallucinationHeatmap;
