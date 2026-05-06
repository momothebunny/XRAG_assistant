import { Box, Maximize2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { xragApi } from '../services/xragApi';
import { collectCategories, getCategoryColor } from '../utils/categoryColor';

const AXIS_LABELS = {
  x: 'X = Semantic Similarity',
  y: 'Y = Document Freshness',
  z: 'Z = Chunk Size (tokens)',
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
    color: point.color,
    doc: point.doc,
    origIndex: point.origIndex,
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

// ----- Document → 3D position mapping ----------------------------------
// X: semantic similarity proxy = category centroid + small intra-category jitter.
// Y: document freshness         = newest at top (negative Y in canvas space).
// Z: chunk size / token count   = larger doc -> closer to camera (+Z).


const hashString = (input) => {
  const str = String(input || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const estimateTokens = (doc) => {
  if (typeof doc.token_estimate === 'number') return doc.token_estimate;
  if (typeof doc.char_count === 'number' && doc.char_count > 0) {
    return Math.max(1, Math.round(doc.char_count / 4));
  }
  if (typeof doc.word_count === 'number' && doc.word_count > 0) {
    return Math.max(1, Math.round(doc.word_count * 1.3));
  }
  return Math.max(1, (doc.chunk_count || 1) * 200);
};

const computeDocumentPoints = (documents, cubeSize) => {
  if (!Array.isArray(documents) || documents.length === 0) return [];

  const categories = collectCategories(documents);
  const numCats = categories.length;

  // --- Category centroid layout -------------------------------------------
  // Place category centroids in a 2D (X, Z) disc using a golden-angle spiral
  // so that more categories -> more evenly spread, fewer categories -> tighter
  // cluster. We use (X, Z) for the spread so Y remains free for freshness.
  const GOLDEN_ANGLE = 2.399963; // radians ≈ 137.5°
  const catCentroid = new Map(); // cat -> {cx, cz}
  categories.forEach((cat, idx) => {
    if (numCats === 1) {
      catCentroid.set(cat, { cx: 0, cz: 0 });
      return;
    }
    // Normalized radius grows with index so inner categories are denser.
    const r = Math.sqrt((idx + 0.5) / numCats) * 0.72;
    const angle = idx * GOLDEN_ANGLE;
    catCentroid.set(cat, { cx: Math.cos(angle) * r, cz: Math.sin(angle) * r });
  });

  // --- Per-document intra-category spread ----------------------------------
  // Within a category, position documents along a small disc whose radius
  // reflects content diversity (subcategory offset + char-count variance).
  const catDocs = new Map();
  documents.forEach((doc) => {
    const key = doc.category || '__none__';
    if (!catDocs.has(key)) catDocs.set(key, []);
    catDocs.get(key).push(doc);
  });

  // Sub-centroid offset per subcategory inside a category.
  const subOffset = (cat, sub) => {
    if (!sub) return { sx: 0, sz: 0 };
    const siblings = [...(catDocs.get(cat) || [])].map((d) => d.subcategory).filter(Boolean);
    const uniq = [...new Set(siblings)];
    const idx = uniq.indexOf(sub);
    if (uniq.length <= 1) return { sx: 0, sz: 0 };
    const angle = (idx / uniq.length) * 2 * Math.PI;
    const subR = 0.18; // fraction of cubeSize reach
    return { sx: Math.cos(angle) * subR, sz: Math.sin(angle) * subR };
  };

  // Token/char normalisation for Z axis.
  const tokens = documents.map(estimateTokens);
  const minLog = Math.log(Math.max(1, Math.min(...tokens)));
  const maxLog = Math.log(Math.max(1, Math.max(...tokens)));
  const logSpan = Math.max(0.0001, maxLog - minLog);

  const now = Date.now();
  const FRESH_RANGE_MS = 548 * 24 * 60 * 60 * 1000; // ~18 months
  const reach = cubeSize * 0.84;

  return documents.map((doc, index) => {
    const seed = hashString(`${doc.id || ''}|${doc.name || ''}|${index}`);
    const color = getCategoryColor(doc.category);

    // --- X, Z: semantic position ---
    const cat = doc.category || null;
    const centroid = cat ? (catCentroid.get(cat) || { cx: 0, cz: 0 }) : { cx: 0, cz: 0 };
    const { sx, sz } = subOffset(cat, doc.subcategory);

    // Tiny deterministic jitter per document (avoids perfect overlap).
    const jitterScale = cat ? 0.055 : 0.38; // uncategorized spreads wider
    const jx = (((seed % 1000) / 1000) - 0.5) * jitterScale;
    const jz = ((((seed >> 10) % 1000) / 1000) - 0.5) * jitterScale;

    const rawX = centroid.cx + sx + jx;
    const rawZ = centroid.cz + sz + jz;
    const x = clamp(rawX, -1, 1) * reach;

    // --- Y: freshness (newest = top = negative Y) ---
    const created = doc.created_at || doc.updated_at || 0;
    let freshness = 0.5; // default: middle
    if (created > 0) {
      const ageMs = Math.max(0, now - created);
      freshness = 1 - Math.min(1, ageMs / FRESH_RANGE_MS);
    }
    const y = -((freshness * 2) - 1) * reach * 0.9;

    // --- Z: content richness (more tokens -> closer to camera) ---
    const t = tokens[index];
    const zNorm = ((Math.log(Math.max(1, t)) - minLog) / logSpan) * 2 - 1;
    const z = (clamp(rawZ, -1, 1) * reach * 0.35) + (zNorm * reach * 0.65);

    return {
      x,
      y,
      z,
      seed,
      category: cat,
      color: color.rgb,
      doc,
    };
  });
};

const VectorScene = ({ canvasHeightClass, cubeSize, points }) => {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, moved: false });
  const projectionsRef = useRef([]);
  const hoverPosRef = useRef({ x: 0, y: 0, inside: false });

  const [rotation, setRotation] = useState({ pitch: -18, yaw: 10 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [selected, setSelected] = useState(null); // { index, doc }

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

      const totalDX = event.clientX - dragStartRef.current.x;
      const totalDY = event.clientY - dragStartRef.current.y;
      if (Math.hypot(totalDX, totalDY) > 4) {
        dragStartRef.current.moved = true;
      }

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
        .map((point, idx) => rotatePoint({ ...point, origIndex: idx }, rotation.pitch, rotation.yaw))
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
        drawLine3D(context, scaledCubeVertices[fromIndex], scaledCubeVertices[toIndex], rect.width, rect.height, 'rgba(245,158,11,0.42)', 2.2);
        drawLine3D(context, scaledCubeVertices[fromIndex], scaledCubeVertices[toIndex], rect.width, rect.height, 'rgba(251,191,36,0.92)', 1.15);
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

      const newProjections = [];
      rotatedPoints.forEach((point) => {
        const projectedPoint = projectPoint(point, rect.width, rect.height);
        const categoryColor = point.color || { r: 148, g: 163, b: 184 };
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

        if (point.doc) {
          newProjections.push({
            x: projectedPoint.x,
            y: projectedPoint.y,
            radius,
            depth: point.z,
            point,
          });
        }
      });

      // Highlight ring around hovered/selected point.
      const drawRing = (target, color, lineWidth) => {
        if (!target) return;
        context.lineWidth = lineWidth;
        context.strokeStyle = color;
        context.beginPath();
        context.arc(target.x, target.y, target.radius + 4, 0, Math.PI * 2);
        context.stroke();
      };
      const findProjFor = (docId) => newProjections.find((p) => p.point.doc?.id === docId);
      if (selected) drawRing(findProjFor(selected.doc.id), 'rgba(255,255,255,0.95)', 2);
      const hoverProj = hoveredIndex >= 0 && points[hoveredIndex]?.doc
        ? findProjFor(points[hoveredIndex].doc.id)
        : null;
      if (hoverProj && (!selected || selected.doc.id !== hoverProj.point.doc.id)) {
        drawRing(hoverProj, 'rgba(255,255,255,0.7)', 1.5);
      }

      projectionsRef.current = newProjections;
      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrame);
  }, [points, rotation.pitch, rotation.yaw, cubeSize, hoveredIndex, selected]);

  // Hover hit-test loop (independent of render to avoid stale state).
  useEffect(() => {
    let raf = 0;
    const hitTest = () => {
      if (!isDragging && hoverPosRef.current.inside) {
        const { x, y } = hoverPosRef.current;
        const projections = projectionsRef.current;
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < projections.length; i += 1) {
          const p = projections[i];
          const dx = p.x - x;
          const dy = p.y - y;
          const d = Math.hypot(dx, dy);
          const hitR = p.radius + 6;
          if (d <= hitR && d < bestDist) {
            bestDist = d;
            bestIdx = p.point.origIndex ?? -1;
          }
        }
        setHoveredIndex((prev) => (prev === bestIdx ? prev : bestIdx));
      } else if (hoveredIndex !== -1) {
        setHoveredIndex(-1);
      }
      raf = requestAnimationFrame(hitTest);
    };
    raf = requestAnimationFrame(hitTest);
    return () => cancelAnimationFrame(raf);
  }, [isDragging, points, hoveredIndex]);

  const handleMouseDown = (event) => {
    event.preventDefault();
    setIsDragging(true);
    pointerRef.current = { x: event.clientX, y: event.clientY };
    dragStartRef.current = { x: event.clientX, y: event.clientY, moved: false };
  };

  const handleWrapperMouseMove = (event) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    hoverPosRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      inside: true,
    };
  };

  const handleWrapperMouseLeave = () => {
    hoverPosRef.current.inside = false;
  };

  const handleClick = () => {
    if (dragStartRef.current.moved) return;
    // Run a fresh hit-test instead of relying on hoveredIndex, because the
    // hover loop temporarily clears it while isDragging was true between
    // mousedown and mouseup.
    const { x, y, inside } = hoverPosRef.current;
    if (!inside) return;
    const projections = projectionsRef.current;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < projections.length; i += 1) {
      const p = projections[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= p.radius + 6 && d < bestDist) {
        bestDist = d;
        bestIdx = p.point.origIndex ?? -1;
      }
    }
    if (bestIdx >= 0 && points[bestIdx]?.doc) {
      const doc = points[bestIdx].doc;
      setSelected((prev) => (prev && prev.doc.id === doc.id ? null : { index: bestIdx, doc }));
    }
    // Clicking empty area inside the widget keeps the current selection;
    // it is cleared only when the user clicks outside the widget.
  };

  const hoveredPoint = hoveredIndex >= 0 ? points[hoveredIndex] : null;
  const hoverProjection = hoveredPoint && projectionsRef.current.find((p) => p.point.origIndex === hoveredIndex);

  const selectedPoint = selected ? points.find((p) => p.doc?.id === selected.doc.id) : null;
  const selectedProjection = selectedPoint
    ? projectionsRef.current.find((p) => p.point.doc?.id === selectedPoint.doc.id)
    : null;

  // Clear selection when clicking outside the widget.
  useEffect(() => {
    if (!selected) return undefined;
    const handleDocMouseDown = (event) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      if (!wrapper.contains(event.target)) {
        setSelected(null);
      }
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [selected]);

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 bg-slate-950/85 border border-slate-800 rounded-xl px-2.5 py-2 space-y-1">
        <p className="text-[9px] text-slate-300 font-bold">{AXIS_LABELS.x}</p>
        <p className="text-[9px] text-slate-300 font-bold">{AXIS_LABELS.y}</p>
        <p className="text-[9px] text-slate-300 font-bold">{AXIS_LABELS.z}</p>
      </div>

      <div
        ref={wrapperRef}
        className={`relative w-full rounded-xl overflow-hidden ${
          hoveredIndex >= 0 && !isDragging ? 'cursor-pointer' : 'cursor-grab'
        } active:cursor-grabbing ${canvasHeightClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleWrapperMouseMove}
        onMouseLeave={handleWrapperMouseLeave}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {hoveredPoint?.doc && hoverProjection && !isDragging && (!selected || selected.doc.id !== hoveredPoint.doc.id) && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xl whitespace-nowrap"
            style={{
              left: `${hoverProjection.x}px`,
              top: `${hoverProjection.y - (hoverProjection.radius + 8)}px`,
              borderLeft: `3px solid rgb(${hoveredPoint.color.r}, ${hoveredPoint.color.g}, ${hoveredPoint.color.b})`,
            }}
          >
            <div className="max-w-[260px] truncate">{hoveredPoint.doc.name}</div>
            <div className="text-[9px] text-slate-400 font-semibold">
              {hoveredPoint.category || 'Uncategorized'}
            </div>
          </div>
        )}

        {selectedPoint?.doc && selectedProjection && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-white/40 bg-slate-950/95 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xl whitespace-nowrap"
            style={{
              left: `${selectedProjection.x}px`,
              top: `${selectedProjection.y - (selectedProjection.radius + 8)}px`,
              borderLeft: `3px solid rgb(${selectedPoint.color.r}, ${selectedPoint.color.g}, ${selectedPoint.color.b})`,
            }}
          >
            <div className="max-w-[260px] truncate">{selectedPoint.doc.name}</div>
            <div className="text-[9px] text-slate-400 font-semibold">
              {selectedPoint.category || 'Uncategorized'}
            </div>
          </div>
        )}

        {selected?.doc && (
          <div className="absolute bottom-2 left-2 right-2 z-20 max-w-md rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] text-white shadow-xl backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                    style={{
                      background: `rgb(${getCategoryColor(selected.doc.category).rgb.r}, ${getCategoryColor(selected.doc.category).rgb.g}, ${getCategoryColor(selected.doc.category).rgb.b})`,
                    }}
                  />
                  <span className="font-black truncate">{selected.doc.name}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-semibold flex flex-wrap gap-x-2.5">
                  <span>{selected.doc.category || 'Uncategorized'}</span>
                  {selected.doc.subcategory && <span>· {selected.doc.subcategory}</span>}
                  <span>· {estimateTokens(selected.doc).toLocaleString()} tokens</span>
                  <span>· {selected.doc.chunk_count || 0} chunks</span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(null);
                }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white flex-shrink-0"
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const VectorSpaceCloud = ({ documents: documentsProp = null, refreshKey = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fetchedDocuments, setFetchedDocuments] = useState([]);

  // If parent provides documents use those, otherwise self-fetch.
  useEffect(() => {
    if (documentsProp) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const list = await xragApi.listKnowledgeDocuments();
        if (!cancelled) setFetchedDocuments(list);
      } catch {
        if (!cancelled) setFetchedDocuments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentsProp, refreshKey]);

  const documents = documentsProp || fetchedDocuments;

  const compactPoints = useMemo(() => computeDocumentPoints(documents, 105), [documents]);
  const expandedPoints = useMemo(() => computeDocumentPoints(documents, 145), [documents]);

  // Build legend: unique top-level categories with their colors + counts.
  const legend = useMemo(() => {
    const counts = new Map();
    documents.forEach((doc) => {
      const key = doc.category || '__uncategorized__';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const items = [];
    counts.forEach((count, key) => {
      const isUncat = key === '__uncategorized__';
      const color = getCategoryColor(isUncat ? null : key);
      items.push({
        key,
        label: isUncat ? 'Uncategorized' : key,
        count,
        rgb: color.rgb,
      });
    });
    items.sort((a, b) => b.count - a.count);
    return items;
  }, [documents]);

  const docCount = documents.length;

  return (
    <>
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-sm p-4 md:p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Box size={15} className="text-indigo-400" />
              <h3 className="text-sm font-black text-white tracking-tight">Interactive 3D Vector Widget</h3>
            </div>
            <p className="text-[11px] text-slate-400">
              {docCount > 0
                ? `${docCount} dokumentum • Drag to rotate • Idle Y-axis auto spin`
                : 'No documents yet • Drag to rotate • Idle Y-axis auto spin'}
            </p>
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

        <VectorScene canvasHeightClass="h-[220px]" cubeSize={105} points={compactPoints} />

        {legend.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {legend.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-slate-200"
                title={`${item.label}: ${item.count} dok`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: `rgb(${item.rgb.r}, ${item.rgb.g}, ${item.rgb.b})` }}
                />
                <span className="truncate max-w-[140px]">{item.label}</span>
                <span className="text-slate-400">· {item.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center">
          <div className="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl p-5 md:p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Interactive 3D Vector Space</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {docCount} dokumentum • X = szemantikai hasonlóság (kategória) • Y = frissesség • Z = chunk méret (token)
                </p>
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

            <VectorScene canvasHeightClass="h-[380px] md:h-[500px]" cubeSize={145} points={expandedPoints} />

            {legend.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {legend.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-[11px] font-bold text-slate-200"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: `rgb(${item.rgb.r}, ${item.rgb.g}, ${item.rgb.b})` }}
                    />
                    <span className="truncate max-w-[200px]">{item.label}</span>
                    <span className="text-slate-400">· {item.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default VectorSpaceCloud;
