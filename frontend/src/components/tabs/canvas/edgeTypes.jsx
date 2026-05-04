import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import { useId } from 'react';

const FALLBACK = '#d97706';

const STATUS_COLOR = {
  ok: '#10b981',
  error: '#ef4444',
  running: '#f59e0b',
};

/**
 * Smooth-step edge whose stroke is a linear gradient interpolating between the
 * source node accent color and the target node accent color, with a futuristic
 * dashed flow animation running along the path. When the edge has a
 * `data.runStatus` of `ok` or `error`, a status-colored overlay wipes from the
 * source toward the arrow head over ~0.7s and then stays solid; for `running`
 * an amber dashed flow is layered on top.
 */
export const GradientStepEdge = (props) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    data,
    style,
  } = props;

  const reactId = useId().replace(/[:]/g, '_');
  const gradId = `xrag-edge-grad-${reactId}`;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });

  const sourceColor = data?.sourceColor || FALLBACK;
  const targetColor = data?.targetColor || sourceColor;
  const runStatus = data?.runStatus;
  const runStamp = data?.runStamp || 0;

  const baseWidth = selected ? 6 : 5;
  const dashDuration = selected ? '0.9s' : '1.4s';

  const isWipeStatus = runStatus === 'ok' || runStatus === 'error' || runStatus === 'running';
  const isRunning = runStatus === 'running';
  const statusColor = STATUS_COLOR[runStatus];
  const haloColor = isWipeStatus ? statusColor : targetColor;

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="33%" stopColor={sourceColor} />
          <stop offset="55%" stopColor={targetColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>

      {/* Selection halo — soft outer glow + thin bright outline that travels
          along with the edge. Only rendered when the edge is selected. The
          glow uses the same source→target gradient as the main stroke when
          idle, so the halo shifts color along its length; status edges keep
          a uniform status-colored halo. */}
      {selected && (
        <>
          <path
            d={path}
            fill="none"
            stroke={isWipeStatus ? statusColor : `url(#${gradId})`}
            strokeWidth={baseWidth + 14}
            strokeLinecap="round"
            style={{
              opacity: 0.2,
              filter: isWipeStatus
                ? `drop-shadow(0 0 6px ${statusColor}) drop-shadow(0 0 12px ${statusColor})`
                : `drop-shadow(0 0 6px ${sourceColor}) drop-shadow(0 0 12px ${targetColor})`,
              pointerEvents: 'none',
            }}
          />
          <path
            d={path}
            fill="none"
            stroke={isWipeStatus ? statusColor : `url(#${gradId})`}
            strokeWidth={baseWidth + 6}
            strokeLinecap="round"
            style={{
              opacity: 0.38,
              pointerEvents: 'none',
            }}
          />
          <path
            d={path}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeDasharray="6 5"
            style={{
              opacity: 0.85,
              animation: 'xrag-edge-flow 0.8s linear infinite',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {/* Base path. While idle / running it shows the animated gradient dash.
          As soon as a status is set, the base becomes a solid status-colored
          line so the final state is clean and uniform (no leftover dash gaps
          showing the gradient through). */}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={
          isWipeStatus
            ? {
                ...style,
                stroke: statusColor,
                strokeWidth: baseWidth,
                strokeLinecap: 'round',
                strokeDasharray: 'none',
              }
            : {
                ...style,
                stroke: `url(#${gradId})`,
                strokeWidth: baseWidth,
                strokeLinecap: 'round',
                strokeDasharray: '12 8',
                animation: `xrag-edge-flow ${dashDuration} linear infinite`,
              }
        }
      />

      {/* Status wipe overlay — draws the status color from source to target
          using a path-length stroke-dasharray trick. Renders ON TOP of the
          (already solid) status-colored base so the user clearly sees the
          color "filling" the line from source to arrow head. Keyed on
          runStamp so each status transition replays. */}
      {isWipeStatus && (
        <path
          key={`wipe-${runStamp}`}
          d={path}
          fill="none"
          stroke={statusColor}
          strokeWidth={baseWidth + 2}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          style={{
            strokeDashoffset: 100,
            animation: 'xrag-edge-wipe 1.2s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* running overlay — amber data-stream flow on top of the gradient */}
      {isRunning && (
        <path
          d={path}
          fill="none"
          stroke={statusColor}
          strokeWidth={baseWidth + 1}
          strokeLinecap="round"
          strokeDasharray="14 10"
          style={{
            animation: 'xrag-edge-running-flow 0.9s linear infinite',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
};

export const edgeTypes = {
  gradient: GradientStepEdge,
};
