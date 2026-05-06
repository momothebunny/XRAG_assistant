import { CircleHelp } from 'lucide-react';

/**
 * SliderRow — shared custom range slider matching the LLM panel's design.
 *
 * Props:
 *   label        – field label (uppercase)
 *   help         – optional tooltip text
 *   value        – current numeric value (controlled)
 *   min / max    – range bounds
 *   step         – step size
 *   onChange     – (number) => void
 *   format       – (number) => string  for badge + min/max labels
 *   accentColor  – CSS color string (hex); defaults to amber-500
 *   minLabel     – override the left tick label (defaults to format(min))
 *   maxLabel     – override the right tick label (defaults to format(max))
 *   disabled     – grays out and disables interaction
 */
export default function SliderRow({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
  format,
  accentColor = '#f59e0b',
  minLabel,
  maxLabel,
  disabled = false,
}) {
  const fmt = format || ((v) => String(v));
  const pct = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </span>
          {help && (
            <span title={help} className="cursor-help text-slate-500 hover:text-slate-300">
              <CircleHelp size={10} />
            </span>
          )}
        </div>
        <span
          className="min-w-[44px] rounded-md bg-slate-800 px-2 py-0.5 text-center font-mono text-[11px] font-bold ring-1 ring-slate-700/60"
          style={{ color: accentColor }}
        >
          {fmt(value)}
        </span>
      </div>
      {/* custom track */}
      <div className="relative h-5 w-full">
        {/* gray base track */}
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-700/70">
          {/* colored fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: accentColor }}
          />
        </div>
        {/* custom thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 shadow shadow-black/60"
          style={{ left: `${pct}%`, border: `2px solid ${accentColor}` }}
        />
        {/* invisible native input for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => !disabled && onChange?.(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-600">
        <span>{minLabel !== undefined ? minLabel : fmt(min)}</span>
        <span>{maxLabel !== undefined ? maxLabel : fmt(max)}</span>
      </div>
    </div>
  );
}
