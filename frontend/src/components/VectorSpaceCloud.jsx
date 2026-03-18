import { Box, Maximize2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const CATEGORY_COLORS = {
  PDF: { r: 59, g: 130, b: 246 },
  DOCX: { r: 16, g: 185, b: 129 },
  CSV: { r: 245, g: 158, b: 11 },
};

const AXIS_LABELS = {
  x: 'X = Semantic Similarity',
  y: 'Y = Document Freshness',
  z: 'Z = Source Confidence',
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const normalizeAngle = (value) => {
  let normalizedValue = value % 360;

  if (normalizedValue > 180) {
    normalizedValue -= 360;
  }

  if (normalizedValue < -180) {
    normalizedValue += 360;
  }

  return normalizedValue;
};

const rotatePoint = (point, pitchDeg, yawDeg) => {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  const xzX = point.x * cosYaw + point.z * sinYaw;
  const xzZ = -point.x * sinYaw + point.z * cosYaw;

  const yzY = point.y * cosPitch - xzZ * sinPitch;
  const yzZ = point.y * sinPitch + xzZ * cosPitch;

  return {
    x: xzX,
    y: yzY,
    z: yzZ,
    category: point.category,
    seed: point.seed,
  };
};

const projectPoint = (point, width, height) => {
  const focalLength = 430;
  const cameraDistance = 520;
  const safeZ = cameraDistance - point.z;
  const perspective = focalLength / Math.max(120, safeZ);

  return {
    x: width / 2 + point.x * perspective,
    y: height / 2 + point.y * perspective,
    depth: point.z,
    perspective,
  };
};

const drawLine3D = (context, from, to, width, height, color, lineWidth = 1.2) => {
  const projectedFrom = projectPoint(from, width, height);
  const projectedTo = projectPoint(to, width, height);

  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(projectedFrom.x, projectedFrom.y);
  context.lineTo(projectedTo.x, projectedTo.y);
  context.stroke();
};

const scalePoint = (point, scale) => ({
  ...point,
  x: point.x * scale,
  y: point.y * scale,
  z: point.z * scale,
});

const generateDummyPoints = (count, cubeSize) => {
  const maxRadius = cubeSize * 0.88;
  const shellSteps = [0.34, 0.5, 0.68, 0.84, 0.96];

  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    const theta = seed * 1.37;
    const phi = (seed * 0.97) % Math.PI;
    const shellBase = shellSteps[seed % shellSteps.length];
    const shellNoise = ((Math.sin(seed * 2.11) + Math.cos(seed * 1.43)) * 0.5) * 0.07;
    const radialFactor = clamp(shellBase + shellNoise, 0.26, 0.98);
    const radius = maxRadius * radialFactor;

    const xJitter = Math.sin(seed * 2.81) * cubeSize * 0.035;
    const yJitter = Math.cos(seed * 1.93) * cubeSize * 0.03;
    const zJitter = Math.sin(seed * 2.27) * cubeSize * 0.035;

    return {
      x: Math.cos(theta) * Math.sin(phi) * radius + xJitter,
      y: Math.cos(phi) * radius + yJitter,
      z: Math.sin(theta) * Math.sin(phi) * radius + zJitter,
      category: seed % 3 === 0 ? 'PDF' : seed % 3 === 1 ? 'DOCX' : 'CSV',
      seed,
    };
  });
};

const VectorScene = ({ canvasHeightClass, cubeSize }) => {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const [rotation, setRotation] = useState({ pitch: -18, yaw: 10 });
  const [isDragging, setIsDragging] = useState(false);
  const points = useMemo(() => generateDummyPoints(140, cubeSize), [cubeSize]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((previousRotation) => {
        if (isDragging) {
          return previousRotation;
        }

        return {
          pitch: previousRotation.pitch,
          yaw: normalizeAngle(previousRotation.yaw + 0.38),
        };
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isDragging]);

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      const deltaX = event.clientX - pointerRef.current.x;
      const deltaY = event.clientY - pointerRef.current.y;

      setRotation((previousRotation) => ({
        pitch: clamp(previousRotation.pitch - deltaY * 0.34, -82, 82),
        yaw: normalizeAngle(previousRotation.yaw + deltaX * 0.48),
      }));

      pointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    let animationFrame = 0;

    const render = (time) => {
      const canvasElement = canvasRef.current;
      const wrapperElement = wrapperRef.current;

      if (!canvasElement || !wrapperElement) {
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

      const pulseBase = (time / 1000) * 2.2;
      const fitTarget = Math.min(rect.width, rect.height) * 0.34;
      const fitSource = cubeSize + 40;
      const sceneFitScale = clamp(fitTarget / fitSource, 0.72, 1.24);

      const rotatedPoints = points
        .map((point) => rotatePoint(point, rotation.pitch, rotation.yaw))
        .map((point) => scalePoint(point, sceneFitScale))
        .sort((leftPoint, rightPoint) => leftPoint.z - rightPoint.z);

      const cubeVertices = [
        { x: -cubeSize, y: -cubeSize, z: -cubeSize },
        { x: cubeSize, y: -cubeSize, z: -cubeSize },
        { x: cubeSize, y: cubeSize, z: -cubeSize },
        { x: -cubeSize, y: cubeSize, z: -cubeSize },
        { x: -cubeSize, y: -cubeSize, z: cubeSize },
        { x: cubeSize, y: -cubeSize, z: cubeSize },
        { x: cubeSize, y: cubeSize, z: cubeSize },
        { x: -cubeSize, y: cubeSize, z: cubeSize },
      ].map((vertex) => rotatePoint(vertex, rotation.pitch, rotation.yaw));

      const scaledCubeVertices = cubeVertices.map((vertex) => scalePoint(vertex, sceneFitScale));

      const edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ];

      edges.forEach(([fromIndex, toIndex]) => {
        drawLine3D(context, scaledCubeVertices[fromIndex], scaledCubeVertices[toIndex], rect.width, rect.height, 'rgba(100,116,139,0.24)', 1);
      });

      const axisLength = cubeSize + 22;
      const origin = scalePoint(rotatePoint({ x: 0, y: 0, z: 0 }, rotation.pitch, rotation.yaw), sceneFitScale);
      const xAxis = scalePoint(rotatePoint({ x: axisLength, y: 0, z: 0 }, rotation.pitch, rotation.yaw), sceneFitScale);
      const yAxis = scalePoint(rotatePoint({ x: 0, y: -axisLength, z: 0 }, rotation.pitch, rotation.yaw), sceneFitScale);
      const zAxis = scalePoint(rotatePoint({ x: 0, y: 0, z: axisLength }, rotation.pitch, rotation.yaw), sceneFitScale);

      drawLine3D(context, origin, xAxis, rect.width, rect.height, 'rgba(59,130,246,0.85)', 1.6);
      drawLine3D(context, origin, yAxis, rect.width, rect.height, 'rgba(16,185,129,0.85)', 1.6);
      drawLine3D(context, origin, zAxis, rect.width, rect.height, 'rgba(245,158,11,0.85)', 1.6);

      const drawAxisLabel = (label, point, color) => {
        const projectedPoint = projectPoint(point, rect.width, rect.height);
        context.fillStyle = color;
        context.font = '700 11px system-ui';
        context.fillText(label, projectedPoint.x + 6, projectedPoint.y - 4);
      };

      drawAxisLabel('X', xAxis, 'rgba(147,197,253,1)');
      drawAxisLabel('Y', yAxis, 'rgba(110,231,183,1)');
      drawAxisLabel('Z', zAxis, 'rgba(252,211,77,1)');

      rotatedPoints.forEach((point) => {
        const projectedPoint = projectPoint(point, rect.width, rect.height);
        const categoryColor = CATEGORY_COLORS[point.category];
        const depthFactor = clamp((point.z + 180) / 360, 0.12, 1);
        const pulse = 0.94 + Math.sin(pulseBase + point.seed * 0.43) * 0.08;
        const shimmer = 0.9 + Math.cos(pulseBase * 0.72 + point.seed * 0.39) * 0.16;
        const radius = Math.max(2.15, (2.8 + projectedPoint.perspective * 2.05) * pulse);
        const glowRadius = radius * (1.65 + shimmer * 0.18);
        const sparkleAngle = pulseBase + point.seed * 0.51;
        const sparkleOffset = radius * 0.38;
        const sparkleX = projectedPoint.x + Math.cos(sparkleAngle) * sparkleOffset;
        const sparkleY = projectedPoint.y + Math.sin(sparkleAngle) * sparkleOffset;

        const sphereGradient = context.createRadialGradient(
          projectedPoint.x - radius * 0.35,
          projectedPoint.y - radius * 0.35,
          radius * 0.2,
          projectedPoint.x,
          projectedPoint.y,
          radius * 1.5,
        );

        sphereGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        sphereGradient.addColorStop(0.35, `rgba(${categoryColor.r},${categoryColor.g},${categoryColor.b},0.96)`);
        sphereGradient.addColorStop(1, `rgba(${categoryColor.r},${categoryColor.g},${categoryColor.b},0.2)`);

        const glowGradient = context.createRadialGradient(
          projectedPoint.x,
          projectedPoint.y,
          radius * 0.25,
          projectedPoint.x,
          projectedPoint.y,
          glowRadius,
        );

        glowGradient.addColorStop(0, `rgba(${categoryColor.r},${categoryColor.g},${categoryColor.b},${0.38 + depthFactor * 0.18})`);
        glowGradient.addColorStop(1, `rgba(${categoryColor.r},${categoryColor.g},${categoryColor.b},0)`);

        context.fillStyle = glowGradient;
        context.beginPath();
        context.arc(projectedPoint.x, projectedPoint.y, glowRadius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = sphereGradient;
        context.beginPath();
        context.arc(projectedPoint.x, projectedPoint.y, radius, 0, Math.PI * 2);
        context.fill();

        context.shadowBlur = 12 * depthFactor;
        context.shadowColor = `rgba(${categoryColor.r},${categoryColor.g},${categoryColor.b},${0.42 * depthFactor})`;
        context.beginPath();
        context.arc(projectedPoint.x, projectedPoint.y, radius * 0.72, 0, Math.PI * 2);
        context.fillStyle = `rgba(${categoryColor.r},${categoryColor.g},${categoryColor.b},${0.28 + depthFactor * 0.4})`;
        context.fill();

        context.beginPath();
        context.arc(sparkleX, sparkleY, Math.max(0.7, radius * 0.22), 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${0.38 + depthFactor * 0.36})`;
        context.fill();
        context.shadowBlur = 0;
      });

      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrame);
  }, [points, rotation.pitch, rotation.yaw, cubeSize]);

  const handleMouseDown = (event) => {
    event.preventDefault();
    setIsDragging(true);
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 bg-slate-950/85 border border-slate-800 rounded-xl px-2.5 py-2 space-y-1">
        <p className="text-[9px] text-slate-300 font-bold">{AXIS_LABELS.x}</p>
        <p className="text-[9px] text-slate-300 font-bold">{AXIS_LABELS.y}</p>
        <p className="text-[9px] text-slate-300 font-bold">{AXIS_LABELS.z}</p>
      </div>

      <div
        ref={wrapperRef}
        className={`relative w-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing ${canvasHeightClass}`}
        onMouseDown={handleMouseDown}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};

const VectorSpaceCloud = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-sm p-4 md:p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Box size={15} className="text-indigo-400" />
              <h3 className="text-sm font-black text-white tracking-tight">Interactive 3D Vector Widget</h3>
            </div>
            <p className="text-[11px] text-slate-400">Compact preview • Drag to rotate • Idle Y-axis auto spin</p>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
            title="Open enlarged view"
            aria-label="Open enlarged view"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        <VectorScene canvasHeightClass="h-[220px]" cubeSize={105} />
      </div>

      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center">
          <div className="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl p-5 md:p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Interactive 3D Vector Space</h3>
                <p className="text-xs text-slate-400 mt-1">Detailed mode for close inspection of semantic document spheres</p>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
                title="Close enlarged view"
                aria-label="Close enlarged view"
              >
                <X size={16} />
              </button>
            </div>

            <VectorScene canvasHeightClass="h-[380px] md:h-[500px]" cubeSize={145} />
          </div>
        </div>
      )}
    </>
  );
};

export default VectorSpaceCloud;
