import { getSmoothStepPath } from '@xyflow/react';

/**
 * Custom connection line drawn while the user drags a wire between handles.
 *
 * React Flow passes a `connectionStatus` prop derived from the
 * `isValidConnection` callback configured on `<ReactFlow>`. When the user
 * hovers an incompatible handle/node the status flips to `'invalid'`; we
 * recolour the in-flight wire to red so the incompatibility is obvious
 * before they release the mouse.
 */
const VALID_STROKE = '#a78bfa';
const INVALID_STROKE = '#ef4444';

export default function CanvasConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionStatus,
}) {
  const isInvalid = connectionStatus === 'invalid';
  const stroke = isInvalid ? INVALID_STROKE : VALID_STROKE;

  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
    borderRadius: 14,
  });

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeDasharray={isInvalid ? '10 6' : undefined}
        style={isInvalid ? { filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.55))' } : undefined}
      />
      <circle cx={toX} cy={toY} r={6} fill={stroke} />
    </g>
  );
}
