import {
  Background,
  Controls,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getSmoothStepPath,
  getStraightPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileInput,
  FolderOpen,
  Layers,
  Link2,
  Loader2,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DocumentSettingsPanel from '../canvas/DocumentSettingsPanel';
import UploadedDocumentsSettingsPanel from '../canvas/UploadedDocumentsSettingsPanel';
import ChunkingSettingsPanel from '../canvas/ChunkingSettingsPanel';
import EmbeddingSettingsPanel from '../canvas/EmbeddingSettingsPanel';
import VectorDatabaseSettingsPanel from '../canvas/VectorDatabaseSettingsPanel';
import GraphDatabaseSettingsPanel from '../canvas/GraphDatabaseSettingsPanel';
import RetrieverSettingsPanel from '../canvas/RetrieverSettingsPanel';
import RerankerSettingsPanel from '../canvas/RerankerSettingsPanel';
import LLMSettingsPanel from '../canvas/LLMSettingsPanel';
import SystemPromptSettingsPanel from '../canvas/SystemPromptSettingsPanel';
import ResponseSettingsPanel from '../canvas/ResponseSettingsPanel';
import UserSettingsPanel from '../canvas/UserSettingsPanel';
import QuestionSettingsPanel from '../canvas/QuestionSettingsPanel';
import UrlScraperSettingsPanel from '../canvas/UrlScraperSettingsPanel';
import QueryRewriterSettingsPanel from '../canvas/QueryRewriterSettingsPanel';
import HybridMergeSettingsPanel from '../canvas/HybridMergeSettingsPanel';
import ContextCompressionSettingsPanel from '../canvas/ContextCompressionSettingsPanel';
import HallucinationGuardSettingsPanel from '../canvas/HallucinationGuardSettingsPanel';
import ReflectionLoopSettingsPanel from '../canvas/ReflectionLoopSettingsPanel';
import KVSessionStoreSettingsPanel from '../canvas/KVSessionStoreSettingsPanel';
import HyDEGenSettingsPanel from '../canvas/HyDEGenSettingsPanel';
import ModelRouterSettingsPanel from '../canvas/ModelRouterSettingsPanel';
import GuardrailsSettingsPanel from '../canvas/GuardrailsSettingsPanel';
import PiiRedactionSettingsPanel from '../canvas/PIIRedactionSettingsPanel';
import ImageUploadSettingsPanel from '../canvas/ImageUploadSettingsPanel';
import VisionLLMSettingsPanel from '../canvas/VisionLLMSettingsPanel';
import { profileFromEmbeddingConfig } from '../canvas/embeddingModels';
import {
  DOCUMENT_UPLOAD_JSON_SCHEMA,
  buildDocumentUploadChunkingPayload,
} from '../../data/documentUploadSchema';
import {
  BASIC_BLUEPRINT_ID,
  QUESTION_TEMPLATE_KEY,
  RAG_BLUEPRINTS,
  SUBGRAPH_TEMPLATE_KEY,
  USER_TEMPLATE_KEY,
  buildNodeData,
  getPreviewBackdropTheme,
  groupedNodeLibrary,
  visibleNodeLibrary,
  templateByKey,
  registerCustomTemplate,
  unregisterCustomTemplate,
  CUSTOM_NODE_ICON_MAP,
} from './canvas/canvasConfig';
import { saveUserSharedFlow } from '../../data/sharedFlows';
import CanvasBoardErrorBoundary from './canvas/CanvasBoardErrorBoundary';
import { isPreviewElementId, nodeTypes, paletteFromColorClass } from './canvas/nodeTypes';
import { edgeTypes } from './canvas/edgeTypes';
import CanvasConnectionLine from './canvas/CanvasConnectionLine';
import CustomNodeEditorModal from './canvas/CustomNodeEditorModal';
import CustomNodeSettingsPanel from './canvas/CustomNodeSettingsPanel';
import { xragApi } from '../../services/xragApi';

const BLUEPRINT_FLOW_ID_SET = new Set(
  RAG_BLUEPRINTS.map((item) => item.backendFlowId).filter(Boolean)
);

const createPairLink = (sourceNode, targetNode) => {
  if (!sourceNode || !targetNode) {
    return [sourceNode, targetNode];
  }

  return [
    {
      ...sourceNode,
      data: {
        ...sourceNode.data,
        pairNodeId: targetNode.id,
      },
    },
    {
      ...targetNode,
      data: {
        ...targetNode.data,
        pairNodeId: sourceNode.id,
      },
    },
  ];
};

const attachUserQuestionPairMetadata = (nodes, orderedTemplateKeys) => {
  const pairedNodes = [...nodes];

  for (let index = 0; index < orderedTemplateKeys.length - 1; index += 1) {
    if (orderedTemplateKeys[index] !== USER_TEMPLATE_KEY || orderedTemplateKeys[index + 1] !== QUESTION_TEMPLATE_KEY) {
      continue;
    }

    const userNode = pairedNodes[index];
    const questionNode = pairedNodes[index + 1];
    const linked = createPairLink(userNode, questionNode);
    pairedNodes[index] = linked[0];
    pairedNodes[index + 1] = linked[1];
  }

  return pairedNodes;
};

const getCascadeDeleteNodeIds = (nodeId, allNodes) => {
  const result = new Set([nodeId]);
  const targetNode = allNodes.find((node) => node.id === nodeId);
  const pairNodeId = targetNode?.data?.pairNodeId;
  if (pairNodeId) {
    result.add(pairNodeId);
  }

  return result;
};

// Live viewport indicator inside our custom mini-map. Subscribes to React
// Flow's transform store + container dimensions so the rectangle reflects
// the user's current pan/zoom in real time.
const MinimapViewportRect = () => {
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  if (!Array.isArray(transform) || transform.length < 3 || !width || !height) {
    return null;
  }
  const [tx, ty, zoom] = transform;
  if (!zoom) return null;
  // The visible viewport in flow coordinates:
  //   flowX = (screenX - tx) / zoom
  // So the visible flow rect is [-tx/zoom, -ty/zoom, width/zoom, height/zoom]
  const x = -tx / zoom;
  const y = -ty / zoom;
  const w = width / zoom;
  const h = height / zoom;
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="rgba(99, 102, 241, 0.08)"
      stroke="rgba(79, 70, 229, 0.7)"
      strokeWidth={Math.max(w, h) * 0.004}
      style={{ pointerEvents: 'none' }}
    />
  );
};

const isUserNode = (node) => node?.data?.templateKey === USER_TEMPLATE_KEY;
const isQuestionNode = (node) => node?.data?.templateKey === QUESTION_TEMPLATE_KEY;

// Returns true iff the source node's declared output types intersect with the
// target node's declared input types according to the backend's NodeSpec
// registry. Falls back to "allowed" when the descriptor map is empty (e.g. the
// backend hasn't loaded yet) so the UI never blocks the user with a stale map.
const areTypesCompatible = (sourceNode, targetNode, typeMap) => {
  if (!typeMap || Object.keys(typeMap).length === 0) {
    return true;
  }

  const sourceSpec = typeMap[sourceNode?.data?.templateKey];
  const targetSpec = typeMap[targetNode?.data?.templateKey];

  if (!sourceSpec || !targetSpec) {
    return true;
  }

  const sourceOutputs = sourceSpec.outputs || [];
  const targetInputs = targetSpec.inputs || [];

  if (sourceOutputs.length === 0 || targetInputs.length === 0) {
    return false;
  }

  return sourceOutputs.some((outType) => targetInputs.includes(outType));
};

// Canonical RAG pipeline rank — used by the "magnet" logic to ensure edges
// always point in the data-flow direction regardless of how the user dragged.
// Lower rank = earlier in the pipeline. Nodes not in this map are treated as
// rank-less and keep the user's chosen orientation.
const CANONICAL_PIPELINE_RANK = {
  'user-actor': 0,
  'input-question': 1,
  'input-upload': 1,
  'input-url': 1,
  'process-cleaning': 2,
  'process-chunking': 3,
  'process-embedding': 4,
  'storage-vector': 5,
  'storage-graph': 5,
  'process-query-rewriter': 6,
  'brain-hyde-gen': 6,
  'process-retriever': 7,
  'process-hybrid-merge': 8,
  'process-reranker': 9,
  'process-context-compression': 10,
  'process-pii-redaction': 11,
  'input-system-prompt': 12,
  'brain-router': 12,
  'brain-llm': 13,
  'brain-guardrails': 14,
  'process-hallucination-guard': 15,
  'process-reflection-loop': 16,
  'output-response': 18,
};

const isConnectionAllowed = (connection, allNodes, typeMap = null) => {
  const sourceNode = allNodes.find((node) => node.id === connection.source);
  const targetNode = allNodes.find((node) => node.id === connection.target);

  if (!sourceNode || !targetNode) {
    return false;
  }

  if (sourceNode.id === targetNode.id) {
    return false;
  }

  if (isUserNode(targetNode)) {
    return false;
  }

  if (isUserNode(sourceNode)) {
    const pairNodeId = sourceNode.data?.pairNodeId;
    return Boolean(pairNodeId && pairNodeId === targetNode.id && isQuestionNode(targetNode));
  }

  if (typeMap && !areTypesCompatible(sourceNode, targetNode, typeMap)) {
    return false;
  }

  return true;
};

const EDGE_BASE_STYLE = { strokeWidth: 2 };
const EDGE_SELECTED_STYLE = {
  strokeWidth: 3,
};

const NODE_WIDTH = 188;
const NODE_HEIGHT = 74;
const MIN_INSERT_SPACING_X = 232;
const MIN_INSERT_SPACING_Y = 175;
const BLUEPRINT_BASE_SPACING_X = 202;
const BLUEPRINT_ROW_SPACING_Y = 180;
const BLUEPRINT_LANE_OFFSET_Y = 80;
const EDGE_PATH_BUFFER = 18;
const BLUEPRINT_LAYOUT_PASSES = 3;
const EDGE_CLEARANCE_BUFFER = 72;
const SIDE_NAMES = ['left', 'right', 'top', 'bottom'];

const getBlueprintLaneIndex = (templateKey) => {
  if (templateKey === 'user-actor' || templateKey === 'input-question' || templateKey.startsWith('input-')) {
    return 0;
  }

  if (templateKey.startsWith('process-')) {
    return 1;
  }

  if (templateKey.startsWith('storage-')) {
    return 2;
  }

  if (templateKey.startsWith('brain-') || templateKey === 'output-response' || templateKey.startsWith('output-')) {
    return 3;
  }

  return 1;
};

const getBlueprintPhaseIndex = (templateKey) => {
  if (templateKey === 'user-actor' || templateKey === 'input-question' || templateKey.startsWith('input-')) {
    return 0;
  }

  if (templateKey.startsWith('process-')) {
    return 1;
  }

  if (templateKey.startsWith('storage-')) {
    return 2;
  }

  if (templateKey.startsWith('brain-') || templateKey === 'output-response' || templateKey.startsWith('output-')) {
    return 3;
  }

  return 1;
};

const getDirectionalHandles = (sourcePosition, targetPosition) => {
  const dx = targetPosition.x - sourcePosition.x;
  const dy = targetPosition.y - sourcePosition.y;

  if (Math.abs(dy) > Math.abs(dx)) {
    return {
      sourceHandle: dy >= 0 ? 'source-bottom' : 'source-top',
      targetHandle: dy >= 0 ? 'target-top' : 'target-bottom',
    };
  }

  return {
    sourceHandle: dx >= 0 ? 'source-right' : 'source-left',
    targetHandle: dx >= 0 ? 'target-left' : 'target-right',
  };
};

const getOrderedSides = (preferredSide) => {
  if (!preferredSide) {
    return SIDE_NAMES;
  }

  return [preferredSide, ...SIDE_NAMES.filter((side) => side !== preferredSide)];
};

const getEdgeEndpointSide = (edge, endpointType) => {
  const handleId = endpointType === 'source' ? edge.sourceHandle : edge.targetHandle;
  const parsedSide = parseSideFromHandleId(handleId);
  if (parsedSide) {
    return parsedSide;
  }

  return endpointType === 'source' ? 'right' : 'left';
};

const buildNodeSideUsageMap = (existingEdges) => {
  const usageMap = new Map();

  existingEdges.forEach((edge) => {
    if (!edge.source || !edge.target) {
      return;
    }

    const sourceSide = getEdgeEndpointSide(edge, 'source');
    const targetSide = getEdgeEndpointSide(edge, 'target');
    const sourceKey = `${edge.source}:${sourceSide}`;
    const targetKey = `${edge.target}:${targetSide}`;

    usageMap.set(sourceKey, (usageMap.get(sourceKey) || 0) + 1);
    usageMap.set(targetKey, (usageMap.get(targetKey) || 0) + 1);
  });

  return usageMap;
};

const getUsagePenalty = (usageMap, sourceNodeId, sourceSide, targetNodeId, targetSide) => {
  const sourceUsage = usageMap.get(`${sourceNodeId}:${sourceSide}`) || 0;
  const targetUsage = usageMap.get(`${targetNodeId}:${targetSide}`) || 0;

  return (sourceUsage + targetUsage) * 900;
};

const buildObstacleRectsForPair = (allNodes, sourceNodeId, targetNodeId) => {
  return allNodes
    .filter((node) => node.id !== sourceNodeId && node.id !== targetNodeId)
    .map((node) => getNodeRect(node));
};

const chooseBestHandlePair = ({
  sourceNode,
  targetNode,
  existingEdges,
  preferredSourceSide,
  preferredTargetSide,
  obstacleRects = [],
  enforcePreferred = false,
}) => {
  // When the user explicitly picks both handles (e.g. dropping a connection on a
  // specific handle), respect that choice absolutely instead of letting routing
  // heuristics override it.
  if (enforcePreferred && preferredSourceSide && preferredTargetSide) {
    return {
      sourceHandle: `source-${preferredSourceSide}`,
      targetHandle: `target-${preferredTargetSide}`,
    };
  }

  const sourceRect = getNodeRect(sourceNode);
  const targetRect = getNodeRect(targetNode);
  const usageMap = buildNodeSideUsageMap(existingEdges);

  const sourceSides = getOrderedSides(preferredSourceSide);
  const targetSides = getOrderedSides(preferredTargetSide);

  let bestCandidate = null;

  sourceSides.forEach((sourceSide) => {
    targetSides.forEach((targetSide) => {
      const start = getSidePoint(sourceRect, sourceSide);
      const end = getSidePoint(targetRect, targetSide);
      const manhattan = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
      const sourcePenalty = preferredSourceSide
        ? sourceSide === preferredSourceSide
          ? 0
          : 3000
        : sourceSide === preferredSourceSide
        ? 0
        : 120;
      const targetPenalty = preferredTargetSide
        ? targetSide === preferredTargetSide
          ? 0
          : 3000
        : targetSide === preferredTargetSide
        ? 0
        : 140;
      const usagePenalty = getUsagePenalty(usageMap, sourceNode.id, sourceSide, targetNode.id, targetSide);

      let intersectionPenalty = 0;
      if (obstacleRects.length > 0) {
        const horizontalPath = buildOrthogonalPath(start, end, 'horizontal-first');
        const verticalPath = buildOrthogonalPath(start, end, 'vertical-first');
        const horizontalIntersections = countPathIntersections(horizontalPath, obstacleRects);
        const verticalIntersections = countPathIntersections(verticalPath, obstacleRects);
        intersectionPenalty = Math.min(horizontalIntersections, verticalIntersections) * 3000;
      }

      const score = manhattan + sourcePenalty + targetPenalty + usagePenalty + intersectionPenalty;

      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { sourceSide, targetSide, score };
      }
    });
  });

  return {
    sourceHandle: `source-${bestCandidate?.sourceSide || preferredSourceSide || 'right'}`,
    targetHandle: `target-${bestCandidate?.targetSide || preferredTargetSide || 'left'}`,
  };
};

const isPositionTooClose = (candidate, node) => {
  const dx = Math.abs(candidate.x - node.position.x);
  const dy = Math.abs(candidate.y - node.position.y);
  return dx < MIN_INSERT_SPACING_X && dy < MIN_INSERT_SPACING_Y;
};

const getNodeCenter = (node) => {
  const rect = getNodeRect(node);
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const getCandidateClearanceScore = (candidate, existingNodes) => {
  if (existingNodes.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const candidateCenter = {
    x: candidate.x + NODE_WIDTH / 2,
    y: candidate.y + NODE_HEIGHT / 2,
  };

  let nearestDistance = Number.POSITIVE_INFINITY;

  existingNodes.forEach((node) => {
    const nodeCenter = getNodeCenter(node);
    const dx = candidateCenter.x - nodeCenter.x;
    const dy = candidateCenter.y - nodeCenter.y;
    const distance = Math.hypot(dx, dy);
    if (distance < nearestDistance) {
      nearestDistance = distance;
    }
  });

  return nearestDistance;
};

const isCandidateBlocked = (candidate, existingNodes, blockedRects) => {
  const candidateRect = {
    left: candidate.x,
    top: candidate.y,
    right: candidate.x + NODE_WIDTH,
    bottom: candidate.y + NODE_HEIGHT,
  };

  const hasCollision = existingNodes.some((node) => isPositionTooClose(candidate, node));
  if (hasCollision) {
    return true;
  }

  return blockedRects.some((rect) => {
    const overlapsX = candidateRect.right >= rect.left && candidateRect.left <= rect.right;
    const overlapsY = candidateRect.bottom >= rect.top && candidateRect.top <= rect.bottom;
    return overlapsX && overlapsY;
  });
};

const findAvailableInsertPosition = (preferredPosition, existingNodes, blockedRects = []) => {
  const candidateOffsets = [
    { x: 0, y: 0 },
    { x: MIN_INSERT_SPACING_X, y: 0 },
    { x: -MIN_INSERT_SPACING_X, y: 0 },
    { x: 0, y: Math.round(MIN_INSERT_SPACING_Y * 0.6) },
    { x: 0, y: -Math.round(MIN_INSERT_SPACING_Y * 0.6) },
    { x: MIN_INSERT_SPACING_X, y: Math.round(MIN_INSERT_SPACING_Y * 0.6) },
    { x: MIN_INSERT_SPACING_X, y: -Math.round(MIN_INSERT_SPACING_Y * 0.6) },
    { x: -MIN_INSERT_SPACING_X, y: Math.round(MIN_INSERT_SPACING_Y * 0.6) },
    { x: -MIN_INSERT_SPACING_X, y: -Math.round(MIN_INSERT_SPACING_Y * 0.6) },
  ];

  let bestCandidate = null;

  for (let ring = 0; ring < 8; ring += 1) {
    for (let index = 0; index < candidateOffsets.length; index += 1) {
      const offset = candidateOffsets[index];
      const multiplier = ring + Math.floor(index / 3);
      const candidate = {
        x: preferredPosition.x + offset.x * Math.max(1, multiplier),
        y: preferredPosition.y + offset.y * Math.max(1, multiplier),
      };

      if (isCandidateBlocked(candidate, existingNodes, blockedRects)) {
        continue;
      }

      const clearanceScore = getCandidateClearanceScore(candidate, existingNodes);
      const preferredDistance = Math.hypot(candidate.x - preferredPosition.x, candidate.y - preferredPosition.y);
      const score = preferredDistance * 2 - clearanceScore * 0.2;

      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { candidate, score };
      }
    }
  }

  if (bestCandidate) {
    return bestCandidate.candidate;
  }

  for (let ring = 8; ring < 16; ring += 1) {
    for (let index = 0; index < candidateOffsets.length; index += 1) {
      const offset = candidateOffsets[index];
      const multiplier = ring + Math.floor(index / 3);
      const candidate = {
        x: preferredPosition.x + offset.x * Math.max(1, multiplier),
        y: preferredPosition.y + offset.y * Math.max(1, multiplier),
      };

      if (!isCandidateBlocked(candidate, existingNodes, blockedRects)) {
        return candidate;
      }
    }
  }

  return {
    x: preferredPosition.x + MIN_INSERT_SPACING_X,
    y: preferredPosition.y,
  };
};

const getNodeRect = (node) => {
  const width = node.measured?.width || NODE_WIDTH;
  const height = node.measured?.height || NODE_HEIGHT;

  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
    width,
    height,
  };
};

const getSidePoint = (rect, side) => {
  if (side === 'left') {
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }

  if (side === 'right') {
    return { x: rect.right, y: rect.top + rect.height / 2 };
  }

  if (side === 'top') {
    return { x: rect.left + rect.width / 2, y: rect.top };
  }

  return { x: rect.left + rect.width / 2, y: rect.bottom };
};

const parseSideFromHandleId = (handleId) => {
  if (!handleId) {
    return null;
  }

  const parts = String(handleId).split('-');
  return parts[1] || null;
};

const getNearestSideToPoint = (rect, point) => {
  const distances = [
    { side: 'left', value: Math.abs(point.x - rect.left) },
    { side: 'right', value: Math.abs(point.x - rect.right) },
    { side: 'top', value: Math.abs(point.y - rect.top) },
    { side: 'bottom', value: Math.abs(point.y - rect.bottom) },
  ];

  distances.sort((a, b) => a.value - b.value);
  return distances[0].side;
};

const buildOrthogonalPath = (start, end, mode) => {
  if (mode === 'horizontal-first') {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
};

const getRectBounds = (rects) => {
  if (rects.length === 0) {
    return null;
  }

  return rects.reduce(
    (accumulator, rect) => ({
      left: Math.min(accumulator.left, rect.left),
      top: Math.min(accumulator.top, rect.top),
      right: Math.max(accumulator.right, rect.right),
      bottom: Math.max(accumulator.bottom, rect.bottom),
    }),
    {
      left: rects[0].left,
      top: rects[0].top,
      right: rects[0].right,
      bottom: rects[0].bottom,
    }
  );
};

const getNodeGapMargins = (obstacleRects) => {
  const bounds = getRectBounds(obstacleRects);
  if (!bounds) {
    return null;
  }

  const topLane = bounds.top - EDGE_CLEARANCE_BUFFER;
  const bottomLane = bounds.bottom + EDGE_CLEARANCE_BUFFER;
  const leftLane = bounds.left - EDGE_CLEARANCE_BUFFER;
  const rightLane = bounds.right + EDGE_CLEARANCE_BUFFER;

  return {
    topLane,
    bottomLane,
    leftLane,
    rightLane,
  };
};

const buildDetourPath = (start, end, obstacleRects, preferredMode = 'horizontal') => {
  const laneMargins = getNodeGapMargins(obstacleRects);
  if (!laneMargins) {
    return buildOrthogonalPath(start, end, preferredMode === 'horizontal' ? 'horizontal-first' : 'vertical-first');
  }

  const expandedObstacles = obstacleRects.map((rect) => ({
    left: rect.left - EDGE_CLEARANCE_BUFFER,
    top: rect.top - EDGE_CLEARANCE_BUFFER,
    right: rect.right + EDGE_CLEARANCE_BUFFER,
    bottom: rect.bottom + EDGE_CLEARANCE_BUFFER,
  }));

  const outerCandidates = [];
  const laneSteps = [0, 1, 2, 3, 4, 5];

  laneSteps.forEach((step) => {
    const topLane = laneMargins.topLane - step * EDGE_CLEARANCE_BUFFER;
    const bottomLane = laneMargins.bottomLane + step * EDGE_CLEARANCE_BUFFER;
    const leftLane = laneMargins.leftLane - step * EDGE_CLEARANCE_BUFFER;
    const rightLane = laneMargins.rightLane + step * EDGE_CLEARANCE_BUFFER;

    outerCandidates.push(
      [start, { x: start.x, y: topLane }, { x: end.x, y: topLane }, end],
      [start, { x: start.x, y: bottomLane }, { x: end.x, y: bottomLane }, end],
      [start, { x: leftLane, y: start.y }, { x: leftLane, y: end.y }, end],
      [start, { x: rightLane, y: start.y }, { x: rightLane, y: end.y }, end]
    );
  });

  const scored = outerCandidates.map((pathPoints) => ({
    pathPoints,
    intersections: countPathIntersections(pathPoints, expandedObstacles),
    length: pathPoints.reduce((total, point, index) => {
      if (index === 0) {
        return 0;
      }

      const previous = pathPoints[index - 1];
      return total + Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y);
    }, 0),
  }));

  scored.sort((a, b) => {
    if (a.intersections !== b.intersections) {
      return a.intersections - b.intersections;
    }

    return a.length - b.length;
  });

  const zeroIntersectionPath = scored.find((candidate) => candidate.intersections === 0);
  if (zeroIntersectionPath) {
    return zeroIntersectionPath.pathPoints;
  }

  return scored[0].pathPoints;
};

const segmentIntersectsRect = (start, end, rect) => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const intersectsX = maxX >= rect.left && minX <= rect.right;
  const intersectsY = maxY >= rect.top && minY <= rect.bottom;

  return intersectsX && intersectsY;
};

const countPathIntersections = (pathPoints, obstacleRects) => {
  let count = 0;

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const start = pathPoints[index];
    const end = pathPoints[index + 1];

    obstacleRects.forEach((rect) => {
      if (segmentIntersectsRect(start, end, rect)) {
        count += 1;
      }
    });
  }

  return count;
};

const buildPathCorridorRects = (pathPoints, buffer = EDGE_PATH_BUFFER) => {
  const segments = [];

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const start = pathPoints[index];
    const end = pathPoints[index + 1];

    segments.push({
      left: Math.min(start.x, end.x) - buffer,
      top: Math.min(start.y, end.y) - buffer,
      right: Math.max(start.x, end.x) + buffer,
      bottom: Math.max(start.y, end.y) + buffer,
    });
  }

  return segments;
};

const buildEdgePathPoints = (edge, allNodes) => {
  const sourceNode = allNodes.find((node) => node.id === edge.source);
  const targetNode = allNodes.find((node) => node.id === edge.target);
  if (!sourceNode || !targetNode) {
    return null;
  }

  const sourceRect = getNodeRect(sourceNode);
  const targetRect = getNodeRect(targetNode);
  const sourceSide = getEdgeEndpointSide(edge, 'source');
  const targetSide = getEdgeEndpointSide(edge, 'target');
  const start = getSidePoint(sourceRect, sourceSide);
  const end = getSidePoint(targetRect, targetSide);

  const obstacleRects = allNodes
    .filter((node) => node.id !== sourceNode.id && node.id !== targetNode.id)
    .map((node) => getNodeRect(node));

  const expandedObstacleRects = obstacleRects.map((rect) => ({
    left: rect.left - EDGE_CLEARANCE_BUFFER,
    top: rect.top - EDGE_CLEARANCE_BUFFER,
    right: rect.right + EDGE_CLEARANCE_BUFFER,
    bottom: rect.bottom + EDGE_CLEARANCE_BUFFER,
  }));

  const directHorizontal = buildOrthogonalPath(start, end, 'horizontal-first');
  const directVertical = buildOrthogonalPath(start, end, 'vertical-first');
  const directCandidates = [directHorizontal, directVertical].map((pathPoints) => ({
    pathPoints,
    intersections: countPathIntersections(pathPoints, expandedObstacleRects),
    length: pathPoints.reduce((total, point, index) => {
      if (index === 0) {
        return 0;
      }

      const previous = pathPoints[index - 1];
      return total + Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y);
    }, 0),
  }));

  directCandidates.sort((a, b) => {
    if (a.intersections !== b.intersections) {
      return a.intersections - b.intersections;
    }

    return a.length - b.length;
  });

  if (directCandidates[0].intersections === 0) {
    return directCandidates[0].pathPoints;
  }

  return buildDetourPath(start, end, obstacleRects, Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'horizontal' : 'vertical');
};

const buildEdgeCorridorRects = (edges, allNodes, excludedNodeId = null) => {
  const corridors = [];

  edges.forEach((edge) => {
    if (!edge.source || !edge.target) {
      return;
    }

    if (excludedNodeId && (edge.source === excludedNodeId || edge.target === excludedNodeId)) {
      return;
    }

    const pathPoints = buildEdgePathPoints(edge, allNodes);
    if (!pathPoints) {
      return;
    }

    corridors.push(...buildPathCorridorRects(pathPoints));
  });

  return corridors;
};

const EDGE_ALIGNMENT_TOLERANCE = 14;

const isHorizontalHandlePair = (sourceSide, targetSide) =>
  (sourceSide === 'right' && targetSide === 'left') ||
  (sourceSide === 'left' && targetSide === 'right');

const isVerticalHandlePair = (sourceSide, targetSide) =>
  (sourceSide === 'bottom' && targetSide === 'top') ||
  (sourceSide === 'top' && targetSide === 'bottom');

const pickEdgeRoutingType = (sourceNode, targetNode, sourceHandle, targetHandle) => {
  if (!sourceNode || !targetNode) {
    return 'step';
  }
  const sourceSide = parseSideFromHandleId(sourceHandle);
  const targetSide = parseSideFromHandleId(targetHandle);
  if (!sourceSide || !targetSide) {
    return 'step';
  }
  const sourcePoint = getSidePoint(getNodeRect(sourceNode), sourceSide);
  const targetPoint = getSidePoint(getNodeRect(targetNode), targetSide);
  if (
    isHorizontalHandlePair(sourceSide, targetSide) &&
    Math.abs(sourcePoint.y - targetPoint.y) <= EDGE_ALIGNMENT_TOLERANCE
  ) {
    return 'straight';
  }
  if (
    isVerticalHandlePair(sourceSide, targetSide) &&
    Math.abs(sourcePoint.x - targetPoint.x) <= EDGE_ALIGNMENT_TOLERANCE
  ) {
    return 'straight';
  }
  return 'step';
};

const makeEdgePayload = ({ type, ...payload }) => ({
  id: `edge-${Date.now()}-${Math.round(Math.random() * 100000)}`,
  ...payload,
  animated: true,
  type: type || 'step',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706' },
  style: { strokeWidth: 2.6, stroke: '#d97706' },
});

const buildBlueprintEdges = (blueprintNodes, existingNodes = [], existingEdges = []) => {
  const blueprintEdges = [];
  const allNodesForRouting = [...existingNodes, ...blueprintNodes];

  blueprintNodes.slice(0, -1).forEach((node, index) => {
    const nextNode = blueprintNodes[index + 1];
    const directionalHandles = getDirectionalHandles(node.position, nextNode.position);
    const obstacleRects = buildObstacleRectsForPair(allNodesForRouting, node.id, nextNode.id);
    const resolvedHandles = chooseBestHandlePair({
      sourceNode: node,
      targetNode: nextNode,
      existingEdges: [...existingEdges, ...blueprintEdges],
      preferredSourceSide: parseSideFromHandleId(directionalHandles.sourceHandle),
      preferredTargetSide: parseSideFromHandleId(directionalHandles.targetHandle),
      obstacleRects,
    });

    blueprintEdges.push(
      makeEdgePayload({
        source: node.id,
        sourceHandle: resolvedHandles.sourceHandle,
        target: nextNode.id,
        targetHandle: resolvedHandles.targetHandle,
        type: pickEdgeRoutingType(node, nextNode, resolvedHandles.sourceHandle, resolvedHandles.targetHandle),
      })
    );
  });

  return blueprintEdges;
};

const moveBlueprintNodesOffEdges = (blueprintNodes, blueprintEdges, existingNodes = [], existingEdges = []) => {
  const adjustedNodes = blueprintNodes.map((node) => ({
    ...node,
    position: { ...node.position },
  }));

  for (let pass = 0; pass < BLUEPRINT_LAYOUT_PASSES; pass += 1) {
    let movedAnyNode = false;

    adjustedNodes.forEach((node, index) => {
      const otherAdjustedNodes = adjustedNodes.filter((candidate, candidateIndex) => candidateIndex !== index);
      const allNodes = [...existingNodes, ...otherAdjustedNodes, node];
      const allEdges = [...existingEdges, ...blueprintEdges];
      const blockedPathRects = buildEdgeCorridorRects(allEdges, allNodes, node.id);

      const currentRect = {
        left: node.position.x,
        top: node.position.y,
        right: node.position.x + NODE_WIDTH,
        bottom: node.position.y + NODE_HEIGHT,
      };

      const overlapsPath = blockedPathRects.some((rect) => {
        const overlapsX = currentRect.right >= rect.left && currentRect.left <= rect.right;
        const overlapsY = currentRect.bottom >= rect.top && currentRect.top <= rect.bottom;
        return overlapsX && overlapsY;
      });

      if (!overlapsPath) {
        return;
      }

      const safePosition = findAvailableInsertPosition(node.position, [...existingNodes, ...otherAdjustedNodes], blockedPathRects);
      if (safePosition.x !== node.position.x || safePosition.y !== node.position.y) {
        movedAnyNode = true;
        node.position = safePosition;
      }
    });

    if (!movedAnyNode) {
      break;
    }
  }

  return adjustedNodes;
};

const buildBlueprintGraph = (blueprint, startX, startY, existingNodes = [], existingEdges = []) => {
  const prefix = `${blueprint.id}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const placedNodes = [];
  const laneCounters = new Map();

  const blueprintNodesRaw = blueprint.templateKeys.map((templateKey, index) => {
    const laneIndex = getBlueprintLaneIndex(templateKey);
    const phaseIndex = getBlueprintPhaseIndex(templateKey);
    const laneCount = laneCounters.get(laneIndex) || 0;
    laneCounters.set(laneIndex, laneCount + 1);

    const intraPhaseOffsetX = Math.floor(laneCount / 2) * Math.round(BLUEPRINT_BASE_SPACING_X * 0.45);
    const intraLaneOffsetY = (laneCount % 2) * BLUEPRINT_LANE_OFFSET_Y;

    const preferredPosition = {
      x: startX + phaseIndex * BLUEPRINT_BASE_SPACING_X + intraPhaseOffsetX,
      y: startY + laneIndex * BLUEPRINT_ROW_SPACING_Y + intraLaneOffsetY,
    };
    const blockedPathRects = buildEdgeCorridorRects(existingEdges, [...existingNodes, ...placedNodes]);
    const resolvedPosition = findAvailableInsertPosition(preferredPosition, [...existingNodes, ...placedNodes], blockedPathRects);

    const node = {
      id: `${prefix}-node-${index}`,
      type: 'ragNode',
      position: resolvedPosition,
      data: buildNodeData(templateKey),
    };

    placedNodes.push(node);
    return node;
  });
  const blueprintNodes = attachUserQuestionPairMetadata(blueprintNodesRaw, blueprint.templateKeys);
  let adjustedBlueprintNodes = blueprintNodes;
  let blueprintEdges = [];

  for (let pass = 0; pass < BLUEPRINT_LAYOUT_PASSES; pass += 1) {
    blueprintEdges = buildBlueprintEdges(adjustedBlueprintNodes, existingNodes, existingEdges);
    const nextNodes = moveBlueprintNodesOffEdges(adjustedBlueprintNodes, blueprintEdges, existingNodes, existingEdges);

    const changed = nextNodes.some((node, index) => {
      const previousNode = adjustedBlueprintNodes[index];
      return previousNode.position.x !== node.position.x || previousNode.position.y !== node.position.y;
    });

    adjustedBlueprintNodes = nextNodes;
    if (!changed) {
      break;
    }
  }

  blueprintEdges = buildBlueprintEdges(adjustedBlueprintNodes, existingNodes, existingEdges);

  return {
    nodes: adjustedBlueprintNodes,
    edges: blueprintEdges,
  };
};

const buildInitialCanvasState = () => {
  const basicBlueprint = RAG_BLUEPRINTS.find((item) => item.id === BASIC_BLUEPRINT_ID);
  if (!basicBlueprint) {
    return { nodes: [], edges: [] };
  }

  return buildBlueprintGraph(basicBlueprint, 80, 140, [], []);
};

const autoArrangeLoadedFlowNodes = (nodes, edges) => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return nodes;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map();
  const indegree = new Map();

  nodes.forEach((node) => {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  });

  (edges || []).forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return;
    }
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  });

  const depth = new Map();
  const queue = nodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .sort((left, right) => (left.position?.x || 0) - (right.position?.x || 0));

  queue.forEach((node) => depth.set(node.id, 0));

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDepth = depth.get(current.id) || 0;
    const nextNodes = outgoing.get(current.id) || [];

    nextNodes.forEach((targetId) => {
      const bestKnown = depth.get(targetId);
      if (bestKnown == null || currentDepth + 1 > bestKnown) {
        depth.set(targetId, currentDepth + 1);
      }

      indegree.set(targetId, (indegree.get(targetId) || 0) - 1);
      if ((indegree.get(targetId) || 0) === 0) {
        const targetNode = nodes.find((node) => node.id === targetId);
        if (targetNode) {
          queue.push(targetNode);
        }
      }
    });
  }

  const fallbackDepth = nodes.reduce((maxDepth, node) => {
    const known = depth.get(node.id);
    return known == null ? maxDepth : Math.max(maxDepth, known);
  }, 0);

  const columnLaneCounters = new Map();
  const sortedNodes = [...nodes].sort((left, right) => {
    const depthLeft = depth.get(left.id) ?? fallbackDepth + 1;
    const depthRight = depth.get(right.id) ?? fallbackDepth + 1;
    if (depthLeft !== depthRight) {
      return depthLeft - depthRight;
    }
    const laneLeft = getBlueprintLaneIndex(left.data?.templateKey || '');
    const laneRight = getBlueprintLaneIndex(right.data?.templateKey || '');
    if (laneLeft !== laneRight) {
      return laneLeft - laneRight;
    }
    return (left.position?.y || 0) - (right.position?.y || 0);
  });

  const arrangedPositions = new Map();
  sortedNodes.forEach((node) => {
    const column = depth.get(node.id) ?? fallbackDepth + 1;
    const lane = getBlueprintLaneIndex(node.data?.templateKey || '');
    const counterKey = `${column}:${lane}`;
    const laneOffset = columnLaneCounters.get(counterKey) || 0;
    columnLaneCounters.set(counterKey, laneOffset + 1);

    arrangedPositions.set(node.id, {
      x: 80 + column * BLUEPRINT_BASE_SPACING_X,
      y: 120 + lane * BLUEPRINT_ROW_SPACING_Y + laneOffset * (NODE_HEIGHT + 40),
    });
  });

  return nodes.map((node) => ({
    ...node,
    position: arrangedPositions.get(node.id) || node.position || { x: 0, y: 0 },
  }));
};

const INITIAL_CANVAS_STATE = buildInitialCanvasState();
const initialNodes = INITIAL_CANVAS_STATE.nodes;
const initialEdges = INITIAL_CANVAS_STATE.edges;
const CANVAS_DRAFTS_STORAGE_KEY = 'xrag-canvas-drafts-v1';

const loadCanvasDrafts = () => {
  try {
    const raw = localStorage.getItem(CANVAS_DRAFTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getSubGraphNestingLevel = (node) => {
  if (node?.data?.templateKey !== SUBGRAPH_TEMPLATE_KEY) {
    return 0;
  }

  return Number(node.data?.config?.nestingLevel || 1);
};

const areIdListsEqual = (first, second) => {
  if (first === second) {
    return true;
  }

  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
};

const buildPalettePayload = (template) => {
  return JSON.stringify({
    templateKey: template.key,
  });
};

const CanvasBoard = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0]?.id || null);
  const [selectedNodeIds, setSelectedNodeIds] = useState(() => (initialNodes[0]?.id ? [initialNodes[0].id] : []));
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);

  const [paletteTab, setPaletteTab] = useState('nodes'); // 'nodes' | 'blueprints' | 'custom'
  const [nodeSettingsOpen, setNodeSettingsOpen] = useState(false);

  // ── Custom user-defined nodes ──────────────────────────────────────────
  const [customNodes, setCustomNodes] = useState([]);
  const [customNodesStatus, setCustomNodesStatus] = useState('idle'); // idle | loading | error
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customEditorDraft, setCustomEditorDraft] = useState(null); // null | CustomNode draft
  // ── Resizable side panels ──────────────────────────────────────────────
  // Both side asides are user-resizable via thin drag handles. Widths are
  // persisted in localStorage so the layout survives reloads. When the
  // palette is collapsed it locks to a fixed 64px rail regardless of the
  // stored width.
  const PALETTE_WIDTH_MIN = 220;
  const PALETTE_WIDTH_MAX = 520;
  const INSPECTOR_WIDTH_MIN = 240;
  const INSPECTOR_WIDTH_MAX = 600;
  const [paletteWidth, setPaletteWidth] = useState(() => {
    try {
      const raw = Number(localStorage.getItem('xrag.canvas.paletteWidth'));
      if (Number.isFinite(raw) && raw >= PALETTE_WIDTH_MIN && raw <= PALETTE_WIDTH_MAX) return raw;
    } catch { /* ignore */ }
    return 300;
  });
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    try {
      const raw = Number(localStorage.getItem('xrag.canvas.inspectorWidth'));
      if (Number.isFinite(raw) && raw >= INSPECTOR_WIDTH_MIN && raw <= INSPECTOR_WIDTH_MAX) return raw;
    } catch { /* ignore */ }
    return 320;
  });
  useEffect(() => {
    try { localStorage.setItem('xrag.canvas.paletteWidth', String(paletteWidth)); } catch { /* ignore */ }
  }, [paletteWidth]);
  useEffect(() => {
    try { localStorage.setItem('xrag.canvas.inspectorWidth', String(inspectorWidth)); } catch { /* ignore */ }
  }, [inspectorWidth]);
  // Pointer-driven drag. We use refs so the move handler doesn't re-bind on
  // every render. Setting the width while dragging is fine — React batches
  // and the layout uses inline `width:` so changes are immediate.
  const beginResize = useCallback((target) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = target === 'palette' ? paletteWidth : inspectorWidth;
    const min = target === 'palette' ? PALETTE_WIDTH_MIN : INSPECTOR_WIDTH_MIN;
    const max = target === 'palette' ? PALETTE_WIDTH_MAX : INSPECTOR_WIDTH_MAX;
    // Inspector grows when dragging LEFT (negative dx), so flip the sign.
    const sign = target === 'palette' ? 1 : -1;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const next = Math.min(max, Math.max(min, startWidth + sign * dx));
      if (target === 'palette') setPaletteWidth(next);
      else setInspectorWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [paletteWidth, inspectorWidth]);
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false);
  const [minimapSize, setMinimapSize] = useState({ width: 180, height: 120 });
  const [isBlueprintMenuOpen, setIsBlueprintMenuOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(() =>
    groupedNodeLibrary.reduce((accumulator, group) => {
      accumulator[group.category] = true;
      return accumulator;
    }, {})
  );
  const [testPrompt, setTestPrompt] = useState('Melyik policy írja elő a dual-control jóváhagyást?');
  const [testAnswer, setTestAnswer] = useState('');
  const [runTrace, setRunTrace] = useState([]);
  const [runStatus, setRunStatus] = useState('idle'); // idle | running | error
  const [runError, setRunError] = useState('');
  const [runDurationMs, setRunDurationMs] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [savedDrafts, setSavedDrafts] = useState(() => loadCanvasDrafts());
  const [backendFlows, setBackendFlows] = useState([]);
  const [backendFlowsStatus, setBackendFlowsStatus] = useState('idle'); // idle | loading | error
  const [activeBackendFlowId, setActiveBackendFlowId] = useState(null);
  const [saveFeedback, setSaveFeedback] = useState(''); // visible "Saved as…" notice
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [browseFlowsOpen, setBrowseFlowsOpen] = useState(false);
  const [browseFlowsQuery, setBrowseFlowsQuery] = useState('');
  const [shareMeta, setShareMeta] = useState({ name: '', description: '', author: '', tags: '' });
  const [nodeTypeMap, setNodeTypeMap] = useState({});
  const nodeTypeMapRef = useRef(nodeTypeMap);
  const [selectionToolbarRect, setSelectionToolbarRect] = useState(null);
  const [previewedSubGraphId, setPreviewedSubGraphId] = useState(null);
  const [isPreviewToolbarVisible, setIsPreviewToolbarVisible] = useState(false);
  // Transient red banner shown between two nodes when the user attempts an
  // incompatible connection. Auto-dismisses after ~1.8s.
  const [invalidConnectionAlert, setInvalidConnectionAlert] = useState(null);
  const invalidConnectionTimerRef = useRef(null);
  const pendingConnectionRef = useRef(null);
  const selectionStartFlowPointRef = useRef(null);
  const suppressNextPaneClickRef = useRef(false);
  const canvasViewportRef = useRef(null);
  const selectionToolbarRef = useRef(null);
  const nodesRef = useRef(nodes);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedEdgeIdRef = useRef(selectedEdgeId);
  const pendingNodeSelectionRef = useRef(null);
  const { screenToFlowPosition, fitView, setCenter, getViewport } = useReactFlow();

  const onCanvasNodesChange = useCallback(
    (changes) => {
      // Allow 'select' changes for preview nodes to pass through (as a no-op on the real
      // nodes array) so React Flow's internal store sees the selection as accepted.
      // Filtering them out causes RF to fire a correcting onSelectionChange([]) immediately.
      const filteredChanges = changes.filter(
        (change) => !isPreviewElementId(change.id) || change.type === 'select'
      );
      if (filteredChanges.length === 0) {
        return;
      }

      // Soft alignment snap: when dragging a single node and its top/center/bottom
      // (or left/center/right) is within SNAP_THRESHOLD of any other node's matching
      // edge or center, lock onto it so horizontal/vertical alignment is easy.
      const SNAP_THRESHOLD = 8;
      const draggingChanges = filteredChanges.filter(
        (change) => change.type === 'position' && change.dragging && change.position
      );
      const snappedChanges = draggingChanges.length > 0
        ? filteredChanges.map((change) => {
            if (change.type !== 'position' || !change.dragging || !change.position) {
              return change;
            }
            const movingNode = nodesRef.current.find((node) => node.id === change.id);
            if (!movingNode) {
              return change;
            }
            const width = movingNode.measured?.width || NODE_WIDTH;
            const height = movingNode.measured?.height || NODE_HEIGHT;
            let { x, y } = change.position;

            const verticalGuides = [];
            const horizontalGuides = [];
            nodesRef.current.forEach((other) => {
              if (other.id === change.id || isPreviewElementId(other.id)) {
                return;
              }
              const ow = other.measured?.width || NODE_WIDTH;
              const oh = other.measured?.height || NODE_HEIGHT;
              verticalGuides.push(other.position.x, other.position.x + ow / 2 - width / 2, other.position.x + ow - width);
              horizontalGuides.push(other.position.y, other.position.y + oh / 2 - height / 2, other.position.y + oh - height);
            });

            let bestDx = SNAP_THRESHOLD + 1;
            let snapX = x;
            verticalGuides.forEach((guide) => {
              const d = Math.abs(guide - x);
              if (d < bestDx) {
                bestDx = d;
                snapX = guide;
              }
            });
            if (bestDx <= SNAP_THRESHOLD) {
              x = snapX;
            }

            let bestDy = SNAP_THRESHOLD + 1;
            let snapY = y;
            horizontalGuides.forEach((guide) => {
              const d = Math.abs(guide - y);
              if (d < bestDy) {
                bestDy = d;
                snapY = guide;
              }
            });
            if (bestDy <= SNAP_THRESHOLD) {
              y = snapY;
            }

            if (x === change.position.x && y === change.position.y) {
              return change;
            }
            return { ...change, position: { x, y } };
          })
        : filteredChanges;

      onNodesChange(snappedChanges);
    },
    [onNodesChange]
  );

  const onCanvasEdgesChange = useCallback(
    (changes) => {
      // Same as above: let 'select' changes for preview edges pass through.
      const filteredChanges = changes.filter(
        (change) => !isPreviewElementId(change.id) || change.type === 'select'
      );
      if (filteredChanges.length === 0) {
        return;
      }

      onEdgesChange(filteredChanges);
    },
    [onEdgesChange]
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Re-route edges when nodes move so that aligned pairs become straight and
  // misaligned pairs revert to orthogonal step routing automatically.
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    setEdges((currentEdges) => {
      let changed = false;
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      const nextEdges = currentEdges.map((edge) => {
        if (isPreviewElementId(edge.id)) {
          return edge;
        }
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (!sourceNode || !targetNode) {
          return edge;
        }
        // For edges where the user explicitly picked both handles, keep those
        // handles pinned and only refresh the routing type (straight vs step).
        if (edge.data?.userPinnedHandles) {
          const nextType = pickEdgeRoutingType(sourceNode, targetNode, edge.sourceHandle, edge.targetHandle);
          if (edge.type === nextType) {
            return edge;
          }
          changed = true;
          return { ...edge, type: nextType };
        }
        const directionalHandles = getDirectionalHandles(sourceNode.position, targetNode.position);
        const obstacleRects = buildObstacleRectsForPair(nodes, sourceNode.id, targetNode.id);
        const resolvedHandles = chooseBestHandlePair({
          sourceNode,
          targetNode,
          existingEdges: currentEdges.filter((other) => other.id !== edge.id),
          preferredSourceSide: parseSideFromHandleId(edge.sourceHandle) || parseSideFromHandleId(directionalHandles.sourceHandle),
          preferredTargetSide: parseSideFromHandleId(edge.targetHandle) || parseSideFromHandleId(directionalHandles.targetHandle),
          obstacleRects,
        });
        const nextType = pickEdgeRoutingType(
          sourceNode,
          targetNode,
          resolvedHandles.sourceHandle,
          resolvedHandles.targetHandle
        );
        if (
          edge.sourceHandle === resolvedHandles.sourceHandle &&
          edge.targetHandle === resolvedHandles.targetHandle &&
          edge.type === nextType
        ) {
          return edge;
        }
        changed = true;
        return {
          ...edge,
          sourceHandle: resolvedHandles.sourceHandle,
          targetHandle: resolvedHandles.targetHandle,
          type: nextType,
        };
      });
      return changed ? nextEdges : currentEdges;
    });
  }, [nodes, setEdges]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  useEffect(() => {
    const handlePreviewInteraction = () => {
      setIsPreviewToolbarVisible(true);
    };

    window.addEventListener('xrag-preview-interaction', handlePreviewInteraction);
    return () => window.removeEventListener('xrag-preview-interaction', handlePreviewInteraction);
  }, []);

  useEffect(() => {
    localStorage.setItem(CANVAS_DRAFTS_STORAGE_KEY, JSON.stringify(savedDrafts));
  }, [savedDrafts]);

  const saveCanvasDraft = () => {
    const label = draftName.trim() || `RAG draft ${new Date().toLocaleString()}`;
    const draft = {
      id: `canvas-draft-${Date.now()}`,
      name: label,
      createdAt: Date.now(),
      nodes,
      edges,
    };

    setSavedDrafts((previous) => [draft, ...previous].slice(0, 20));
    setDraftName('');
  };

  const loadCanvasDraft = (draft) => {
    setNodes(draft.nodes || []);
    setEdges(draft.edges || []);
    setSelectedNodeId(draft.nodes?.[0]?.id || null);
    setSelectedNodeIds(draft.nodes?.[0]?.id ? [draft.nodes[0].id] : []);
    setSelectedEdgeId(null);
    setPreviewedSubGraphId(null);
    setIsPreviewToolbarVisible(false);
    window.requestAnimationFrame(() => {
      try {
        fitView({ padding: 0.15 });
      } catch {
        // Ignore fit-view failures if React Flow is not ready yet.
      }
    });
  };

  const deleteCanvasDraft = (draftId) => {
    setSavedDrafts((previous) => previous.filter((draft) => draft.id !== draftId));
  };

  // ---------------------------------------------------------------------
  // Backend canvas bridge (Langflow-style runtime via FastAPI)
  // ---------------------------------------------------------------------

  const buildBackendFlowPayload = useCallback(
    (overrides = {}) => {
      const realNodes = nodes.filter((node) => !isPreviewElementId(node.id));
      const realEdges = edges.filter((edge) => !isPreviewElementId(edge.id));
      const hasIdOverride = Object.prototype.hasOwnProperty.call(overrides, 'id');
      const hasNameOverride = Object.prototype.hasOwnProperty.call(overrides, 'name');
      return {
        id: hasIdOverride ? overrides.id : (activeBackendFlowId ?? null),
        name: hasNameOverride ? overrides.name : (draftName.trim() || 'Canvas Flow'),
        description: overrides.description ?? 'Saved from XRAG canvas UI',
        nodes: realNodes.map((node) => ({
          id: node.id,
          templateKey: node.data?.templateKey,
          label: node.data?.label || node.data?.templateKey,
          config: node.data?.config || {},
          position: node.position,
        })),
        edges: realEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: 'step',
          animated: true,
        })),
      };
    },
    [activeBackendFlowId, draftName, edges, nodes]
  );

  const refreshBackendFlows = useCallback(async () => {
    setBackendFlowsStatus('loading');
    try {
      const list = await xragApi.listCanvasFlows();
      setBackendFlows(Array.isArray(list) ? list : []);
      setBackendFlowsStatus('idle');
    } catch (error) {
      setBackendFlowsStatus('error');
      setRunError(`Backend flow list failed: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    refreshBackendFlows();
  }, [refreshBackendFlows]);

  // ── Custom user-defined nodes — fetch + register so drag/drop & rendering
  // see them the same way as built-in templates.
  const refreshCustomNodes = useCallback(async () => {
    setCustomNodesStatus('loading');
    try {
      const list = await xragApi.listCustomNodes();
      const items = Array.isArray(list) ? list : [];
      // Mutate the templateByKey registry so the canvas runtime resolves
      // these by id (drop handler, ragNode icon lookup, etc.).
      items.forEach((cn) => registerCustomTemplate(cn));
      setCustomNodes(items);
      setCustomNodesStatus('idle');
    } catch (error) {
      setCustomNodesStatus('error');
      // Non-fatal — surface in console only; the rest of the canvas works.
      // eslint-disable-next-line no-console
      console.warn('Custom nodes list failed:', error.message);
    }
  }, []);

  useEffect(() => {
    refreshCustomNodes();
  }, [refreshCustomNodes]);

  useEffect(() => {
    nodeTypeMapRef.current = nodeTypeMap;
  }, [nodeTypeMap]);

  // Fetch the backend's NodeSpec registry once on mount and build a
  // templateKey -> { inputs, outputs } map used for connection validation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const descriptors = await xragApi.listCanvasNodeDescriptors();
        if (cancelled || !Array.isArray(descriptors)) {
          return;
        }
        const map = {};
        for (const descriptor of descriptors) {
          const key = descriptor.template_key || descriptor.templateKey;
          if (!key) continue;
          map[key] = {
            inputs: descriptor.inputs || [],
            outputs: descriptor.outputs || [],
          };
        }
        setNodeTypeMap(map);
      } catch {
        // Silent fallback — UI keeps working with permissive validation.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isValidConnection = useCallback(
    (connection) => {
      if (!connection?.source || !connection?.target) {
        return false;
      }
      // Mirror the canonical-rank magnet used at commit time: edges between
      // ranked pipeline nodes are valid in either drag direction (we'll flip
      // the arrowhead to the higher-rank node on drop).
      const allNodes = nodesRef.current;
      const sourceNode = allNodes.find((node) => node.id === connection.source);
      const targetNode = allNodes.find((node) => node.id === connection.target);
      const srcRank = CANONICAL_PIPELINE_RANK[sourceNode?.data?.templateKey];
      const tgtRank = CANONICAL_PIPELINE_RANK[targetNode?.data?.templateKey];
      if (srcRank != null && tgtRank != null && srcRank > tgtRank) {
        // Validate against the canonical orientation we'd actually create.
        return isConnectionAllowed(
          { source: connection.target, target: connection.source },
          allNodes,
          nodeTypeMapRef.current,
        );
      }
      return isConnectionAllowed(
        { source: connection.source, target: connection.target },
        allNodes,
        nodeTypeMapRef.current,
      );
    },
    [],
  );

  const saveCanvasFlowToBackend = useCallback(async () => {
    setRunError('');
    setSaveFeedback('');
    try {
      // Saving from the inspector ALWAYS creates a new architecture entry.
      // (Overwriting existing flows is intentionally disabled here so the
      // user never accidentally clobbers a blueprint or a previous save.)
      const overrides = { id: null };
      if (!draftName.trim()) {
        overrides.name = `My RAG Flow ${new Date().toLocaleTimeString()}`;
      }
      const payload = buildBackendFlowPayload(overrides);
      const saved = await xragApi.saveCanvasFlow(payload);
      setActiveBackendFlowId(saved.id || null);
      setDraftName('');
      setSaveFeedback(`Saved as “${saved.name}”`);
      window.setTimeout(() => setSaveFeedback(''), 3500);
      await refreshBackendFlows();
    } catch (error) {
      setRunError(`Backend save failed: ${error.message}`);
    }
  }, [buildBackendFlowPayload, draftName, refreshBackendFlows]);

  const applyFlowData = useCallback(
    (flow, options = {}) => {
      const incomingNodes = (flow.nodes || []).map((node) => ({
        id: node.id,
        type: 'ragNode',
        position: node.position || { x: 0, y: 0 },
        data: {
          ...buildNodeData(node.templateKey),
          ...(node.label ? { label: node.label } : {}),
          config: { ...(node.config || {}) },
          templateKey: node.templateKey,
        },
      }));
      const incomingEdges = (flow.edges || []).map((edge, index) => ({
        id: edge.id || `edge-loaded-${index}-${Date.now()}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: 'step',
        animated: true,
      }));
      const resolvedNodes = options.autoArrange
        ? autoArrangeLoadedFlowNodes(incomingNodes, incomingEdges)
        : incomingNodes;

      setNodes(resolvedNodes);
      setEdges(incomingEdges);
      setActiveBackendFlowId(flow.id || null);
      setSelectedNodeId(resolvedNodes[0]?.id || null);
      setSelectedNodeIds(resolvedNodes[0]?.id ? [resolvedNodes[0].id] : []);
      setSelectedEdgeId(null);
      window.requestAnimationFrame(() => {
        try { fitView({ padding: 0.15 }); } catch { /* ignore */ }
      });
    },
    [fitView, setEdges, setNodes]
  );

  const loadCanvasFlowFromBackend = useCallback(
    async (flowId) => {
      setRunError('');
      try {
        const flow = await xragApi.getCanvasFlow(flowId);
        applyFlowData(flow, { autoArrange: BLUEPRINT_FLOW_ID_SET.has(flowId) });
      } catch (error) {
        setRunError(`Backend load failed: ${error.message}`);
      }
    },
    [applyFlowData]
  );

  // Auto-load the Naive RAG flow on every page load as the default canvas state.
  useEffect(() => {
    loadCanvasFlowFromBackend('flow-naive-rag-001');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for SharedSpace "Load to Canvas" events
  useEffect(() => {
    const handleLoadSharedFlow = (event) => {
      const flow = event.detail?.flow;
      if (flow) applyFlowData(flow);
    };
    window.addEventListener('xrag-load-canvas-flow', handleLoadSharedFlow);
    return () => window.removeEventListener('xrag-load-canvas-flow', handleLoadSharedFlow);
  }, [applyFlowData]);

  const deleteCanvasFlowFromBackend = useCallback(
    async (flowId) => {
      try {
        await xragApi.deleteCanvasFlow(flowId);
        if (flowId === activeBackendFlowId) {
          setActiveBackendFlowId(null);
        }
        await refreshBackendFlows();
      } catch (error) {
        setRunError(`Backend delete failed: ${error.message}`);
      }
    },
    [activeBackendFlowId, refreshBackendFlows]
  );

  const clearCanvasRunStatus = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (isPreviewElementId(node.id)) return node;
        const { runStatus, runError, runDurationMs, runOutputPreview, ...rest } = node.data || {};
        return { ...node, data: rest };
      })
    );
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (isPreviewElementId(edge.id)) return edge;
        const baseClass = (edge.className || '')
          .split(/\s+/)
          .filter((cls) => cls && !cls.startsWith('xrag-edge-'))
          .join(' ');
        const { runStatus: _rs, runStamp: _ts, ...restData } = edge.data || {};
        return {
          ...edge,
          animated: true,
          className: baseClass,
          data: restData,
        };
      })
    );
  }, [setEdges, setNodes]);

  const updateNodeRunState = useCallback(
    (nodeId, patch) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
        )
      );
    },
    [setNodes]
  );

  const setEdgeRunStyle = useCallback(
    (predicate, runStatus) => {
      const STATUS_MARKER_COLOR = {
        running: '#f59e0b',
        ok: '#10b981',
        error: '#ef4444',
      };
      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          if (isPreviewElementId(edge.id)) return edge;
          if (!predicate(edge)) return edge;
          // For status transitions, override the markerEnd color so the arrow
          // head matches the wipe color. For 'idle', let the regular gradient
          // markerEnd (target node color) take over again — that re-derivation
          // happens in `visibleEdges` below.
          const markerColor = STATUS_MARKER_COLOR[runStatus];
          const nextMarkerEnd = markerColor
            ? { type: MarkerType.ArrowClosed, color: markerColor, width: 7, height: 7 }
            : edge.markerEnd;
          return {
            ...edge,
            // Keep the gradient edge animated; the edge component reads
            // `data.runStatus` to decide whether to overlay a status wipe or
            // a running flow. `runStamp` ensures the wipe replays each time
            // the status changes.
            animated: true,
            markerEnd: nextMarkerEnd,
            data: { ...(edge.data || {}), runStatus, runStamp: Date.now() },
          };
        })
      );
    },
    [setEdges]
  );

  const runCanvasFlowOnBackend = useCallback(async () => {
    setRunStatus('running');
    setRunError('');
    setRunTrace([]);
    setTestAnswer('');
    setRunDurationMs(null);

    // Mark all real nodes as pending so the user immediately sees the run start.
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (isPreviewElementId(node.id)) return node;
        return {
          ...node,
          data: {
            ...node.data,
            runStatus: 'pending',
            runError: null,
            runDurationMs: null,
            runOutputPreview: null,
          },
        };
      })
    );
    // Reset all edges to the idle (purple, animated) styling.
    setEdgeRunStyle(() => true, 'idle');

    try {
      const flow = buildBackendFlowPayload();
      if (!flow.nodes.length) {
        throw new Error('Canvas is empty — add at least one node before running.');
      }
      const response = await xragApi.runCanvasFlow({
        flow,
        question: testPrompt,
      });
      setTestAnswer(response.answer || '(no answer produced)');
      const trace = Array.isArray(response.trace) ? response.trace : [];
      setRunTrace(trace);
      setRunDurationMs(response.duration_ms ?? null);
      setRunStatus('idle');

      // Animate trace onto canvas: highlight each node as 'running' briefly,
      // then commit the actual status from the backend trace record.
      const STEP_MS = 320;
      for (let i = 0; i < trace.length; i += 1) {
        const step = trace[i];
        const nodeId = step.node_id || step.nodeId;
        if (!nodeId) continue;
        // Highlight inbound edges as "running" so the user sees data flowing in.
        setEdgeRunStyle((edge) => edge.target === nodeId, 'running');
        updateNodeRunState(nodeId, {
          runStatus: 'running',
          runError: null,
          runDurationMs: null,
          runOutputPreview: null,
        });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, STEP_MS));
        const finalStatus = step.status || 'ok';
        updateNodeRunState(nodeId, {
          runStatus: finalStatus,
          runError: step.error || null,
          runDurationMs: step.duration_ms ?? step.durationMs ?? null,
          runOutputPreview: step.output_preview ?? step.outputPreview ?? null,
        });
        // Commit edge color: green if node ok, red if error, purple-idle if skipped.
        const edgeTone = finalStatus === 'error' ? 'error' : finalStatus === 'ok' ? 'ok' : 'idle';
        setEdgeRunStyle((edge) => edge.target === nodeId, edgeTone);
      }
    } catch (error) {
      setRunStatus('error');
      setRunError(error.message || 'Backend run failed');
      // Mark any still-pending node as error so the canvas reflects the failure.
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (isPreviewElementId(node.id)) return node;
          if (node.data?.runStatus !== 'pending') return node;
          return {
            ...node,
            data: {
              ...node.data,
              runStatus: 'error',
              runError: error.message || 'Backend run failed',
            },
          };
        })
      );
    }
  }, [buildBackendFlowPayload, setEdgeRunStyle, setNodes, testPrompt, updateNodeRunState]);

  const syncPreviewToolbarVisibilityFromPointer = useCallback(
    (clientX, clientY, eventTarget = null) => {
      if (!previewedSubGraphId) {
        return false;
      }

      const toolbarElement = selectionToolbarRef.current;
      if (toolbarElement && eventTarget instanceof Node && toolbarElement.contains(eventTarget)) {
        return true;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport) {
        return false;
      }

      const backdropElement = viewport.querySelector(`.react-flow__node[data-id="preview-bg-${previewedSubGraphId}"]`);
      if (!backdropElement) {
        setIsPreviewToolbarVisible(false);
        return false;
      }

      const rect = backdropElement.getBoundingClientRect();
      const isInsidePreviewRect = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      setIsPreviewToolbarVisible(isInsidePreviewRect);
      return isInsidePreviewRect;
    },
    [previewedSubGraphId]
  );

  useEffect(() => {
    const resizeEvent = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      fitView({ duration: 180, padding: 0.12 });
    }, 80);

    return () => window.clearTimeout(resizeEvent);
  }, [fitView]);

  // NOTE: Delete/Backspace is handled by React Flow's built-in deleteKeyCode
  // mechanism, which dispatches onEdgesDelete / onNodesDelete callbacks based
  // on its own (always-fresh) internal selection state. Cascade logic for
  // nodes lives in onNodesDelete on the ReactFlow component below.

  // Clipboard for Ctrl+C / Ctrl+V on selected nodes (and edges entirely contained
  // between the selected nodes).
  const clipboardRef = useRef(null);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.getAttribute?.('contenteditable') === 'true'
      );
    };

    const onClipboardKey = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;
      if (isTypingTarget(document.activeElement) || isTypingTarget(event.target)) {
        return;
      }

      if (key === 'c') {
        const selectedIds = selectedNodeIdsRef.current.length > 0
          ? selectedNodeIdsRef.current
          : nodesRef.current.filter((node) => node.selected).map((node) => node.id);
        const copyableNodes = nodesRef.current.filter(
          (node) => selectedIds.includes(node.id) && !isPreviewElementId(node.id)
        );
        if (copyableNodes.length === 0) return;
        event.preventDefault();
        const idSet = new Set(copyableNodes.map((node) => node.id));
        clipboardRef.current = {
          nodes: copyableNodes.map((node) => ({
            templateKey: node.data?.templateKey,
            data: JSON.parse(JSON.stringify(node.data)),
            position: { ...node.position },
            originalId: node.id,
          })),
          edges: edges
            .filter((edge) => idSet.has(edge.source) && idSet.has(edge.target) && !isPreviewElementId(edge.id))
            .map((edge) => ({
              source: edge.source,
              sourceHandle: edge.sourceHandle,
              target: edge.target,
              targetHandle: edge.targetHandle,
              type: edge.type,
              data: edge.data ? JSON.parse(JSON.stringify(edge.data)) : undefined,
            })),
        };
        return;
      }

      if (key === 'v') {
        const clip = clipboardRef.current;
        if (!clip || clip.nodes.length === 0) return;
        event.preventDefault();

        const PASTE_OFFSET = 40;
        const idMap = new Map();
        const stamp = Date.now();
        const newNodes = clip.nodes.map((entry, index) => {
          const newId = `node-${stamp}-${index}-${Math.round(Math.random() * 100000)}`;
          idMap.set(entry.originalId, newId);
          return {
            id: newId,
            type: 'ragNode',
            position: { x: entry.position.x + PASTE_OFFSET, y: entry.position.y + PASTE_OFFSET },
            data: JSON.parse(JSON.stringify(entry.data)),
            selected: true,
          };
        });

        // Remap intra-clipboard pair links so deleting a pasted clone never
        // cascades back to the original node it was copied from. If the pair is
        // not part of the paste set, drop the link entirely.
        newNodes.forEach((node) => {
          const originalPairId = node.data?.pairNodeId;
          if (!originalPairId) return;
          const remapped = idMap.get(originalPairId);
          if (remapped) {
            node.data.pairNodeId = remapped;
          } else {
            delete node.data.pairNodeId;
          }
        });

        const newEdges = clip.edges.map((entry, index) => ({
          id: `edge-${stamp}-${index}-${Math.round(Math.random() * 100000)}`,
          source: idMap.get(entry.source),
          sourceHandle: entry.sourceHandle,
          target: idMap.get(entry.target),
          targetHandle: entry.targetHandle,
          type: entry.type || 'step',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706' },
          style: { strokeWidth: 2.6, stroke: '#d97706' },
          data: entry.data,
        }));

        setNodes((currentNodes) => [
          ...currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
          ...newNodes,
        ]);
        if (newEdges.length > 0) {
          setEdges((currentEdges) => [...currentEdges, ...newEdges]);
        }
        const newIds = newNodes.map((node) => node.id);
        setSelectedNodeIds(newIds);
        setSelectedNodeId(newIds[0] || null);
        setSelectedEdgeId(null);
      }
    };

    window.addEventListener('keydown', onClipboardKey);
    return () => window.removeEventListener('keydown', onClipboardKey);
  }, [edges, setEdges, setNodes]);

  // Robust Delete/Backspace handler. React Flow's built-in deleteKeyCode
  // relies on its internal `node.selected` state, which can fall out of sync
  // with our marquee/multi-selection. Using `selectedNodeIdsRef` here means
  // delete always acts on whatever the user last selected.
  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.getAttribute?.('contenteditable') === 'true'
      );
    };

    const onDeleteKey = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isTypingTarget(document.activeElement) || isTypingTarget(event.target)) return;

      const nodeIds = selectedNodeIdsRef.current.filter((id) => !isPreviewElementId(id));
      const edgeId = selectedEdgeIdRef.current && !isPreviewElementId(selectedEdgeIdRef.current)
        ? selectedEdgeIdRef.current
        : null;

      if (nodeIds.length === 0 && !edgeId) return;
      event.preventDefault();

      if (nodeIds.length > 0) {
        const idsToDelete = new Set();
        nodeIds.forEach((nodeId) => {
          const cascadeIds = getCascadeDeleteNodeIds(nodeId, nodesRef.current);
          cascadeIds.forEach((id) => idsToDelete.add(id));
        });
        setNodes((currentNodes) => currentNodes.filter((node) => !idsToDelete.has(node.id)));
        setEdges((currentEdges) =>
          currentEdges.filter((edge) => !idsToDelete.has(edge.source) && !idsToDelete.has(edge.target))
        );
        selectedNodeIdsRef.current = [];
        setSelectedNodeIds([]);
        setSelectedNodeId(null);
      }

      if (edgeId) {
        setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId));
        selectedEdgeIdRef.current = null;
        setSelectedEdgeId(null);
      }
    };

    window.addEventListener('keydown', onDeleteKey);
    return () => window.removeEventListener('keydown', onDeleteKey);
  }, [setEdges, setNodes]);

  // Close node-settings modal on Escape.
  useEffect(() => {
    const onEsc = (event) => {
      if (event.key === 'Escape') setNodeSettingsOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }

    // Preview edges don't live in the real `edges` array — skip the existence
    // check for them, otherwise the selection is immediately cleared.
    if (isPreviewElementId(selectedEdgeId)) {
      return;
    }

    const stillExists = edges.some((edge) => edge.id === selectedEdgeId);
    if (!stillExists) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    if (!selectionBox) {
      return;
    }

    const finalizeSelection = (event) => {
      const startFlowPoint = selectionStartFlowPointRef.current;
      selectionStartFlowPointRef.current = null;

      if (!startFlowPoint) {
        setSelectionBox(null);
        return;
      }

      const endFlowPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const left = Math.min(startFlowPoint.x, endFlowPoint.x);
      const right = Math.max(startFlowPoint.x, endFlowPoint.x);
      const top = Math.min(startFlowPoint.y, endFlowPoint.y);
      const bottom = Math.max(startFlowPoint.y, endFlowPoint.y);

      const selectedIds = nodesRef.current
        .filter((node) => {
          const rect = getNodeRect(node);
          const overlapsX = rect.right >= left && rect.left <= right;
          const overlapsY = rect.bottom >= top && rect.top <= bottom;
          return overlapsX && overlapsY;
        })
        .map((node) => node.id);

      const selectedIdSet = new Set(selectedIds);
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: selectedIdSet.has(node.id),
        }))
      );
      // Sync refs synchronously so the trailing pane-click guard and any
      // immediate Delete/Backspace press see the new selection.
      selectedNodeIdsRef.current = selectedIds;
      selectedEdgeIdRef.current = null;
      // After a marquee selection, the browser also fires a click event on
      // the pane. Without this guard, onPaneClick would wipe the selection
      // we just made one tick later.
      if (selectedIds.length > 0) {
        suppressNextPaneClickRef.current = true;
      }
      setSelectedNodeIds(selectedIds);
      setSelectedNodeId(selectedIds[0] || null);
      setSelectedEdgeId(null);
      setSelectionBox(null);
    };

    const onMouseMove = (event) => {
      const viewport = canvasViewportRef.current;
      if (!viewport) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const nextX = Math.max(0, Math.min(viewportRect.width, event.clientX - viewportRect.left));
      const nextY = Math.max(0, Math.min(viewportRect.height, event.clientY - viewportRect.top));

      setSelectionBox((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          currentX: nextX,
          currentY: nextY,
        };
      });
    };

    const onMouseUp = (event) => {
      finalizeSelection(event);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [selectionBox, screenToFlowPosition, setNodes]);

  // Pop a transient red banner between two nodes that the user just tried to
  // connect in an invalid way. The banner is auto-dismissed after 1800ms; if
  // it fires again before that, the timer resets so the message stays
  // visible while the user keeps experimenting.
  const flashInvalidConnection = useCallback((sourceId, targetId, message) => {
    if (!sourceId || !targetId) {
      return;
    }
    if (invalidConnectionTimerRef.current) {
      clearTimeout(invalidConnectionTimerRef.current);
    }

    // Position the banner at the midpoint between the two nodes, in
    // viewport-local coordinates so it stays glued to the canvas overlay
    // regardless of pan/zoom at the moment of the failed drop.
    let position = null;
    const viewport = canvasViewportRef.current;
    if (viewport) {
      const sourceEl = viewport.querySelector(`.react-flow__node[data-id="${sourceId}"]`);
      const targetEl = viewport.querySelector(`.react-flow__node[data-id="${targetId}"]`);
      if (sourceEl && targetEl) {
        const viewportRect = viewport.getBoundingClientRect();
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const midClientX = (sourceRect.left + sourceRect.width / 2 + targetRect.left + targetRect.width / 2) / 2;
        const midClientY = (sourceRect.top + sourceRect.height / 2 + targetRect.top + targetRect.height / 2) / 2;
        position = {
          left: midClientX - viewportRect.left,
          top: midClientY - viewportRect.top,
        };
      }
    }

    setInvalidConnectionAlert({
      sourceId,
      targetId,
      message: message || 'These nodes can\u2019t be connected',
      position,
      stamp: Date.now(),
    });
    invalidConnectionTimerRef.current = setTimeout(() => {
      setInvalidConnectionAlert(null);
      invalidConnectionTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => () => {
    if (invalidConnectionTimerRef.current) {
      clearTimeout(invalidConnectionTimerRef.current);
    }
  }, []);

  const onConnect = useCallback(
    (connection) => {
      const pending = pendingConnectionRef.current;
      if (pending) {
        pending.completed = true;
      }

      if (!connection.source || !connection.target) {
        return;
      }

      // Always orient the edge so it points from the node where the drag started
      // to the node where the user dropped, regardless of which handle type was used.
      let orientedConnection = connection;
      if (pending?.nodeId && pending.handleType === 'target') {
        orientedConnection = {
          ...connection,
          source: connection.target,
          sourceHandle: connection.targetHandle,
          target: connection.source,
          targetHandle: connection.sourceHandle,
        };
      }

      // Canonical-rank magnet: every node has a slot in the RAG pipeline
      // (chunking → embedding → vector DB → retriever → ...). When two
      // adjacent ranks are connected, the arrowhead must always point at the
      // higher-rank one — regardless of which handle the user dragged from.
      const sourceNodeForOrient = nodes.find((node) => node.id === orientedConnection.source);
      const targetNodeForOrient = nodes.find((node) => node.id === orientedConnection.target);
      const srcRank = CANONICAL_PIPELINE_RANK[sourceNodeForOrient?.data?.templateKey];
      const tgtRank = CANONICAL_PIPELINE_RANK[targetNodeForOrient?.data?.templateKey];
      if (srcRank != null && tgtRank != null && srcRank > tgtRank) {
        orientedConnection = {
          ...orientedConnection,
          source: orientedConnection.target,
          sourceHandle: orientedConnection.targetHandle,
          target: orientedConnection.source,
          targetHandle: orientedConnection.sourceHandle,
        };
      }

      if (!isConnectionAllowed(
        { source: orientedConnection.source, target: orientedConnection.target },
        nodes,
        nodeTypeMapRef.current,
      )) {
        const srcNode = nodes.find((n) => n.id === orientedConnection.source);
        const tgtNode = nodes.find((n) => n.id === orientedConnection.target);
        flashInvalidConnection(
          orientedConnection.source,
          orientedConnection.target,
          `${srcNode?.data?.label || 'This node'} can\u2019t connect to ${tgtNode?.data?.label || 'that node'}`,
        );
        return;
      }

      setEdges((currentEdges) => {
        const alreadyExists = currentEdges.some(
          (edge) =>
            edge.source === orientedConnection.source && edge.target === orientedConnection.target,
        );
        if (alreadyExists) return currentEdges;
        const srcNode = nodes.find((n) => n.id === orientedConnection.source);
        const tgtNode = nodes.find((n) => n.id === orientedConnection.target);
        return addEdge(
          makeEdgePayload({
            ...orientedConnection,
            type: pickEdgeRoutingType(
              srcNode,
              tgtNode,
              orientedConnection.sourceHandle,
              orientedConnection.targetHandle,
            ),
          }),
          currentEdges,
        );
      });
    },
    [nodes, setEdges, flashInvalidConnection]
  );

  const removeEdgeById = useCallback(
    (edgeId) => {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId));
      setSelectedEdgeId((previous) => (previous === edgeId ? null : previous));
    },
    [setEdges]
  );

  const setSelectionMetaState = useCallback((nextSelectedIds, nextSelectedEdgeId = null) => {
      // Update refs synchronously so guards in onSelectionChange (which can fire
      // multiple times in the same event tick) see the latest selection without
      // waiting for the post-render useEffect that normally syncs them.
      selectedNodeIdsRef.current = nextSelectedIds;
      selectedEdgeIdRef.current = nextSelectedEdgeId;

      setSelectedNodeIds((previous) => {
        if (previous.length === nextSelectedIds.length && previous.every((id, index) => id === nextSelectedIds[index])) {
          return previous;
        }

        return nextSelectedIds;
      });

      const nextPrimaryNodeId = nextSelectedIds[0] || null;
      setSelectedNodeId((previous) => (previous === nextPrimaryNodeId ? previous : nextPrimaryNodeId));
      setSelectedEdgeId((previous) => (previous === nextSelectedEdgeId ? previous : nextSelectedEdgeId));
    }, []);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const handleViewportClickCapture = (event) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      const edgeElement = eventTarget.closest('.react-flow__edge');
      const edgeId = edgeElement?.getAttribute('data-id');
      if (edgeId) {
        if (isPreviewElementId(edgeId)) {
          setIsPreviewToolbarVisible(true);
        } else {
          setIsPreviewToolbarVisible(false);
        }

        setSelectionMetaState([], edgeId);
        return;
      }

      if ('clientX' in event && 'clientY' in event) {
        syncPreviewToolbarVisibilityFromPointer(event.clientX, event.clientY, eventTarget);
      }
    };

    viewport.addEventListener('click', handleViewportClickCapture, true);
    return () => viewport.removeEventListener('click', handleViewportClickCapture, true);
  }, [setSelectionMetaState, syncPreviewToolbarVisibilityFromPointer]);

  const onConnectStart = useCallback((_event, params) => {
    pendingConnectionRef.current = { ...params, completed: false };
    if (params?.nodeId) {
      setSelectionMetaState([params.nodeId], null);
    }
  }, [setSelectionMetaState]);

  const setNodeSelectionState = useCallback(
    (nextSelectedIds, nextSelectedEdgeId = null) => {
      const selectedIdSet = new Set(nextSelectedIds);

      setNodes((currentNodes) => {
        let hasSelectionChange = false;

        const nextNodes = currentNodes.map((node) => {
          const nextSelected = selectedIdSet.has(node.id);
          if (Boolean(node.selected) !== nextSelected) {
            hasSelectionChange = true;
            return {
              ...node,
              selected: nextSelected,
            };
          }

          return node;
        });

        return hasSelectionChange ? nextNodes : currentNodes;
      });

      setSelectionMetaState(nextSelectedIds, nextSelectedEdgeId);
    },
    [setNodes, setSelectionMetaState]
  );

  // Removes a preview edge from its subgraph's collapsedEdges.
  // For cross-boundary edges the corresponding real bridge edge is also removed.
  const removePreviewEdge = useCallback(
    (previewEdge) => {
      if (!previewedSubGraphId) return;

      const prefix = `preview-edge-${previewedSubGraphId}-`;
      const indexStr = previewEdge.id.slice(prefix.length);
      const index = parseInt(indexStr, 10);
      if (Number.isNaN(index)) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== previewedSubGraphId) return node;
          const collapsedEdges = Array.isArray(node.data?.config?.collapsedEdges)
            ? node.data.config.collapsedEdges
            : [];
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                collapsedEdges: collapsedEdges.filter((_, i) => i !== index),
              },
            },
          };
        })
      );

      // For cross-boundary edges, also remove the bridge edge in real `edges` state.
      const isCrossBoundary =
        !isPreviewElementId(previewEdge.source) || !isPreviewElementId(previewEdge.target);
      if (isCrossBoundary) {
        const isSourceReal = !isPreviewElementId(previewEdge.source);
        const realEndpoint = isSourceReal ? previewEdge.source : previewEdge.target;
        setEdges((currentEdges) =>
          currentEdges.filter((edge) => {
            if (isSourceReal) {
              return !(edge.source === realEndpoint && edge.target === previewedSubGraphId);
            }
            return !(edge.source === previewedSubGraphId && edge.target === realEndpoint);
          })
        );
      }

      setSelectionMetaState([], null);
    },
    [previewedSubGraphId, setNodes, setEdges, setSelectionMetaState]
  );

  // Removes one or more preview nodes (and any collapsed edges that touch them)
  // from the parent subgraph's `collapsedNodes`/`collapsedEdges`. Accepts the
  // preview node IDs (e.g. `preview-<sgId>-<originalNodeId>`).
  const removePreviewNodes = useCallback(
    (previewNodeIds) => {
      if (!previewedSubGraphId || previewNodeIds.length === 0) return;
      const prefix = `preview-${previewedSubGraphId}-`;
      const originalIdsToDelete = new Set(
        previewNodeIds
          .filter((id) => id.startsWith(prefix))
          .map((id) => id.slice(prefix.length))
      );
      if (originalIdsToDelete.size === 0) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== previewedSubGraphId) return node;
          const collapsedNodes = Array.isArray(node.data?.config?.collapsedNodes)
            ? node.data.config.collapsedNodes
            : [];
          const collapsedEdges = Array.isArray(node.data?.config?.collapsedEdges)
            ? node.data.config.collapsedEdges
            : [];
          const previewLayout = node.data?.config?.previewLayout || {};
          const nextCollapsedNodes = collapsedNodes.filter(
            (cn) => !originalIdsToDelete.has(cn.id)
          );
          const nextCollapsedEdges = collapsedEdges.filter(
            (ce) => !originalIdsToDelete.has(ce.source) && !originalIdsToDelete.has(ce.target)
          );
          const nextPreviewLayout = { ...previewLayout };
          originalIdsToDelete.forEach((id) => {
            delete nextPreviewLayout[id];
          });
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                collapsedNodes: nextCollapsedNodes,
                collapsedEdges: nextCollapsedEdges,
                previewLayout: nextPreviewLayout,
              },
            },
          };
        })
      );

      setSelectionMetaState([], null);
    },
    [previewedSubGraphId, setNodes, setSelectionMetaState]
  );

  // Removes multiple preview edges in one batch from the parent subgraph's
  // `collapsedEdges`. We must remove by index so we collect indices first
  // (since filter-by-index shifts subsequent indices).
  const removePreviewEdges = useCallback(
    (previewEdges) => {
      if (!previewedSubGraphId || previewEdges.length === 0) return;
      const prefix = `preview-edge-${previewedSubGraphId}-`;
      const indicesToDelete = new Set();
      const crossBoundaryEdges = [];
      previewEdges.forEach((previewEdge) => {
        if (!previewEdge.id.startsWith(prefix)) return;
        const indexStr = previewEdge.id.slice(prefix.length);
        const index = parseInt(indexStr, 10);
        if (Number.isNaN(index)) return;
        indicesToDelete.add(index);
        const isCrossBoundary =
          !isPreviewElementId(previewEdge.source) || !isPreviewElementId(previewEdge.target);
        if (isCrossBoundary) {
          crossBoundaryEdges.push(previewEdge);
        }
      });
      if (indicesToDelete.size === 0) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== previewedSubGraphId) return node;
          const collapsedEdges = Array.isArray(node.data?.config?.collapsedEdges)
            ? node.data.config.collapsedEdges
            : [];
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                collapsedEdges: collapsedEdges.filter((_, i) => !indicesToDelete.has(i)),
              },
            },
          };
        })
      );

      // Drop matching real bridge edges for cross-boundary preview edges.
      if (crossBoundaryEdges.length > 0) {
        setEdges((currentEdges) =>
          currentEdges.filter((edge) => {
            return !crossBoundaryEdges.some((previewEdge) => {
              const isSourceReal = !isPreviewElementId(previewEdge.source);
              const realEndpoint = isSourceReal ? previewEdge.source : previewEdge.target;
              if (isSourceReal) {
                return edge.source === realEndpoint && edge.target === previewedSubGraphId;
              }
              return edge.source === previewedSubGraphId && edge.target === realEndpoint;
            });
          })
        );
      }

      setSelectionMetaState([], null);
    },
    [previewedSubGraphId, setNodes, setEdges, setSelectionMetaState]
  );

  useEffect(() => {
    const handleNodeClick = (event) => {
      const { nodeId, ctrlKey, metaKey, shiftKey } = event.detail || {};
      if (!nodeId) {
        return;
      }

      if (previewedSubGraphId) {
        setIsPreviewToolbarVisible(isPreviewElementId(nodeId));
      }

      const modifierPressed = Boolean(ctrlKey || metaKey || shiftKey);
      if (!modifierPressed) {
        pendingNodeSelectionRef.current = null;
        setNodeSelectionState([nodeId]);
        return;
      }

      const currentSelectedNodeIds = selectedNodeIdsRef.current;
      const nextSelectedIds = currentSelectedNodeIds.includes(nodeId)
        ? currentSelectedNodeIds.filter((id) => id !== nodeId)
        : [...currentSelectedNodeIds, nodeId];

      pendingNodeSelectionRef.current = nextSelectedIds;
      setNodeSelectionState(nextSelectedIds);
    };

    window.addEventListener('xrag-node-click', handleNodeClick);
    return () => window.removeEventListener('xrag-node-click', handleNodeClick);
  }, [previewedSubGraphId, setNodeSelectionState]);

  useEffect(() => {
    const handleNodeDoubleClick = (event) => {
      const { nodeId } = event.detail || {};
      if (!nodeId) {
        return;
      }

      pendingNodeSelectionRef.current = null;
      setNodeSelectionState([nodeId]);
      setNodeSettingsOpen(true);
    };

    window.addEventListener('xrag-node-double-click', handleNodeDoubleClick);
    return () => window.removeEventListener('xrag-node-double-click', handleNodeDoubleClick);
  }, [setNodeSelectionState]);

  const onCanvasMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) {
        return;
      }

      const eventTarget = event.target;
      if (!(eventTarget instanceof Element) || !eventTarget.closest('.react-flow__pane')) {
        return;
      }

      if (
        eventTarget.closest('.react-flow__edge') ||
        eventTarget.closest('.react-flow__node') ||
        eventTarget.closest('.react-flow__controls') ||
        eventTarget.closest('.react-flow__minimap')
      ) {
        return;
      }

      if (syncPreviewToolbarVisibilityFromPointer(event.clientX, event.clientY, eventTarget)) {
        return;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const startX = Math.max(0, Math.min(viewportRect.width, event.clientX - viewportRect.left));
      const startY = Math.max(0, Math.min(viewportRect.height, event.clientY - viewportRect.top));
      selectionStartFlowPointRef.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      setSelectionBox({
        startX,
        startY,
        currentX: startX,
        currentY: startY,
      });
    },
    [screenToFlowPosition, syncPreviewToolbarVisibilityFromPointer]
  );

  const onCanvasMouseDownCapture = useCallback(
    (event) => {
      if (event.button !== 0) {
        return;
      }

      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      const nodeElement = eventTarget.closest('.react-flow__node');
      const nodeId = nodeElement?.getAttribute('data-id');
      if (nodeId && selectedEdgeIdRef.current) {
        if (previewedSubGraphId) {
          setIsPreviewToolbarVisible(isPreviewElementId(nodeId));
        }

        pendingNodeSelectionRef.current = null;
        setNodeSelectionState([nodeId], null);
        return;
      }

      const edgeElement = eventTarget.closest('.react-flow__edge');
      const edgeId = edgeElement?.getAttribute('data-id');
      if (!edgeId) {
        if (!nodeElement && selectedEdgeIdRef.current) {
          setSelectionMetaState(selectedNodeIdsRef.current, null);
        }
        return;
      }

      if (isPreviewElementId(edgeId)) {
        setIsPreviewToolbarVisible(true);
      } else {
        setIsPreviewToolbarVisible(false);
      }

      setSelectionMetaState([], edgeId);
    },
    [previewedSubGraphId, setNodeSelectionState, setSelectionMetaState]
  );

  const onConnectEnd = useCallback(
    (event) => {
      const pending = pendingConnectionRef.current;
      pendingConnectionRef.current = null;

      if (!pending?.nodeId) {
        return;
      }

      if (pending.completed) {
        return;
      }

      const eventTarget = event?.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      if (eventTarget.closest('.react-flow__handle')) {
        return;
      }

      const targetNodeElement = eventTarget.closest('.react-flow__node');
      if (!targetNodeElement) {
        return;
      }

      const droppedNodeId = targetNodeElement.getAttribute('data-id');
      if (!droppedNodeId || droppedNodeId === pending.nodeId) {
        return;
      }

      const isSourceDrag = pending.handleType !== 'target';
      const sourceNodeId = isSourceDrag ? pending.nodeId : droppedNodeId;
      const targetNodeId = isSourceDrag ? droppedNodeId : pending.nodeId;

      const sourceNode = nodes.find((node) => node.id === sourceNodeId);
      const targetNode = nodes.find((node) => node.id === targetNodeId);
      if (!sourceNode || !targetNode) {
        return;
      }

      // Canonical-rank magnet (mirror of onConnect): if both nodes have a
      // pipeline rank and the user dragged the wrong way, swap so the arrow
      // points at the higher-rank node.
      let orientedSource = sourceNode;
      let orientedTarget = targetNode;
      const srcRankEnd = CANONICAL_PIPELINE_RANK[sourceNode.data?.templateKey];
      const tgtRankEnd = CANONICAL_PIPELINE_RANK[targetNode.data?.templateKey];
      if (srcRankEnd != null && tgtRankEnd != null && srcRankEnd > tgtRankEnd) {
        orientedSource = targetNode;
        orientedTarget = sourceNode;
      }

      if (!isConnectionAllowed({ source: orientedSource.id, target: orientedTarget.id }, nodes, nodeTypeMapRef.current)) {
        flashInvalidConnection(
          orientedSource.id,
          orientedTarget.id,
          `${orientedSource.data?.label || 'This node'} can\u2019t connect to ${orientedTarget.data?.label || 'that node'}`,
        );
        return;
      }

      const targetRect = getNodeRect(orientedTarget);

      let clientX = null;
      let clientY = null;
      if ('clientX' in event && 'clientY' in event) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if ('changedTouches' in event && event.changedTouches?.[0]) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
      }

      const dropPoint = clientX != null && clientY != null ? screenToFlowPosition({ x: clientX, y: clientY }) : getSidePoint(targetRect, 'left');

      const preferredTargetSide = getNearestSideToPoint(targetRect, dropPoint);
      const fallbackSourceSide = getNearestSideToPoint(getNodeRect(orientedSource), {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      });
      const preferredSourceSide = isSourceDrag
        ? parseSideFromHandleId(pending.handleId) || fallbackSourceSide
        : fallbackSourceSide;

      const obstacleRects = nodes
        .filter((node) => node.id !== orientedSource.id && node.id !== orientedTarget.id)
        .map((node) => getNodeRect(node));

      const resolvedHandles = chooseBestHandlePair({
        sourceNode: orientedSource,
        targetNode: orientedTarget,
        existingEdges: edges,
        preferredSourceSide,
        preferredTargetSide,
        obstacleRects,
      });

      setEdges((currentEdges) => {
        const nextConnection = {
          source: orientedSource.id,
          sourceHandle: resolvedHandles.sourceHandle,
          target: orientedTarget.id,
          targetHandle: resolvedHandles.targetHandle,
          type: pickEdgeRoutingType(orientedSource, orientedTarget, resolvedHandles.sourceHandle, resolvedHandles.targetHandle),
        };

        const alreadyExists = currentEdges.some(
          (edge) =>
            edge.source === nextConnection.source && edge.target === nextConnection.target
        );
        if (alreadyExists) {
          return currentEdges;
        }

        return addEdge(makeEdgePayload(nextConnection), currentEdges);
      });
    },
    [edges, nodes, screenToFlowPosition, setEdges, flashInvalidConnection]
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      // Blueprint flow drag: load the full flow from backend
      const rawFlowId = event.dataTransfer.getData('application/xrag-flow');
      if (rawFlowId) {
        loadCanvasFlowFromBackend(rawFlowId);
        return;
      }

      const rawTemplate = event.dataTransfer.getData('application/xrag-node');
      if (!rawTemplate) {
        return;
      }

      let payload;
      try {
        payload = JSON.parse(rawTemplate);
      } catch {
        return;
      }

      const template = templateByKey[payload.templateKey];
      if (!template) {
        return;
      }

      const nodePosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      let nextSelectedNodeIds = [];

      setNodes((currentNodes) => {
        const nextId = `node-${Date.now()}`;
        const normalizedBasePosition = findAvailableInsertPosition(nodePosition, currentNodes);

        if (template.key === USER_TEMPLATE_KEY) {
          const questionId = `node-${Date.now()}-q`;
          const userNode = {
            id: nextId,
            type: 'ragNode',
            position: normalizedBasePosition,
            data: buildNodeData(template.key),
          };
          const questionPosition = findAvailableInsertPosition(
            { x: normalizedBasePosition.x + MIN_INSERT_SPACING_X, y: normalizedBasePosition.y },
            [...currentNodes, userNode]
          );
          const questionNode = {
            id: questionId,
            type: 'ragNode',
            position: questionPosition,
            data: buildNodeData(QUESTION_TEMPLATE_KEY),
          };
          const linked = createPairLink(userNode, questionNode);

          setEdges((currentEdges) =>
            {
              const allNodesForRouting = [...currentNodes, ...linked];
              const obstacleRects = buildObstacleRectsForPair(allNodesForRouting, linked[0].id, linked[1].id);
              const handles = chooseBestHandlePair({
                sourceNode: linked[0],
                targetNode: linked[1],
                existingEdges: currentEdges,
                preferredSourceSide: 'right',
                preferredTargetSide: 'left',
                obstacleRects,
              });

              return addEdge(
                makeEdgePayload({
                  source: linked[0].id,
                  sourceHandle: handles.sourceHandle,
                  target: linked[1].id,
                  targetHandle: handles.targetHandle,
                }),
                currentEdges
              );
            }
          );
          nextSelectedNodeIds = [linked[0].id, linked[1].id];
          setSelectedNodeId(linked[0].id);

          return [...currentNodes, linked[0], linked[1]];
        }

        nextSelectedNodeIds = [nextId];
        setSelectedNodeId(nextId);

        return [
          ...currentNodes,
          {
            id: nextId,
            type: 'ragNode',
            position: normalizedBasePosition,
            data: buildNodeData(template.key),
            selected: true,
          },
        ];
      });

      setSelectedNodeIds(nextSelectedNodeIds);
      setSelectedEdgeId(null);
    },
    [loadCanvasFlowFromBackend, screenToFlowPosition, setEdges, setNodes]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const selectedNode = useMemo(() => {
    const regularNode = nodes.find((node) => node.id === selectedNodeId);
    if (regularNode) {
      return regularNode;
    }

    if (!selectedNodeId || !previewedSubGraphId || !isPreviewElementId(selectedNodeId)) {
      return null;
    }

    const previewPrefix = `preview-${previewedSubGraphId}-`;
    if (!String(selectedNodeId).startsWith(previewPrefix)) {
      return null;
    }

    const originalNodeId = String(selectedNodeId).slice(previewPrefix.length);
    const previewedSubGraphNode = nodes.find((node) => node.id === previewedSubGraphId && node.data?.templateKey === SUBGRAPH_TEMPLATE_KEY);
    const collapsedNodes = Array.isArray(previewedSubGraphNode?.data?.config?.collapsedNodes) ? previewedSubGraphNode.data.config.collapsedNodes : [];
    const collapsedNode = collapsedNodes.find((node) => node.id === originalNodeId);
    if (!collapsedNode) {
      return null;
    }

    return {
      ...collapsedNode,
      id: selectedNodeId,
      data: {
        ...collapsedNode.data,
        isPreviewNode: true,
      },
    };
  }, [nodes, previewedSubGraphId, selectedNodeId]);
  const selectedSubGraphNode = selectedNode?.data?.templateKey === SUBGRAPH_TEMPLATE_KEY;
  const effectiveSelectedNodeIds = useMemo(() => {
    if (selectedNodeIds.length > 0) {
      return selectedNodeIds;
    }

    const nodeFlagSelectedIds = nodes.filter((node) => node.selected).map((node) => node.id);
    if (nodeFlagSelectedIds.length > 0) {
      return nodeFlagSelectedIds;
    }

    return selectedNode ? [selectedNode.id] : [];
  }, [nodes, selectedNode, selectedNodeIds]);
  const selectedNodeIdSet = useMemo(() => new Set(effectiveSelectedNodeIds), [effectiveSelectedNodeIds]);
  const selectedNodeBatch = useMemo(() => nodes.filter((node) => selectedNodeIdSet.has(node.id)), [nodes, selectedNodeIdSet]);
  const selectedContainsSubGraph = selectedNodeBatch.some((node) => node.data?.templateKey === SUBGRAPH_TEMPLATE_KEY);
  const isPreviewOpen = Boolean(previewedSubGraphId);
  const selectedPreviewNodeOriginalIds = useMemo(() => {
    if (!previewedSubGraphId) {
      return [];
    }

    const previewPrefix = `preview-${previewedSubGraphId}-`;
    return effectiveSelectedNodeIds
      .filter((nodeId) => String(nodeId).startsWith(previewPrefix))
      .map((nodeId) => String(nodeId).slice(previewPrefix.length));
  }, [effectiveSelectedNodeIds, previewedSubGraphId]);

  const canPackSelection = isPreviewOpen
    ? isPreviewToolbarVisible && selectedPreviewNodeOriginalIds.length > 1
    : effectiveSelectedNodeIds.length > 1 && !selectedContainsSubGraph;
  const canOpenSubGraphPreview = Boolean(selectedSubGraphNode && !isPreviewOpen);
  const canCloseSubGraphPreview = Boolean(isPreviewOpen && isPreviewToolbarVisible);
  const canPermanentlyUnpack = Boolean((selectedSubGraphNode && !isPreviewOpen) || (isPreviewOpen && isPreviewToolbarVisible));
  const shouldShowSelectionToolbar = canPackSelection || canOpenSubGraphPreview || canCloseSubGraphPreview || canPermanentlyUnpack;
  const nodeState = useMemo(() => {
    return nodes.reduce((accumulator, node) => {
      accumulator[node.id] = {
        templateKey: node.data.templateKey,
        label: node.data.label,
        category: node.data.category,
        config: node.data.config,
      };
      return accumulator;
    }, {});
  }, [nodes]);

  const packSelectedNodes = () => {
    if (!selectedNode) {
      return;
    }

    if (selectedNode.data?.isPreviewNode && previewedSubGraphId && isPreviewElementId(selectedNode.id)) {
      const previewPrefix = `preview-${previewedSubGraphId}-`;
      const originalNodeId = String(selectedNode.id).startsWith(previewPrefix) ? String(selectedNode.id).slice(previewPrefix.length) : null;
      if (!originalNodeId) {
        return;
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== previewedSubGraphId || node.data?.templateKey !== SUBGRAPH_TEMPLATE_KEY) {
            return node;
          }

          const hostCollapsedNodes = Array.isArray(node.data?.config?.collapsedNodes) ? node.data.config.collapsedNodes : [];
          const hostCollapsedEdges = Array.isArray(node.data?.config?.collapsedEdges) ? node.data.config.collapsedEdges : [];
          const hostSelectedNodes = hostCollapsedNodes.filter((candidate) => selectedNodeIdSet.has(candidate.id));
          if (hostSelectedNodes.length < 2) {
            return node;
          }

          const parentLevel = getSubGraphNestingLevel(node);
          const nestedLevel = Math.max(parentLevel + 1, ...hostSelectedNodes.map((candidate) => getSubGraphNestingLevel(candidate) + 1));
          const nestedSubGraphNode = {
            id: `subgraph-${Date.now()}-${Math.round(Math.random() * 100000)}`,
            type: 'ragNode',
            position: {
              x: Math.round(centerX - NODE_WIDTH / 2),
              y: Math.round(centerY - NODE_HEIGHT / 2),
            },
            data: {
              ...buildNodeData(SUBGRAPH_TEMPLATE_KEY),
              label: subGraphLabel,
              description: `Collapsed group (${hostSelectedNodes.length} nodes)`,
              config: {
                nodeCount: hostSelectedNodes.length,
                nestingLevel: nestedLevel,
                members: hostSelectedNodes.map((candidate) => candidate.id),
                previewLayout: hostSelectedNodes.reduce((accumulator, candidate) => {
                  accumulator[candidate.id] = {
                    x: Math.round(candidate.position.x - (centerX - NODE_WIDTH / 2)),
                    y: Math.round(candidate.position.y - (centerY - NODE_HEIGHT / 2)),
                  };
                  return accumulator;
                }, {}),
                collapsedNodes: hostSelectedNodes.map((candidate) => ({
                  ...candidate,
                  selected: false,
                })),
                collapsedEdges: [],
              },
            },
            selected: false,
          };

          const remainingCollapsedNodes = hostCollapsedNodes
            .filter((candidate) => !selectedNodeIdSet.has(candidate.id))
            .map((candidate) => ({ ...candidate, selected: false }));
          const nextCollapsedNodes = [...remainingCollapsedNodes, nestedSubGraphNode];
          const nodeById = new Map(nextCollapsedNodes.map((candidate) => [candidate.id, candidate]));
          const nextCollapsedEdgesByKey = new Map();

          const addBridgeEdge = (sourceId, targetId) => {
            if (!sourceId || !targetId || sourceId === targetId) {
              return;
            }

            const dedupeKey = `${sourceId}->${targetId}`;
            if (nextCollapsedEdgesByKey.has(dedupeKey)) {
              return;
            }

            const sourceNode = nodeById.get(sourceId);
            const targetNode = nodeById.get(targetId);
            if (!sourceNode || !targetNode) {
              return;
            }

            const directionalHandles = getDirectionalHandles(sourceNode.position, targetNode.position);
            const obstacleRects = buildObstacleRectsForPair(nextCollapsedNodes, sourceId, targetId);
            const resolvedHandles = chooseBestHandlePair({
              sourceNode,
              targetNode,
              existingEdges: Array.from(nextCollapsedEdgesByKey.values()),
              preferredSourceSide: parseSideFromHandleId(directionalHandles.sourceHandle),
              preferredTargetSide: parseSideFromHandleId(directionalHandles.targetHandle),
              obstacleRects,
            });

            nextCollapsedEdgesByKey.set(
              dedupeKey,
              makeEdgePayload({
                source: sourceId,
                sourceHandle: resolvedHandles.sourceHandle,
                target: targetId,
                targetHandle: resolvedHandles.targetHandle,
              })
            );
          };

          hostCollapsedEdges.forEach((edge) => {
            const sourceInside = selectedNodeIdSet.has(edge.source);
            const targetInside = selectedNodeIdSet.has(edge.target);

            if (sourceInside && targetInside) {
              nestedSubGraphNode.data.config.collapsedEdges.push(edge);
              return;
            }

            if (sourceInside && !targetInside) {
              nestedSubGraphNode.data.config.collapsedEdges.push(edge);
              addBridgeEdge(nestedSubGraphNode.id, edge.target);
              return;
            }

            if (!sourceInside && targetInside) {
              nestedSubGraphNode.data.config.collapsedEdges.push(edge);
              addBridgeEdge(edge.source, nestedSubGraphNode.id);
              return;
            }

            nextCollapsedEdgesByKey.set(`keep-${edge.id}`, edge);
          });

          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                nodeCount: nextCollapsedNodes.length,
                members: nextCollapsedNodes.map((candidate) => candidate.id),
                collapsedNodes: nextCollapsedNodes,
                collapsedEdges: Array.from(nextCollapsedEdgesByKey.values()),
              },
            },
          };
        })
      );

      setIsPreviewToolbarVisible(true);
      setSelectedNodeId(`preview-${previewedSubGraphId}-${nestedSubGraphId}`);
      setSelectedNodeIds([`preview-${previewedSubGraphId}-${nestedSubGraphId}`]);
      setSelectedEdgeId(null);
      return;
    }

    const uniqueSelectedNodeIds = Array.from(new Set(selectedNodeIds));
    if (uniqueSelectedNodeIds.length < 2) {
      return;
    }

    const selectedSet = new Set(uniqueSelectedNodeIds);
    const selectedNodesBatch = nodes.filter((node) => selectedSet.has(node.id));
    if (selectedNodesBatch.length < 2) {
      return;
    }

    const currentSubGraphCount = nodes.filter((node) => node.data?.templateKey === SUBGRAPH_TEMPLATE_KEY).length;
    const suggestedName = `Sub-graph ${currentSubGraphCount + 1}`;
    const customName = window.prompt('Sub-graph name', suggestedName);
    if (customName === null) {
      return;
    }

    const subGraphLabel = customName.trim() || suggestedName;
    const selectedRects = selectedNodesBatch.map((node) => getNodeRect(node));
    const bounds = getRectBounds(selectedRects);
    if (!bounds) {
      return;
    }

    const centerX = bounds.left + (bounds.right - bounds.left) / 2;
    const centerY = bounds.top + (bounds.bottom - bounds.top) / 2;
    const subGraphNode = {
      id: `subgraph-${Date.now()}-${Math.round(Math.random() * 100000)}`,
      type: 'ragNode',
      position: {
        x: Math.round(centerX - NODE_WIDTH / 2),
        y: Math.round(centerY - NODE_HEIGHT / 2),
      },
      data: {
        ...buildNodeData(SUBGRAPH_TEMPLATE_KEY),
        label: subGraphLabel,
        description: `Collapsed group (${selectedNodesBatch.length} nodes)`,
        config: {
          nodeCount: selectedNodesBatch.length,
          nestingLevel: Math.max(1, ...selectedNodesBatch.map((node) => getSubGraphNestingLevel(node) + 1)),
          members: uniqueSelectedNodeIds,
          previewLayout: selectedNodesBatch.reduce((accumulator, node) => {
            accumulator[node.id] = {
              x: Math.round(node.position.x - (centerX - NODE_WIDTH / 2)),
              y: Math.round(node.position.y - (centerY - NODE_HEIGHT / 2)),
            };
            return accumulator;
          }, {}),
          collapsedNodes: selectedNodesBatch.map((node) => ({
            ...node,
            selected: false,
          })),
          collapsedEdges: [],
        },
      },
      selected: true,
    };

    const remainingNodes = nodes
      .filter((node) => !selectedSet.has(node.id))
      .map((node) => ({
        ...node,
        selected: false,
      }));
    const nextNodes = [...remainingNodes, subGraphNode];
    const nodeById = new Map(nextNodes.map((node) => [node.id, node]));
    const nextEdgesByKey = new Map();

    const addBridgeEdge = (sourceId, targetId) => {
      if (!sourceId || !targetId || sourceId === targetId) {
        return;
      }

      const dedupeKey = `${sourceId}->${targetId}`;
      if (nextEdgesByKey.has(dedupeKey)) {
        return;
      }

      const sourceNode = nodeById.get(sourceId);
      const targetNode = nodeById.get(targetId);
      if (!sourceNode || !targetNode) {
        return;
      }

      const directionalHandles = getDirectionalHandles(sourceNode.position, targetNode.position);
      const obstacleRects = buildObstacleRectsForPair(nextNodes, sourceId, targetId);
      const resolvedHandles = chooseBestHandlePair({
        sourceNode,
        targetNode,
        existingEdges: Array.from(nextEdgesByKey.values()),
        preferredSourceSide: parseSideFromHandleId(directionalHandles.sourceHandle),
        preferredTargetSide: parseSideFromHandleId(directionalHandles.targetHandle),
        obstacleRects,
      });

      nextEdgesByKey.set(
        dedupeKey,
        makeEdgePayload({
          source: sourceId,
          sourceHandle: resolvedHandles.sourceHandle,
          target: targetId,
          targetHandle: resolvedHandles.targetHandle,
        })
      );
    };

    edges.forEach((edge) => {
      const sourceInside = selectedSet.has(edge.source);
      const targetInside = selectedSet.has(edge.target);

      if (sourceInside && targetInside) {
        subGraphNode.data.config.collapsedEdges.push(edge);
        return;
      }

      if (sourceInside && !targetInside) {
        subGraphNode.data.config.collapsedEdges.push(edge);
        addBridgeEdge(subGraphNode.id, edge.target);
        return;
      }

      if (!sourceInside && targetInside) {
        subGraphNode.data.config.collapsedEdges.push(edge);
        addBridgeEdge(edge.source, subGraphNode.id);
        return;
      }

      nextEdgesByKey.set(`keep-${edge.id}`, edge);
    });

    setNodes(nextNodes);
    setEdges(Array.from(nextEdgesByKey.values()));
    setPreviewedSubGraphId(null);
    setIsPreviewToolbarVisible(false);
    setSelectedNodeId(subGraphNode.id);
    setSelectedNodeIds([subGraphNode.id]);
    setSelectedEdgeId(null);
  };

  const updateSelectedNodeConfig = (fieldName, fieldValue) => {
    if (!selectedNode) return;

    if (selectedNode.data?.isPreviewNode && previewedSubGraphId) {
      const previewPrefix = `preview-${previewedSubGraphId}-`;
      const originalNodeId = String(selectedNode.id).startsWith(previewPrefix)
        ? String(selectedNode.id).slice(previewPrefix.length)
        : null;
      if (!originalNodeId) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== previewedSubGraphId) return node;
          const collapsedNodes = Array.isArray(node.data?.config?.collapsedNodes)
            ? node.data.config.collapsedNodes
            : [];
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                collapsedNodes: collapsedNodes.map((cn) =>
                  cn.id !== originalNodeId
                    ? cn
                    : { ...cn, data: { ...cn.data, config: { ...cn.data.config, [fieldName]: fieldValue } } }
                ),
              },
            },
          };
        })
      );
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            config: { ...node.data.config, [fieldName]: fieldValue },
          },
        };
      })
    );
  };

  const updateSelectedNodeLabel = (label) => {
    if (!selectedNode) return;
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return { ...node, data: { ...node.data, label } };
      })
    );
  };

  const openSelectedSubGraphPreview = () => {
    if (!selectedSubGraphNode || !selectedNode?.id) {
      return;
    }

    const collapsedNodes = Array.isArray(selectedNode.data?.config?.collapsedNodes) ? selectedNode.data.config.collapsedNodes : [];
    const hasRenderableNodes = collapsedNodes.some(
      (node) => node && node.id && node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y) && node.data
    );
    if (!hasRenderableNodes) {
      return;
    }

    setPreviewedSubGraphId(selectedNode.id);
    setIsPreviewToolbarVisible(false);
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (!node.selected) {
          return node;
        }

        return {
          ...node,
          selected: false,
        };
      })
    );
    setSelectionMetaState([], null);
  };

  const closeSelectedSubGraphPreview = () => {
    if (!previewedSubGraphId) {
      return;
    }

    setPreviewedSubGraphId(null);
    setIsPreviewToolbarVisible(false);
  };

  const permanentlyUnpackSelectedSubGraph = () => {
    const activeSubGraphNode = previewedSubGraphId
      ? nodes.find((node) => node.id === previewedSubGraphId && node.data?.templateKey === SUBGRAPH_TEMPLATE_KEY)
      : selectedNode && selectedNode.data?.templateKey === SUBGRAPH_TEMPLATE_KEY
        ? selectedNode
        : null;

    if (!activeSubGraphNode) {
      return;
    }

    const collapsedNodes = Array.isArray(activeSubGraphNode.data?.config?.collapsedNodes) ? activeSubGraphNode.data.config.collapsedNodes : [];
    const collapsedEdges = Array.isArray(activeSubGraphNode.data?.config?.collapsedEdges) ? activeSubGraphNode.data.config.collapsedEdges : [];
    const previewLayout = activeSubGraphNode.data?.config?.previewLayout || {};

    if (collapsedNodes.length === 0) {
      return;
    }

    const subGraphNodeId = activeSubGraphNode.id;
    const restoredNodes = collapsedNodes.map((node) => {
      const offset = previewLayout[node.id];
      const nextPosition = offset
        ? {
            x: Math.round(activeSubGraphNode.position.x + offset.x),
            y: Math.round(activeSubGraphNode.position.y + offset.y),
          }
        : node.position;

      return {
        ...node,
        position: nextPosition,
        selected: false,
      };
    });

    const restoredNodeIdSet = new Set(restoredNodes.map((node) => node.id));
    const currentNodesWithoutSubGraph = nodes.filter((node) => node.id !== subGraphNodeId);

    const filteredEdges = edges.filter((edge) => edge.source !== subGraphNodeId && edge.target !== subGraphNodeId);
    const restoredCollapsedEdges = collapsedEdges.filter((edge) => restoredNodeIdSet.has(edge.source) || restoredNodeIdSet.has(edge.target));

    const nextNodes = [...currentNodesWithoutSubGraph, ...restoredNodes];
    const nextEdges = [...filteredEdges, ...restoredCollapsedEdges];

    setNodes(nextNodes);
    setEdges(nextEdges);
    setPreviewedSubGraphId((previous) => (previous === subGraphNodeId ? null : previous));
    setIsPreviewToolbarVisible(false);
    setSelectedNodeId(restoredNodes[0]?.id || null);
    setSelectedNodeIds(restoredNodes[0]?.id ? [restoredNodes[0].id] : []);
    setSelectedEdgeId(null);
  };

  const removeSelectedNode = () => {
    const nodeIdsForDelete = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (nodeIdsForDelete.length === 0) {
      return;
    }

    const idsToDelete = new Set();
    nodeIdsForDelete.forEach((nodeId) => {
      const cascadeIds = getCascadeDeleteNodeIds(nodeId, nodes);
      cascadeIds.forEach((id) => idsToDelete.add(id));
    });

    setNodes((currentNodes) => currentNodes.filter((node) => !idsToDelete.has(node.id)));
    setEdges((currentEdges) => currentEdges.filter((edge) => !idsToDelete.has(edge.source) && !idsToDelete.has(edge.target)));
    setPreviewedSubGraphId((previous) => (previous && idsToDelete.has(previous) ? null : previous));
    setIsPreviewToolbarVisible(false);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setNodeSettingsOpen(false);
  };

  const runChatSimulation = () => {
    runCanvasFlowOnBackend();
  };

  const activeConfigEntries = selectedNode ? Object.entries(selectedNode.data.config || {}) : [];
  const isDocumentUploadNode = selectedNode?.data?.templateKey === 'input-upload';
  const isChunkingNode = selectedNode?.data?.templateKey === 'process-chunking';
  const isEmbeddingNode = selectedNode?.data?.templateKey === 'process-embedding';
  const isVectorDatabaseNode = selectedNode?.data?.templateKey === 'storage-vector';
  const isGraphDatabaseNode = selectedNode?.data?.templateKey === 'storage-graph';
  const isRetrieverNode = selectedNode?.data?.templateKey === 'process-retriever';
  const isRerankerNode = selectedNode?.data?.templateKey === 'process-reranker';
  const isLlmNode = selectedNode?.data?.templateKey === 'brain-llm';
  const isSystemPromptNode = selectedNode?.data?.templateKey === 'input-system-prompt';
  const isResponseNode = selectedNode?.data?.templateKey === 'output-response';
  const isUserNode = selectedNode?.data?.templateKey === 'user-actor';
  const isQuestionNode = selectedNode?.data?.templateKey === 'input-question';
  const isUrlScraperNode = selectedNode?.data?.templateKey === 'input-url';
  const isQueryRewriterNode = selectedNode?.data?.templateKey === 'process-query-rewriter';
  const isHybridMergeNode = selectedNode?.data?.templateKey === 'process-hybrid-merge';
  const isContextCompressionNode = selectedNode?.data?.templateKey === 'process-context-compression';
  const isPiiRedactionNode = selectedNode?.data?.templateKey === 'process-pii-redaction';
  const isHallucinationGuardNode = selectedNode?.data?.templateKey === 'process-hallucination-guard';
  const isReflectionLoopNode = selectedNode?.data?.templateKey === 'process-reflection-loop';
  const isKVStoreNode = selectedNode?.data?.templateKey === 'storage-keyvalue';
  const isHyDEGenNode = selectedNode?.data?.templateKey === 'brain-hyde-gen';
  const isModelRouterNode = selectedNode?.data?.templateKey === 'brain-router';
  const isGuardrailsNode = selectedNode?.data?.templateKey === 'brain-guardrails';
  const isImageUploadNode = selectedNode?.data?.templateKey === 'input-image';
  const isVisionLLMNode = selectedNode?.data?.templateKey === 'brain-vision';
  const selectedTemplate = selectedNode ? templateByKey[selectedNode.data?.templateKey] : null;
  const isCustomNode = Boolean(selectedTemplate?.isCustom);

  // For a Chunking node, walk the edges in BOTH directions to find a
  // connected Embedding node and translate its config into a profile. The
  // profile drives the awakening UX in ChunkingSettingsPanel. We accept
  // either edge direction because the canonical RAG flow has Chunking → Embedding,
  // but the user may also wire it the other way around.
  const chunkingEmbeddingProfile = useMemo(() => {
    if (!isChunkingNode || !selectedNode) {
      return null;
    }
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const neighborEdges = edges.filter(
        (edge) => edge.target === currentId || edge.source === currentId,
      );
      for (const edge of neighborEdges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const neighborNode = nodes.find((node) => node.id === neighborId);
        if (!neighborNode) continue;
        if (neighborNode.data?.templateKey === 'process-embedding') {
          const profile = profileFromEmbeddingConfig(neighborNode.data.config);
          if (profile) return profile;
        }
        stack.push(neighborNode.id);
      }
    }
    return null;
  }, [isChunkingNode, selectedNode, edges, nodes]);

  // Vector Database awakening — exactly mirrors the Chunking profile lookup.
  // The Vector DB inspector wakes up only when an upstream Embedding model is
  // wired in, so dimension/metric can be locked to the embedding's vector
  // space. We walk edges in BOTH directions for resilience even though the
  // canonical (and type-enforced) flow is Embedding -> Vector DB.
  const vectorDatabaseEmbeddingProfile = useMemo(() => {
    if (!isVectorDatabaseNode || !selectedNode) {
      return null;
    }
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const neighborEdges = edges.filter(
        (edge) => edge.target === currentId || edge.source === currentId,
      );
      for (const edge of neighborEdges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const neighborNode = nodes.find((node) => node.id === neighborId);
        if (!neighborNode) continue;
        if (neighborNode.data?.templateKey === 'process-embedding') {
          const profile = profileFromEmbeddingConfig(neighborNode.data.config);
          if (profile) return profile;
        }
        stack.push(neighborNode.id);
      }
    }
    return null;
  }, [isVectorDatabaseNode, selectedNode, edges, nodes]);

  // Graph Database awakening — needs ANY upstream chunks producer
  // (Chunking, Document Upload, Cleaning, Embedding pass-through). The
  // graph store does NOT depend on a vector space because entities and
  // relations are extracted from raw chunk text, not from embeddings.
  const GRAPH_CHUNKS_PRODUCER_KEYS = [
    'process-chunking',
    'process-cleaning',
    'process-embedding',
    'input-upload',
    'input-url',
  ];
  const graphDatabaseUpstreamProfile = useMemo(() => {
    if (!isGraphDatabaseNode || !selectedNode) {
      return null;
    }
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const neighborEdges = edges.filter(
        (edge) => edge.target === currentId || edge.source === currentId,
      );
      for (const edge of neighborEdges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const neighborNode = nodes.find((node) => node.id === neighborId);
        if (!neighborNode) continue;
        const key = neighborNode.data?.templateKey;
        if (GRAPH_CHUNKS_PRODUCER_KEYS.includes(key)) {
          return { sourceTemplate: key, hasChunks: true };
        }
        stack.push(neighborNode.id);
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGraphDatabaseNode, selectedNode, edges, nodes]);

  // Retriever awakening — needs BOTH a vector index (Vector DB or Embedding
  // fallback) AND a query source (Question / Query Rewriter / HyDE). We do a
  // single bidirectional traversal and collect both signals in one pass so
  // the panel can show partial-progress feedback.
  const QUERY_SOURCE_KEYS = ['input-question', 'process-query-rewriter', 'brain-hyde-gen'];
  const retrieverContextProfile = useMemo(() => {
    if (!isRetrieverNode || !selectedNode) {
      return { embeddingProfile: null, vectorStore: null, hasQuerySource: false, upstreamDocConfig: null };
    }
    let embeddingProfile = null;
    let vectorStore = null;
    let hasQuerySource = false;
    let upstreamDocConfig = null;
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const neighborEdges = edges.filter(
        (edge) => edge.target === currentId || edge.source === currentId,
      );
      for (const edge of neighborEdges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const neighborNode = nodes.find((node) => node.id === neighborId);
        if (!neighborNode) continue;
        const key = neighborNode.data?.templateKey;
        const config = neighborNode.data?.config || {};
        if (key === 'storage-vector' && !vectorStore) {
          vectorStore = {
            provider: config.provider,
            indexName: config.indexName || config.collection,
            namespace: config.namespace,
            collection: config.collection,
            metric: config.metric,
            hybridSearch: Boolean(config.hybridSearch),
          };
        }
        if (key === 'process-embedding' && !embeddingProfile) {
          const profile = profileFromEmbeddingConfig(config);
          if (profile) embeddingProfile = profile;
        }
        if (QUERY_SOURCE_KEYS.includes(key)) {
          hasQuerySource = true;
        }
        if (key === 'input-upload' && !upstreamDocConfig) {
          upstreamDocConfig = {
            scope: config.scope || 'all',
            selectedFolders: Array.isArray(config.selectedFolders) ? config.selectedFolders : [],
            selectedDocumentIds: Array.isArray(config.selectedDocumentIds) ? config.selectedDocumentIds : [],
            source_label: config.source_label || 'knowledge_base',
          };
        }
        stack.push(neighborNode.id);
      }
    }
    return { embeddingProfile, vectorStore, hasQuerySource, upstreamDocConfig };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetrieverNode, selectedNode, edges, nodes]);

  // Reranker awakening — needs upstream `chunks` (Retriever / HybridMerge /
  // VectorDB fallback) AND a query source. We also surface an estimated
  // chunk count from the upstream retriever so the panel can show how many
  // pairs will be scored.
  const CHUNK_PRODUCER_KEYS = [
    'process-retriever',
    'process-hybrid-merge',
    'storage-vector',
    'process-context-compression',
  ];
  const rerankerContextProfile = useMemo(() => {
    if (!isRerankerNode || !selectedNode) {
      return { hasChunksUpstream: false, hasQuerySource: false, upstreamChunkCount: null };
    }
    let hasChunksUpstream = false;
    let hasQuerySource = false;
    let upstreamChunkCount = null;
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const neighborEdges = edges.filter(
        (edge) => edge.target === currentId || edge.source === currentId,
      );
      for (const edge of neighborEdges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const neighborNode = nodes.find((node) => node.id === neighborId);
        if (!neighborNode) continue;
        const key = neighborNode.data?.templateKey;
        const config = neighborNode.data?.config || {};
        if (CHUNK_PRODUCER_KEYS.includes(key)) {
          hasChunksUpstream = true;
          if (key === 'process-retriever' && upstreamChunkCount === null) {
            upstreamChunkCount = config.topK ?? null;
          }
        }
        if (QUERY_SOURCE_KEYS.includes(key)) {
          hasQuerySource = true;
        }
        stack.push(neighborNode.id);
      }
    }
    return { hasChunksUpstream, hasQuerySource, upstreamChunkCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRerankerNode, selectedNode, edges, nodes]);

  // LLM (brain-llm) awakening — needs a query (text). Chunks and a typed
  // system_prompt are optional but improve grounding. We also detect whether
  // a dedicated `input-system-prompt` node is wired in so the panel can hide
  // the inline fallback textarea when the prompt comes from upstream.
  const llmContextProfile = useMemo(() => {
    if (!isLlmNode || !selectedNode) {
      return {
        hasQuerySource: false,
        hasChunksUpstream: false,
        hasSystemPromptUpstream: false,
        upstreamChunkCount: null,
      };
    }
    let hasQuerySource = false;
    let hasChunksUpstream = false;
    let hasSystemPromptUpstream = false;
    let upstreamChunkCount = null;
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const neighborEdges = edges.filter(
        (edge) => edge.target === currentId || edge.source === currentId,
      );
      for (const edge of neighborEdges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        const neighborNode = nodes.find((node) => node.id === neighborId);
        if (!neighborNode) continue;
        const key = neighborNode.data?.templateKey;
        const config = neighborNode.data?.config || {};
        // The reranker also produces a query-shaped output, so include it
        // alongside the canonical query sources.
        if (QUERY_SOURCE_KEYS.includes(key) || key === 'process-reranker') {
          hasQuerySource = true;
        }
        if (CHUNK_PRODUCER_KEYS.includes(key) || key === 'process-reranker') {
          hasChunksUpstream = true;
          if (upstreamChunkCount === null) {
            upstreamChunkCount = config.topK ?? config.topN ?? null;
          }
        }
        if (key === 'input-system-prompt') {
          hasSystemPromptUpstream = true;
        }
        stack.push(neighborNode.id);
      }
    }
    return { hasQuerySource, hasChunksUpstream, hasSystemPromptUpstream, upstreamChunkCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLlmNode, selectedNode, edges, nodes]);

  // Response (output-response) — wants to know what the upstream LLM is
  // emitting so the panel can show the format contract and warn when
  // citations are requested but the LLM does not produce them.
  const responseContextProfile = useMemo(() => {
    if (!isResponseNode || !selectedNode) {
      return { hasUpstreamProducer: false, upstreamFormat: null, upstreamHasCitations: false };
    }
    let hasUpstreamProducer = false;
    let upstreamFormat = null;
    let upstreamHasCitations = false;
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      // Walk upstream only — Response is a sink, so we follow incoming edges.
      const incomingEdges = edges.filter((edge) => edge.target === currentId);
      for (const edge of incomingEdges) {
        const upstreamNode = nodes.find((node) => node.id === edge.source);
        if (!upstreamNode) continue;
        const key = upstreamNode.data?.templateKey;
        const config = upstreamNode.data?.config || {};
        if (key === 'brain-llm') {
          hasUpstreamProducer = true;
          // Pull the negotiated response_format off the LLM metadata, when present.
          const meta = config.metadata || {};
          if (typeof meta.response_format === 'string' && !upstreamFormat) {
            upstreamFormat = meta.response_format;
          }
          // The reranker upstream of LLM is what feeds citations — but if the
          // LLM has chunks anywhere upstream, citations can be rendered.
          upstreamHasCitations = true;
        }
        stack.push(upstreamNode.id);
      }
    }
    return { hasUpstreamProducer, upstreamFormat, upstreamHasCitations };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResponseNode, selectedNode, edges, nodes]);

  // Question (input-question) — only needs to know whether a user-actor is
  // wired in upstream so the panel can show "locale defaults inherited".
  const questionContextProfile = useMemo(() => {
    if (!isQuestionNode || !selectedNode) return { hasUserContextUpstream: false };
    let hasUserContextUpstream = false;
    const visited = new Set();
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const incomingEdges = edges.filter((edge) => edge.target === currentId);
      for (const edge of incomingEdges) {
        const upstreamNode = nodes.find((node) => node.id === edge.source);
        if (!upstreamNode) continue;
        if (upstreamNode.data?.templateKey === 'user-actor') {
          hasUserContextUpstream = true;
          break;
        }
        stack.push(upstreamNode.id);
      }
    }
    return { hasUserContextUpstream };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuestionNode, selectedNode, edges, nodes]);

  const documentChunkingPayload = isDocumentUploadNode
    ? buildDocumentUploadChunkingPayload(selectedNode.data.config)
    : null;
  const visibleEdges = useMemo(() => {
    const nodeColorById = new Map(
      nodes.map((node) => [node.id, paletteFromColorClass(node.data?.colorClass).accent])
    );
    const STATUS_COLOR = { running: '#f59e0b', ok: '#10b981', error: '#ef4444' };

    return edges.map((edge) => {
      const isSelected = edge.id === selectedEdgeId;
      const sourceColor = nodeColorById.get(edge.source) || '#d97706';
      const targetColor = nodeColorById.get(edge.target) || sourceColor;
      // If a run status has been written into the edge data, the arrow head
      // must take the status color so it visually matches the green/red wipe
      // of the body. Otherwise fall back to the target node accent color.
      const runStatus = edge.data?.runStatus;
      const markerColor = STATUS_COLOR[runStatus] || targetColor;

      return {
        ...edge,
        type: 'gradient',
        style: isSelected ? EDGE_SELECTED_STYLE : EDGE_BASE_STYLE,
        interactionWidth: 36,
        data: { ...(edge.data || {}), sourceColor, targetColor },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: markerColor,
          width: 12,
          height: 12,
        },
      };
    });
  }, [edges, nodes, selectedEdgeId]);

  const previewedSubGraphNode = useMemo(() => {
    if (!previewedSubGraphId) {
      return null;
    }

    return nodes.find((node) => node.id === previewedSubGraphId && node.data?.templateKey === SUBGRAPH_TEMPLATE_KEY) || null;
  }, [nodes, previewedSubGraphId]);

  const previewNodes = useMemo(() => {
    if (!previewedSubGraphNode) {
      return [];
    }

    const collapsedNodes = Array.isArray(previewedSubGraphNode.data?.config?.collapsedNodes) ? previewedSubGraphNode.data.config.collapsedNodes : [];
    const previewLayout = previewedSubGraphNode.data?.config?.previewLayout || {};

    return collapsedNodes
      .filter((node) => node && node.id && node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y) && node.data)
      .map((node) => {
      const offset = previewLayout[node.id];
      const sgX = previewedSubGraphNode.position.x;
      const sgY = previewedSubGraphNode.position.y;
      const previewNodeId = `preview-${previewedSubGraphNode.id}-${node.id}`;
      const previewPosition =
        offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) && Number.isFinite(sgX) && Number.isFinite(sgY)
          ? {
              x: Math.round(sgX + offset.x),
              y: Math.round(sgY + offset.y),
            }
          : { x: Math.round(node.position.x), y: Math.round(node.position.y) };

      // Strip ReactFlow-internal properties that must not leak onto a new node identity
      const { positionAbsolute: _pa, dragging: _d, resizing: _r, ...cleanNode } = node;

      return {
        ...cleanNode,
        id: previewNodeId,
        position: previewPosition,
        selected: selectedNodeIds.includes(previewNodeId),
        draggable: false,
        selectable: true,
        connectable: false,
        deletable: true,
        data: {
          ...node.data,
          isPreviewNode: true,
        },
      };
      });
  }, [previewedSubGraphNode, selectedNodeIds]);

  const previewEdges = useMemo(() => {
    if (!previewedSubGraphNode || previewNodes.length === 0) {
      return [];
    }

    const collapsedEdges = Array.isArray(previewedSubGraphNode.data?.config?.collapsedEdges) ? previewedSubGraphNode.data.config.collapsedEdges : [];
    const collapsedNodes = Array.isArray(previewedSubGraphNode.data?.config?.collapsedNodes) ? previewedSubGraphNode.data.config.collapsedNodes : [];
    const collapsedNodeIdSet = new Set(
      collapsedNodes.filter((node) => node && node.id).map((node) => node.id)
    );
    const renderNodeIdSet = new Set([...nodes.map((node) => node.id), ...previewNodes.map((node) => node.id)]);

    return collapsedEdges
      .map((edge, index) => {
        if (!edge || !edge.source || !edge.target) {
          return null;
        }

        const previewEdgeId = `preview-edge-${previewedSubGraphNode.id}-${index}`;
        const mappedSource = collapsedNodeIdSet.has(edge.source) ? `preview-${previewedSubGraphNode.id}-${edge.source}` : edge.source;
        const mappedTarget = collapsedNodeIdSet.has(edge.target) ? `preview-${previewedSubGraphNode.id}-${edge.target}` : edge.target;

        if (!renderNodeIdSet.has(mappedSource) || !renderNodeIdSet.has(mappedTarget) || mappedSource === mappedTarget) {
          return null;
        }

        return {
          ...edge,
          id: previewEdgeId,
          source: mappedSource,
          target: mappedTarget,
          selected: previewEdgeId === selectedEdgeId,
          selectable: true,
          focusable: true,
          deletable: true,
          animated: true,
          type: 'gradient',
          interactionWidth: previewEdgeId === selectedEdgeId ? 16 : 28,
          zIndex: 999,
          data: {
            ...(edge.data || {}),
            sourceColor: paletteFromColorClass(
              previewNodes.find((n) => n.id === mappedSource)?.data?.colorClass ||
                nodes.find((n) => n.id === mappedSource)?.data?.colorClass
            ).accent,
            targetColor: paletteFromColorClass(
              previewNodes.find((n) => n.id === mappedTarget)?.data?.colorClass ||
                nodes.find((n) => n.id === mappedTarget)?.data?.colorClass
            ).accent,
          },
          style: {
            ...(previewEdgeId === selectedEdgeId ? EDGE_SELECTED_STYLE : EDGE_BASE_STYLE),
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: paletteFromColorClass(
              previewNodes.find((n) => n.id === mappedTarget)?.data?.colorClass ||
                nodes.find((n) => n.id === mappedTarget)?.data?.colorClass
            ).accent,
            width: 12,
            height: 12,
          },
        };
      })
      .filter(Boolean);
  }, [nodes, previewNodes, previewedSubGraphNode, selectedEdgeId]);

  const previewBackdropRect = useMemo(() => {
    if (previewNodes.length === 0) {
      return null;
    }

    const previewBounds = previewNodes.reduce(
      (accumulator, node) => {
        const width = node.measured?.width || NODE_WIDTH;
        const height = node.measured?.height || NODE_HEIGHT;
        return {
          left: Math.min(accumulator.left, node.position.x),
          top: Math.min(accumulator.top, node.position.y),
          right: Math.max(accumulator.right, node.position.x + width),
          bottom: Math.max(accumulator.bottom, node.position.y + height),
        };
      },
      {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      }
    );

    const previewPadding = 26;
    return {
      left: Math.round(previewBounds.left - previewPadding),
      top: Math.round(previewBounds.top - previewPadding),
      right: Math.round(previewBounds.right + previewPadding),
      bottom: Math.round(previewBounds.bottom + previewPadding),
      width: Math.round(previewBounds.right - previewBounds.left + previewPadding * 2),
      height: Math.round(previewBounds.bottom - previewBounds.top + previewPadding * 2),
    };
  }, [previewNodes]);

  const renderNodes = useMemo(() => {
    if (previewNodes.length === 0 || !previewBackdropRect) {
      return nodes;
    }

    const baseNodes = nodes.filter((node) => node.id !== previewedSubGraphId);
    const previewBackdropNode = {
      id: `preview-bg-${previewedSubGraphId}`,
      type: 'previewBackdropNode',
      position: {
        x: previewBackdropRect.left,
        y: previewBackdropRect.top,
      },
      selectable: false,
      draggable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      data: {
        width: previewBackdropRect.width,
        height: previewBackdropRect.height,
        theme: getPreviewBackdropTheme(getSubGraphNestingLevel(previewedSubGraphNode)),
      },
      style: { pointerEvents: 'none' },
      zIndex: -10,
    };

    return [previewBackdropNode, ...baseNodes, ...previewNodes];
  }, [nodes, previewBackdropRect, previewNodes, previewedSubGraphId, previewedSubGraphNode]);

  const renderEdges = useMemo(() => {
    if (!previewedSubGraphId) {
      return visibleEdges;
    }

    const baseEdges = visibleEdges.filter((edge) => edge.source !== previewedSubGraphId && edge.target !== previewedSubGraphId);

    return [...baseEdges, ...previewEdges];
  }, [previewEdges, previewedSubGraphId, visibleEdges]);

  const toggleCategory = (category) => {
    setExpandedCategories((previous) => ({
      ...previous,
      [category]: !previous[category],
    }));
  };

  const insertBlueprint = (blueprintId) => {
    const blueprint = RAG_BLUEPRINTS.find((item) => item.id === blueprintId);
    if (!blueprint) {
      return;
    }

    setIsBlueprintMenuOpen(false);

    // Preferred path: load the fully pre-configured flow saved on the backend
    // (every node arrives with its real production config — providers, models,
    // chunk sizes, prompts, retrieval params, ...). Falls back to the legacy
    // "insert empty templates" behaviour only if the backend flow is missing.
    if (blueprint.backendFlowId) {
      loadCanvasFlowFromBackend(blueprint.backendFlowId);
      return;
    }

    const maxX = nodes.length ? Math.max(...nodes.map((node) => node.position.x)) : 0;
    const startX = nodes.length ? maxX + BLUEPRINT_BASE_SPACING_X : 80;
    const startY = 140;

    const generated = buildBlueprintGraph(blueprint, startX, startY, nodes, edges);
    setNodes((currentNodes) => [...currentNodes, ...generated.nodes]);
    setEdges((currentEdges) => [...currentEdges, ...generated.edges]);
    setSelectedNodeId(generated.nodes[0]?.id || null);
    setSelectedNodeIds(generated.nodes[0]?.id ? [generated.nodes[0].id] : []);
    setSelectedEdgeId(null);
  };

  const selectionRect = useMemo(() => {
    if (!selectionBox) {
      return null;
    }

    const left = Math.min(selectionBox.startX, selectionBox.currentX);
    const top = Math.min(selectionBox.startY, selectionBox.currentY);
    const width = Math.abs(selectionBox.currentX - selectionBox.startX);
    const height = Math.abs(selectionBox.currentY - selectionBox.startY);

    return {
      left,
      top,
      width,
      height,
    };
  }, [selectionBox]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      setSelectionToolbarRect((previous) => (previous === null ? previous : null));
      return;
    }

    if (!shouldShowSelectionToolbar) {
      setSelectionToolbarRect((previous) => (previous === null ? previous : null));
      return;
    }

    const isPreviewToolbarMode = Boolean(isPreviewOpen && isPreviewToolbarVisible && previewedSubGraphId);

    const activeNodeIds = effectiveSelectedNodeIds;
    if (!isPreviewToolbarMode && activeNodeIds.length === 0) {
      setSelectionToolbarRect((previous) => (previous === null ? previous : null));
      return;
    }

    const measureToolbarRect = () => {
      if (isPreviewOpen && isPreviewToolbarVisible && previewedSubGraphId) {
        const backdropElement = viewport.querySelector(`.react-flow__node[data-id="preview-bg-${previewedSubGraphId}"]`);
        if (backdropElement) {
          const rect = backdropElement.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          const toolbarWidth = 236;
          const anchorTop = Math.min(
            Math.max(12, rect.top - viewportRect.top),
            Math.max(12, viewportRect.height - 56)
          );
          const preferredLeft = rect.left - viewportRect.left - toolbarWidth - 12;
          const fallbackLeft = rect.right - viewportRect.left + 12;
          const unclampedLeft = preferredLeft >= 12 ? preferredLeft : fallbackLeft;
          const anchorLeft = Math.min(
            Math.max(12, unclampedLeft),
            Math.max(12, viewportRect.width - toolbarWidth - 12)
          );

          setSelectionToolbarRect((previous) => {
            if (previous && previous.top === anchorTop && previous.left === anchorLeft) {
              return previous;
            }

            return {
              top: anchorTop,
              left: anchorLeft,
            };
          });
          return;
        }
      }

      const nodeElements = activeNodeIds
        .map((nodeId) => viewport.querySelector(`.react-flow__node[data-id="${nodeId}"]`))
        .filter(Boolean);

      if (nodeElements.length === 0) {
        setSelectionToolbarRect((previous) => (previous === null ? previous : null));
        return;
      }

      const bounds = nodeElements.reduce(
        (accumulator, element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: Math.min(accumulator.left, rect.left),
            top: Math.min(accumulator.top, rect.top),
            right: Math.max(accumulator.right, rect.right),
            bottom: Math.max(accumulator.bottom, rect.bottom),
          };
        },
        {
          left: Number.POSITIVE_INFINITY,
          top: Number.POSITIVE_INFINITY,
          right: Number.NEGATIVE_INFINITY,
          bottom: Number.NEGATIVE_INFINITY,
        }
      );

      const viewportRect = viewport.getBoundingClientRect();
      const toolbarWidth = 208;
      const toolbarHeight = 42;
      const anchorTop = Math.max(12, bounds.top - viewportRect.top - toolbarHeight - 10);
      const anchorLeft = Math.min(
        Math.max(12, bounds.right - viewportRect.left - toolbarWidth),
        Math.max(12, viewportRect.width - toolbarWidth - 12)
      );

      setSelectionToolbarRect((previous) => {
        if (previous && previous.top === anchorTop && previous.left === anchorLeft) {
          return previous;
        }

        return {
          top: anchorTop,
          left: anchorLeft,
        };
      });
    };

    const rafId = window.requestAnimationFrame(measureToolbarRect);
    const handleResize = () => measureToolbarRect();

    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [effectiveSelectedNodeIds, isPreviewOpen, isPreviewToolbarVisible, nodes, previewedSubGraphId, shouldShowSelectionToolbar]);

  useEffect(() => {
    if (!previewedSubGraphId) {
      return;
    }

    const stillExists = nodes.some((node) => node.id === previewedSubGraphId && node.data?.templateKey === SUBGRAPH_TEMPLATE_KEY);
    if (!stillExists) {
      setPreviewedSubGraphId(null);
    }
  }, [nodes, previewedSubGraphId]);

  return (
    <div className="xrag-canvas-theme h-full w-full overflow-visible bg-slate-950 p-4 md:p-6">
      <div className="flex h-full w-full min-w-0 gap-2 bg-slate-950">
        <aside
          className="relative flex-none overflow-visible"
          style={{ width: paletteWidth }}
        >
          <div className="h-full rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="h-full">
              {/* Tab switcher — dark with amber sliding pill (keeps brand identity) */}
              <div className="relative flex border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm p-1.5 gap-1">
                <span
                  aria-hidden
                  className="absolute top-1.5 bottom-1.5 left-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 shadow-md shadow-amber-500/30 transition-transform duration-300 ease-out"
                  style={{
                    width: 'calc(33.333% - 0.292rem)',
                    transform:
                      paletteTab === 'nodes'
                        ? 'translateX(0%)'
                        : paletteTab === 'blueprints'
                        ? 'translateX(calc(100% + 0.25rem))'
                        : 'translateX(calc(200% + 0.5rem))',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPaletteTab('nodes')}
                  className={`relative flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors duration-200 ${
                    paletteTab === 'nodes' ? 'text-slate-950' : 'text-slate-300 hover:text-amber-300'
                  }`}
                >
                  Nodes
                </button>
                <button
                  type="button"
                  onClick={() => setPaletteTab('blueprints')}
                  className={`relative flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors duration-200 ${
                    paletteTab === 'blueprints' ? 'text-slate-950' : 'text-slate-300 hover:text-amber-300'
                  }`}
                >
                  Blueprints
                </button>
                <button
                  type="button"
                  onClick={() => setPaletteTab('custom')}
                  className={`relative flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors duration-200 ${
                    paletteTab === 'custom' ? 'text-slate-950' : 'text-slate-300 hover:text-amber-300'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Animated panel container — crossfade + slide between tabs */}
              <div className="relative h-[calc(100%-56px)] overflow-hidden">
                <div
                  key={paletteTab}
                  className="xrag-palette-pane h-full"
                >
                  {paletteTab === 'nodes' && (
                    <div className="p-4 h-full overflow-y-auto">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Node Palette</h3>
                    <span className="text-[10px] text-slate-500 font-black uppercase">Drag to canvas</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {groupedNodeLibrary.map((group) => {
                      const isExpanded = expandedCategories[group.category];
                      const groupPal = paletteFromColorClass(group.items[0]?.colorClass || '');

                      return (
                        <div
                          key={group.category}
                          className="rounded-2xl p-2.5 transition-colors"
                          style={{
                            background: `linear-gradient(160deg, ${groupPal.accent}55 0%, ${groupPal.accent2}30 55%, rgba(15,23,42,0.7) 100%)`,
                            border: `1px solid ${groupPal.accent}80`,
                            boxShadow: `0 0 24px ${groupPal.accent}25, 0 0 0 1px rgba(15,23,42,0.4) inset, 0 4px 12px rgba(0,0,0,0.25)`,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleCategory(group.category)}
                            className="w-full flex items-center justify-between text-left px-2 py-1 rounded-xl hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded
                                ? <ChevronDown size={14} style={{ color: groupPal.accent }} />
                                : <ChevronRight size={14} style={{ color: groupPal.accent }} />}
                              <span
                                className="text-[11px] font-black uppercase tracking-widest"
                                style={{ color: groupPal.accent }}
                              >
                                {group.category}
                              </span>
                            </div>
                            <span
                              className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                              style={{
                                color: groupPal.accent,
                                background: `${groupPal.accent}1f`,
                              }}
                            >
                              {group.items.length}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-2">
                              {group.items.map((template) => {
                                const Icon = template.icon;
                                const pal = paletteFromColorClass(template.colorClass);
                                return (
                                  <button
                                    key={template.key}
                                    type="button"
                                    draggable
                                    onDragStart={(event) => {
                                      event.dataTransfer.setData('application/xrag-node', buildPalettePayload(template));
                                      event.dataTransfer.effectAllowed = 'move';
                                    }}
                                    className="group relative w-full text-left rounded-xl transition-all duration-150 cursor-grab active:cursor-grabbing overflow-hidden flex items-stretch"
                                    style={{
                                      background: 'linear-gradient(140deg, #0f172a 0%, #111827 100%)',
                                      boxShadow: `0 1px 3px rgba(0,0,0,0.45), 0 0 0 1px rgba(148,163,184,0.18)`,
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'translateY(-1px)';
                                      e.currentTarget.style.boxShadow = `0 4px 14px rgba(0,0,0,0.55), 0 0 0 1px ${pal.accent}`;
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = '';
                                      e.currentTarget.style.boxShadow = `0 1px 3px rgba(0,0,0,0.45), 0 0 0 1px rgba(148,163,184,0.18)`;
                                    }}
                                  >
                                    {/* Left accent stripe */}
                                    <div
                                      aria-hidden
                                      style={{
                                        width: 4,
                                        background: `linear-gradient(180deg, ${pal.accent} 0%, ${pal.accent2} 100%)`,
                                        flexShrink: 0,
                                      }}
                                    />
                                    <div className="flex items-center gap-3 p-2.5 flex-1 min-w-0">
                                      <div
                                        className="shrink-0 flex items-center justify-center rounded-xl"
                                        style={{
                                          width: 36, height: 36,
                                          background: `linear-gradient(140deg, ${pal.accent2} 0%, ${pal.accent} 100%)`,
                                          boxShadow: `0 2px 6px ${pal.accent}50`,
                                        }}
                                      >
                                        <Icon size={16} style={{ color: '#0f172a' }} />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold truncate leading-snug" style={{ color: '#f1f5f9' }}>{template.label}</p>
                                        <p className="text-[10px] leading-snug mt-0.5 truncate" style={{ color: pal.accent }}>{template.description}</p>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {paletteTab === 'blueprints' && (
                <div className="p-4 h-full overflow-y-auto">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Blueprints</h3>
                    <span className="text-[10px] text-slate-500 font-black uppercase">Static templates</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-4 leading-snug">
                    Pre-built reference architectures. Click to drop one onto the canvas.
                  </p>
                  <div className="space-y-2">
                    {RAG_BLUEPRINTS.map((blueprint) => (
                      <button
                        key={blueprint.id}
                        type="button"
                        onClick={() => insertBlueprint(blueprint.id)}
                        className="group w-full text-left rounded-xl transition-all duration-150 hover:-translate-y-0.5 overflow-hidden flex items-stretch"
                        style={{
                          background: 'linear-gradient(140deg, #0f172a 0%, #111827 100%)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.45), 0 0 0 1px rgba(148,163,184,0.18)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.55), 0 0 0 1px #fbbf24';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.45), 0 0 0 1px rgba(148,163,184,0.18)';
                        }}
                      >
                        {/* Left amber accent stripe */}
                        <div
                          aria-hidden
                          style={{
                            width: 4,
                            flexShrink: 0,
                            background: 'linear-gradient(180deg, #fde68a 0%, #f59e0b 100%)',
                          }}
                        />
                        {/* Icon panel */}
                        <div
                          className="flex items-center justify-center"
                          style={{
                            width: 52,
                            flexShrink: 0,
                            background: 'linear-gradient(140deg, #fbbf2426 0%, #fbbf2410 100%)',
                          }}
                        >
                          <div
                            className="flex items-center justify-center"
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              background: 'linear-gradient(140deg, #fde68a 0%, #f59e0b 100%)',
                              boxShadow: '0 2px 6px #fbbf2440',
                            }}
                          >
                            <Network size={15} style={{ color: '#0f172a' }} />
                          </div>
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center px-3 py-2.5">
                          <p className="text-[12px] font-semibold text-slate-100 truncate leading-snug">{blueprint.label}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{blueprint.description}</p>
                          <p className="text-[10px] text-amber-400 font-bold mt-1">{blueprint.templateKeys?.length || 0} nodes</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paletteTab === 'custom' && (
                <div className="p-4 h-full overflow-y-auto">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Custom Nodes</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomEditorDraft(null);
                        setCustomEditorOpen(true);
                      }}
                      title="Create a new custom node"
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-950 shadow-md shadow-amber-500/40 hover:bg-amber-400 transition-colors"
                    >
                      <Plus size={12} /> New
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-4 leading-snug">
                    Build your own nodes with code, dependencies, color & icon. Optionally let the AI assistant generate one from a description.
                  </p>

                  {customNodesStatus === 'loading' && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Loader2 size={12} className="animate-spin" /> Loading custom nodes…
                    </div>
                  )}

                  {customNodes.length === 0 && customNodesStatus !== 'loading' && (
                    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-center">
                      <Wand2 size={20} className="mx-auto text-amber-400" />
                      <p className="text-[11px] font-black text-slate-200 mt-2">No custom nodes yet</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                        Click <span className="font-black text-amber-400">+ New</span> to create one or use the AI assistant inside the editor.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {customNodes.map((cn) => {
                      const Icon = CUSTOM_NODE_ICON_MAP[cn.icon] || Wand2;
                      const colorClass = `bg-${['amber','sky','cyan','emerald','violet','fuchsia','rose','indigo','slate'].includes(cn.color) ? cn.color : 'indigo'}-50 border-${['amber','sky','cyan','emerald','violet','fuchsia','rose','indigo','slate'].includes(cn.color) ? cn.color : 'indigo'}-200 text-${['amber','sky','cyan','emerald','violet','fuchsia','rose','indigo','slate'].includes(cn.color) ? cn.color : 'indigo'}-700`;
                      const pal = paletteFromColorClass(colorClass);
                      return (
                        <div
                          key={cn.id}
                          className="group relative rounded-xl overflow-hidden flex flex-col"
                          style={{
                            background: 'linear-gradient(140deg, #0f172a 0%, #111827 100%)',
                            boxShadow: `0 1px 3px rgba(0,0,0,0.45), 0 0 0 1px rgba(148,163,184,0.18)`,
                          }}
                        >
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                'application/xrag-node',
                                JSON.stringify({ templateKey: cn.id })
                              );
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            className="w-full text-left cursor-grab active:cursor-grabbing flex items-stretch"
                          >
                            {/* Left accent stripe */}
                            <div
                              aria-hidden
                              style={{
                                width: 4,
                                background: `linear-gradient(180deg, ${pal.accent} 0%, ${pal.accent2} 100%)`,
                                flexShrink: 0,
                              }}
                            />
                            <div className="flex items-center gap-3 p-2.5 flex-1 min-w-0">
                              <div
                                className="shrink-0 flex items-center justify-center rounded-xl"
                                style={{
                                  width: 36, height: 36,
                                  background: `linear-gradient(140deg, ${pal.accent2} 0%, ${pal.accent} 100%)`,
                                  boxShadow: `0 2px 6px ${pal.accent}50`,
                                }}
                              >
                                <Icon size={16} style={{ color: '#0f172a' }} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate leading-snug" style={{ color: '#f1f5f9' }}>{cn.name}</p>
                                <p className="text-[10px] leading-snug mt-0.5 truncate" style={{ color: pal.accent }}>{cn.description || 'No description'}</p>
                                <p className="text-[10px] mt-0.5 truncate" style={{ color: '#64748b' }}>{cn.category}</p>
                              </div>
                            </div>
                          </button>
                          <div className="flex border-t border-slate-700/60 bg-slate-900/40">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomEditorDraft(cn);
                                setCustomEditorOpen(true);
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-amber-400 hover:bg-slate-800/60 transition-colors"
                            >
                              <Pencil size={10} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`Delete custom node "${cn.name}"?`)) return;
                                try {
                                  await xragApi.deleteCustomNode(cn.id);
                                  unregisterCustomTemplate(cn.id);
                                  await refreshCustomNodes();
                                } catch (err) {
                                  alert(`Delete failed: ${err.message}`);
                                }
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-rose-400 hover:bg-slate-800/60 transition-colors border-l border-slate-700/60"
                            >
                              <Trash2 size={10} /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
                </div>
              </div>
            </div>

          </div>
        </aside>

        {/* Drag handle: palette ↔ canvas */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize node palette"
          onPointerDown={beginResize('palette')}
          className="group relative flex-none w-1.5 cursor-col-resize self-stretch"
        >
          <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-0.5 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-active:bg-indigo-500 transition-colors" />
        </div>

        <section className="min-h-0 flex-1 min-w-0 rounded-3xl border border-slate-700/50 shadow-sm overflow-hidden" style={{ background: '#1e2030' }}>
          <div className="h-12 border-b border-slate-700/40 px-4 flex items-center justify-between" style={{ background: '#1e2030' }}>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">RAG Architecture Canvas</p>
          </div>

          <div
            ref={canvasViewportRef}
            className="relative h-[calc(100%-3rem)]"
            style={{ background: '#1e2030' }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onMouseDownCapture={onCanvasMouseDownCapture}
            onMouseDown={onCanvasMouseDown}
            onClickCapture={(event) => {
              const eventTarget = event.target;
              if (eventTarget instanceof Element) {
                const edgeElement = eventTarget.closest('.react-flow__edge');
                const edgeId = edgeElement?.getAttribute('data-id');
                if (edgeId) {
                  if (isPreviewElementId(edgeId)) {
                    setIsPreviewToolbarVisible(true);
                  } else {
                    setIsPreviewToolbarVisible(false);
                  }

                  setSelectionMetaState([], edgeId);
                  return;
                }

                const nodeElement = eventTarget.closest('.react-flow__node');
                const nodeId = nodeElement?.getAttribute('data-id');
                if (nodeId && selectedEdgeIdRef.current) {
                  if (previewedSubGraphId) {
                    setIsPreviewToolbarVisible(isPreviewElementId(nodeId));
                  }

                  pendingNodeSelectionRef.current = null;
                  setNodeSelectionState([nodeId], null);
                  return;
                }
              }

              syncPreviewToolbarVisibilityFromPointer(event.clientX, event.clientY, event.target);
            }}
          >
            <div className="relative z-10 h-full">
              <ReactFlow
                nodes={renderNodes}
                edges={renderEdges}
                deleteKeyCode={null}
                onNodesChange={onCanvasNodesChange}
                onEdgesChange={onCanvasEdgesChange}
                onEdgesDelete={(deletedEdges) => {
                  // Split into preview edges (live in parent subgraph's
                  // collapsedEdges) and real edges (live in main `edges`).
                  const previewBatch = deletedEdges.filter((edge) => isPreviewElementId(edge.id));
                  const realBatch = deletedEdges.filter((edge) => !isPreviewElementId(edge.id));

                  if (previewBatch.length > 0) {
                    removePreviewEdges(previewBatch);
                  }

                  if (realBatch.length > 0) {
                    const idsToDelete = new Set(realBatch.map((edge) => edge.id));
                    setEdges((currentEdges) => currentEdges.filter((edge) => !idsToDelete.has(edge.id)));
                    if (selectedEdgeIdRef.current && idsToDelete.has(selectedEdgeIdRef.current)) {
                      selectedEdgeIdRef.current = null;
                      setSelectedEdgeId(null);
                    }
                  }
                }}
                onNodesDelete={(deletedNodes) => {
                  // Split into preview nodes (live in parent subgraph's
                  // collapsedNodes) and real nodes (live in main `nodes`).
                  const previewBatch = deletedNodes.filter((node) => isPreviewElementId(node.id));
                  const realBatch = deletedNodes.filter((node) => !isPreviewElementId(node.id));

                  if (previewBatch.length > 0) {
                    removePreviewNodes(previewBatch.map((node) => node.id));
                  }

                  if (realBatch.length > 0) {
                    const idsToDelete = new Set();
                    realBatch.forEach((node) => {
                      const cascadeIds = getCascadeDeleteNodeIds(node.id, nodesRef.current);
                      cascadeIds.forEach((id) => idsToDelete.add(id));
                    });
                    setNodes((currentNodes) => currentNodes.filter((node) => !idsToDelete.has(node.id)));
                    setEdges((currentEdges) =>
                      currentEdges.filter((edge) => !idsToDelete.has(edge.source) && !idsToDelete.has(edge.target))
                    );
                    selectedNodeIdsRef.current = [];
                    selectedEdgeIdRef.current = null;
                    setSelectedNodeId(null);
                    setSelectedNodeIds([]);
                    setSelectedEdgeId(null);
                  }
                }}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onEdgeClick={(_event, edge) => {
                  if (isPreviewElementId(edge.id)) {
                    setIsPreviewToolbarVisible(true);
                    setSelectionMetaState([], edge.id);
                    return;
                  }

                  if (isPreviewOpen) {
                    setIsPreviewToolbarVisible(false);
                  }

                  setSelectionMetaState([], edge.id);
                }}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onNodeClick={(_event, node) => {
                  if (!node?.id) return;
                  if (previewedSubGraphId) {
                    setIsPreviewToolbarVisible(isPreviewElementId(node.id));
                  }
                }}
                onNodeDoubleClick={(_event, node) => {
                  if (!node?.id) return;
                  pendingNodeSelectionRef.current = null;
                  setNodeSelectionState([node.id], null);
                  setNodeSettingsOpen(true);
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{
                  type: 'gradient',
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#fbbf24', width: 7, height: 7 },
                  style: { strokeWidth: 2, stroke: '#fbbf24' },
                }}
                connectionLineStyle={{ stroke: '#fbbf24', strokeWidth: 2 }}
                connectionLineType="step"
                connectionLineComponent={CanvasConnectionLine}
                elementsSelectable
                snapToGrid
                snapGrid={[16, 16]}
                selectNodesOnDrag={false}
                multiSelectionKeyCode={["Control", "Meta", "Shift"]}
                selectionOnDrag
                selectionMode="partial"
                fitView
                minZoom={0.3}
                onPaneClick={() => {
                  if (suppressNextPaneClickRef.current) {
                    suppressNextPaneClickRef.current = false;
                    return;
                  }
                  setSelectionMetaState([], null);
                }}
                onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
                  const rawSelectedNodeIds = selectedNodes.map((node) => node.id);
                  const rawSelectedEdgeId = selectedEdges[0]?.id || null;
                  const nextSelectedNodeIds = rawSelectedEdgeId ? [] : rawSelectedNodeIds;
                  const nextSelectedEdgeId = rawSelectedNodeIds.length > 0 ? null : rawSelectedEdgeId;

                  const currentSelectedNodeIds = selectedNodeIdsRef.current;
                  const currentSelectedEdgeId = selectedEdgeIdRef.current;
                  const pendingNodeSelection = pendingNodeSelectionRef.current;

                  const shouldPreservePendingNodeSelection =
                    Array.isArray(pendingNodeSelection) &&
                    pendingNodeSelection.length > 0 &&
                    !nextSelectedEdgeId &&
                    nextSelectedNodeIds.length > 0 &&
                    nextSelectedNodeIds.every((id) => pendingNodeSelection.includes(id)) &&
                    pendingNodeSelection.some((id) => !nextSelectedNodeIds.includes(id));
                  if (shouldPreservePendingNodeSelection) {
                    setSelectionMetaState(pendingNodeSelection, null);
                    return;
                  }

                  if (
                    Array.isArray(pendingNodeSelection) &&
                    !nextSelectedEdgeId &&
                    areIdListsEqual(nextSelectedNodeIds, pendingNodeSelection)
                  ) {
                    pendingNodeSelectionRef.current = null;
                  }

                  if (nextSelectedEdgeId) {
                    pendingNodeSelectionRef.current = null;
                  }

                  // RF fires a correcting onSelectionChange({nodes:[], edges:[]}) after any
                  // preview element is selected because preview elements don't live in RF's
                  // internal store. Block it by checking whether the current selection is
                  // already a preview element — onPaneClick/onEdgeClick pre-update the ref
                  // synchronously, so legitimate deselections are already reflected in the
                  // ref before this callback fires.
                  const hasActivePreviewSelection =
                    currentSelectedNodeIds.some((id) => isPreviewElementId(id)) ||
                    isPreviewElementId(currentSelectedEdgeId);
                  if (nextSelectedNodeIds.length === 0 && !nextSelectedEdgeId && hasActivePreviewSelection) {
                    return;
                  }

                  // Preview elements are controlled outside of RF's internal store.
                  // During fast preview selection switches RF can emit stale callbacks
                  // that echo the previous preview selection (node or edge). Because
                  // click handlers already pre-sync refs via setSelectionMetaState,
                  // any preview mismatch here is stale and should be ignored.
                  const callbackHasPreviewSelection =
                    nextSelectedNodeIds.some((id) => isPreviewElementId(id)) ||
                    isPreviewElementId(nextSelectedEdgeId);
                  const refHasPreviewSelection =
                    currentSelectedNodeIds.some((id) => isPreviewElementId(id)) ||
                    isPreviewElementId(currentSelectedEdgeId);
                  const isPreviewSelectionMismatch =
                    !areIdListsEqual(currentSelectedNodeIds, nextSelectedNodeIds) ||
                    currentSelectedEdgeId !== nextSelectedEdgeId;
                  if (callbackHasPreviewSelection && refHasPreviewSelection && isPreviewSelectionMismatch) {
                    return;
                  }

                  const isSameNodeSelection = areIdListsEqual(currentSelectedNodeIds, nextSelectedNodeIds);
                  const isSameEdgeSelection = currentSelectedEdgeId === nextSelectedEdgeId;

                  if (isSameNodeSelection && isSameEdgeSelection) {
                    return;
                  }

                  setSelectionMetaState(nextSelectedNodeIds, nextSelectedEdgeId);
                }}
                style={{ backgroundColor: '#1e2030' }}
              >
                <Panel
                  position="bottom-right"
                  className="!m-3 !p-0 rounded-lg overflow-hidden shadow-lg"
                  style={{ border: '1px solid rgba(71,85,105,0.5)', background: '#1e2030' }}
                >
                  <div className="flex items-center justify-between gap-2 px-2 py-1 border-b" style={{ background: '#252840', borderColor: 'rgba(71,85,105,0.4)' }}>
                    <span className="text-[10px] font-semibold tracking-wider uppercase select-none" style={{ color: '#94a3b8' }}>
                      Mini Map
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsMinimapCollapsed((previous) => !previous)}
                      className="h-5 w-5 inline-flex items-center justify-center rounded transition"
                      style={{ color: '#94a3b8' }}
                      aria-label={isMinimapCollapsed ? 'Expand mini map' : 'Collapse mini map'}
                      title={isMinimapCollapsed ? 'Expand' : 'Collapse'}
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {isMinimapCollapsed ? (
                          <polyline points="3,7 6,4 9,7" />
                        ) : (
                          <polyline points="3,5 6,8 9,5" />
                        )}
                      </svg>
                    </button>
                  </div>
                  {!isMinimapCollapsed && (
                    <div className="relative" style={{ background: '#1e2030' }}>
                      {/* Resize handle — top-left corner. Drag toward upper-left to enlarge. */}
                      <div
                        role="presentation"
                        title="Drag to resize"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const startX = event.clientX;
                          const startY = event.clientY;
                          const startW = minimapSize.width;
                          const startH = minimapSize.height;
                          const MIN_W = 120;
                          const MIN_H = 80;
                          const MAX_W = 360;
                          const MAX_H = 240;
                          const handleMove = (moveEvent) => {
                            const dx = startX - moveEvent.clientX;
                            const dy = startY - moveEvent.clientY;
                            const nextW = Math.min(MAX_W, Math.max(MIN_W, startW + dx));
                            const nextH = Math.min(MAX_H, Math.max(MIN_H, startH + dy));
                            setMinimapSize({ width: nextW, height: nextH });
                          };
                          const handleUp = () => {
                            window.removeEventListener('mousemove', handleMove);
                            window.removeEventListener('mouseup', handleUp);
                          };
                          window.addEventListener('mousemove', handleMove);
                          window.addEventListener('mouseup', handleUp);
                        }}
                        className="absolute top-0 left-0 z-20 h-3 w-3 cursor-nwse-resize transition rounded-br"
                        style={{
                          clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                          background: '#2d3148',
                        }}
                      />
                      {(() => {
                        // Custom mini map: draws nodes (as rounded rects with their
                        // accent color) and edges (as straight lines between centers)
                        // in a single SVG with a viewBox spanning the union of all
                        // node bounds. Click-to-center pans the canvas to the picked
                        // flow point.
                        const renderableNodes = renderNodes.filter(
                          (node) => Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
                        );
                        if (renderableNodes.length === 0) {
                          return (
                            <div
                              style={{ width: minimapSize.width, height: minimapSize.height }}
                              className="flex items-center justify-center text-[10px] text-slate-400"
                            >
                              No nodes yet
                            </div>
                          );
                        }
                        const PADDING = 60;
                        const getNodeSize = (node) => {
                          const isBackdrop = node.id?.startsWith?.('preview-bg-');
                          const w = isBackdrop
                            ? node.data?.width || 0
                            : node.measured?.width || node.width || 128;
                          const h = isBackdrop
                            ? node.data?.height || 0
                            : node.measured?.height || node.height || 128;
                          return { w, h };
                        };
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        renderableNodes.forEach((node) => {
                          const { w, h } = getNodeSize(node);
                          minX = Math.min(minX, node.position.x);
                          minY = Math.min(minY, node.position.y);
                          maxX = Math.max(maxX, node.position.x + w);
                          maxY = Math.max(maxY, node.position.y + h);
                        });
                        const vbX = minX - PADDING;
                        const vbY = minY - PADDING;
                        const vbW = maxX - minX + PADDING * 2;
                        const vbH = maxY - minY + PADDING * 2;
                        const baseUnit = Math.max(vbW, vbH);
                        const strokeUnit = baseUnit * 0.005;

                        return (
                          <svg
                            width={minimapSize.width}
                            height={minimapSize.height}
                            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                            preserveAspectRatio="xMidYMid meet"
                            className="block cursor-pointer"
                            onClick={(event) => {
                              const svg = event.currentTarget;
                              const rect = svg.getBoundingClientRect();
                              // map screen -> viewBox
                              const scaleX = vbW / rect.width;
                              const scaleY = vbH / rect.height;
                              const scale = Math.max(scaleX, scaleY); // matches preserveAspectRatio meet
                              const offsetX = (rect.width - vbW / scale) / 2;
                              const offsetY = (rect.height - vbH / scale) / 2;
                              const px = event.clientX - rect.left - offsetX;
                              const py = event.clientY - rect.top - offsetY;
                              const flowX = vbX + px * scale;
                              const flowY = vbY + py * scale;
                              const { zoom } = getViewport();
                              setCenter(flowX, flowY, { zoom, duration: 300 });
                            }}
                          >
                            <defs>
                              {renderEdges.map((edge) => {
                                const sourceNode = renderableNodes.find((node) => node.id === edge.source);
                                const targetNode = renderableNodes.find((node) => node.id === edge.target);
                                if (!sourceNode || !targetNode) return null;
                                const { w: sw, h: sh } = getNodeSize(sourceNode);
                                const { w: tw, h: th } = getNodeSize(targetNode);
                                const x1 = sourceNode.position.x + sw / 2;
                                const y1 = sourceNode.position.y + sh / 2;
                                const x2 = targetNode.position.x + tw / 2;
                                const y2 = targetNode.position.y + th / 2;
                                const sourceColor =
                                  paletteFromColorClass(sourceNode.data?.colorClass).accent || '#94a3b8';
                                const targetColor =
                                  paletteFromColorClass(targetNode.data?.colorClass).accent || '#94a3b8';
                                return (
                                  <linearGradient
                                    key={`mm-grad-${edge.id}`}
                                    id={`mm-grad-${edge.id}`}
                                    gradientUnits="userSpaceOnUse"
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                  >
                                    <stop offset="0%" stopColor={sourceColor} />
                                    <stop offset="33%" stopColor={sourceColor} />
                                    <stop offset="55%" stopColor={targetColor} />
                                    <stop offset="100%" stopColor={targetColor} />
                                  </linearGradient>
                                );
                              })}
                            </defs>
                            {/* Edges — drawn as the same smoothstep paths the main
                                canvas uses (or straight if the routing type is
                                'straight'), so the mini-map mirrors the real
                                arrow geometry including bends and direction.
                                Stroke uses a source→target gradient matching the
                                main canvas. */}
                            {renderEdges.map((edge) => {
                              const sourceNode = renderableNodes.find((node) => node.id === edge.source);
                              const targetNode = renderableNodes.find((node) => node.id === edge.target);
                              if (!sourceNode || !targetNode) return null;
                              const { w: sw, h: sh } = getNodeSize(sourceNode);
                              const { w: tw, h: th } = getNodeSize(targetNode);

                              const sourceSide = parseSideFromHandleId(edge.sourceHandle) || 'right';
                              const targetSide = parseSideFromHandleId(edge.targetHandle) || 'left';

                              const sideToPositionMap = {
                                top: Position.Top,
                                bottom: Position.Bottom,
                                left: Position.Left,
                                right: Position.Right,
                              };
                              const sideToOffsetMap = {
                                top: (n, w, h) => ({ x: n.position.x + w / 2, y: n.position.y }),
                                bottom: (n, w, h) => ({ x: n.position.x + w / 2, y: n.position.y + h }),
                                left: (n, w, h) => ({ x: n.position.x, y: n.position.y + h / 2 }),
                                right: (n, w, h) => ({ x: n.position.x + w, y: n.position.y + h / 2 }),
                              };

                              const src = sideToOffsetMap[sourceSide](sourceNode, sw, sh);
                              const tgt = sideToOffsetMap[targetSide](targetNode, tw, th);

                              const isStraight = edge.type === 'straight';
                              const [path] = isStraight
                                ? getStraightPath({ sourceX: src.x, sourceY: src.y, targetX: tgt.x, targetY: tgt.y })
                                : getSmoothStepPath({
                                    sourceX: src.x,
                                    sourceY: src.y,
                                    targetX: tgt.x,
                                    targetY: tgt.y,
                                    sourcePosition: sideToPositionMap[sourceSide],
                                    targetPosition: sideToPositionMap[targetSide],
                                    borderRadius: 14,
                                  });

                              return (
                                <path
                                  key={`mm-edge-${edge.id}`}
                                  d={path}
                                  fill="none"
                                  stroke={`url(#mm-grad-${edge.id})`}
                                  strokeWidth={strokeUnit * 1.6}
                                  strokeOpacity={0.7}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              );
                            })}
                            {/* Nodes */}
                            {renderableNodes.map((node) => {
                              const { w, h } = getNodeSize(node);
                              if (w <= 0 || h <= 0) return null;
                              if (node.id?.startsWith?.('preview-bg-')) {
                                return (
                                  <rect
                                    key={`mm-bg-${node.id}`}
                                    x={node.position.x}
                                    y={node.position.y}
                                    width={w}
                                    height={h}
                                    rx={baseUnit * 0.025}
                                    ry={baseUnit * 0.025}
                                    fill="rgba(148, 163, 184, 0.18)"
                                    stroke="rgba(100, 116, 139, 0.7)"
                                    strokeWidth={strokeUnit * 1.4}
                                    strokeDasharray={`${strokeUnit * 4} ${strokeUnit * 3}`}
                                  />
                                );
                              }
                              const palette = paletteFromColorClass(node.data?.colorClass);
                              return (
                                <rect
                                  key={`mm-node-${node.id}`}
                                  x={node.position.x}
                                  y={node.position.y}
                                  width={w}
                                  height={h}
                                  rx={baseUnit * 0.015}
                                  ry={baseUnit * 0.015}
                                  fill={palette.accent}
                                  stroke={palette.accent2 || '#0f172a'}
                                  strokeWidth={strokeUnit}
                                />
                              );
                            })}
                            {/* Viewport indicator — shows the visible portion of the
                                main canvas as a translucent rectangle. */}
                            <MinimapViewportRect />
                          </svg>
                        );
                      })()}
                    </div>
                  )}
                </Panel>
                <Controls />
                <Background color="#2d3148" gap={26} size={1.2} />
              </ReactFlow>
            </div>

            {selectionRect && (
              <div
                className="pointer-events-none absolute z-0 rounded-lg border-2 border-indigo-500 bg-indigo-500/15 shadow-[0_0_0_1px_rgba(79,70,229,0.25),0_0_20px_rgba(99,102,241,0.2)]"
                style={{
                  left: selectionRect.left,
                  top: selectionRect.top,
                  width: selectionRect.width,
                  height: selectionRect.height,
                }}
              >
                <div className="h-full w-full rounded-md border border-indigo-300/70" />
              </div>
            )}

            {invalidConnectionAlert?.position && (
              <div
                key={invalidConnectionAlert.stamp}
                className="xrag-invalid-conn-alert pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 max-w-[min(80vw,360px)] whitespace-normal rounded-full border border-red-400 bg-red-500 px-4 py-2 text-center text-[11px] font-black uppercase tracking-wider text-white shadow-[0_10px_30px_rgba(239,68,68,0.45)]"
                style={{
                  left: invalidConnectionAlert.position.left,
                  top: invalidConnectionAlert.position.top,
                }}
                role="alert"
                aria-live="polite"
              >
                {invalidConnectionAlert.message}
              </div>
            )}

            {selectionToolbarRect && shouldShowSelectionToolbar && (
              <div
                ref={selectionToolbarRef}
                className="pointer-events-none absolute z-30 flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/95 px-2 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm"
                style={{ left: selectionToolbarRect.left, top: selectionToolbarRect.top }}
              >
                {canPackSelection && (
                  <button
                    type="button"
                    onClick={packSelectedNodes}
                    title="Pack selected nodes into a Sub-graph"
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-slate-800"
                  >
                    <Network size={12} /> Pack
                  </button>
                )}

                {canOpenSubGraphPreview && (
                  <button
                    type="button"
                    onClick={openSelectedSubGraphPreview}
                    title="Open sub-graph preview"
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-slate-800"
                  >
                    <ChevronsRight size={12} /> Open
                  </button>
                )}

                {canCloseSubGraphPreview && (
                  <button
                    type="button"
                    onClick={closeSelectedSubGraphPreview}
                    title="Close sub-graph preview"
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-200 transition-colors hover:bg-slate-800"
                  >
                    <ChevronsLeft size={12} /> Close
                  </button>
                )}

                {canPermanentlyUnpack && (
                  <button
                    type="button"
                    onClick={permanentlyUnpackSelectedSubGraph}
                    title="Permanently unpack this sub-graph"
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-slate-800"
                  >
                    <Link2 size={12} /> Unpack
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Drag handle: canvas ↔ inspector. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize node inspector"
          onPointerDown={beginResize('inspector')}
          className="group relative flex-none w-1.5 cursor-col-resize self-stretch"
        >
          <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-0.5 rounded-full bg-slate-200 group-hover:bg-indigo-400 group-active:bg-indigo-500 transition-colors" />
        </div>

        <aside
          className="@container rounded-3xl border border-slate-700/50 shadow-sm p-3 overflow-y-auto space-y-4 flex-none"
          style={{ width: inspectorWidth, background: '#131822' }}
        >
          {/* Inspector header — merged with Save / Browse / Run controls.
              Gold/amber themed. The list of saved architectures lives only
              in the Browse modal (FolderOpen icon). */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-700/40 p-3 shadow-sm" style={{ background: '#0d1117' }}>
            <div
              aria-hidden
              className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl"
            />
            <div className="relative flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-black shadow-md shadow-amber-500/40">
                <Layers size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-400">Node Inspector</h3>
                <p className="text-[10px] text-amber-300/60 truncate">
                  {selectedNode ? 'Editing selected node' : 'Select a node to edit'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { refreshBackendFlows(); setBrowseFlowsOpen(true); }}
                title="Browse saved architectures"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-700/40 text-amber-400 hover:bg-amber-900/30 transition-colors"
                style={{ background: 'rgba(13,17,23,0.8)' }}
              >
                <FolderOpen size={14} />
              </button>
            </div>

            <div className="relative mt-3 flex items-stretch gap-1.5">
              <input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Architecture name…"
                className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              <button
                type="button"
                onClick={saveCanvasFlowToBackend}
                title="Save current canvas as a new architecture"
                className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-black shadow-sm shadow-amber-500/30 hover:bg-amber-400"
              >
                <Plus size={12} /> Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareMeta({ name: draftName || '', description: '', author: '', tags: '' });
                  setShareModalOpen(true);
                }}
                title="Share to community"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700/50 px-2.5 py-1.5 text-slate-300 hover:text-amber-400 hover:border-amber-700/40 transition-colors" style={{ background: 'rgba(13,17,23,0.8)' }}
              >
                <Share2 size={12} />
              </button>
            </div>

            <button
              type="button"
              onClick={runChatSimulation}
              disabled={runStatus === 'running'}
              title="Saving is recommended but not required to run the flow"
              className="relative mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Play size={13} /> {runStatus === 'running' ? 'Testing…' : 'Test flow'}
            </button>
            {saveFeedback ? (
              <p className="relative mt-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider text-center px-2 py-1" style={{ background: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.30)', color: '#6ee7b7' }}>
                {saveFeedback}
              </p>
            ) : (
              <p className="relative mt-1 text-[10px] text-amber-400/50 text-center">Save not required, but recommended.</p>
            )}
          </div>

          {selectedNode && (() => {
            const inspPal = paletteFromColorClass(selectedTemplate?.colorClass || '');
            const InspNodeIcon = selectedTemplate?.icon;
            return (
              <div
                className="flex items-center gap-2.5 rounded-2xl border p-3"
                style={{
                  background: `linear-gradient(160deg, ${inspPal.accent}20 0%, #0d1117 100%)`,
                  borderColor: `${inspPal.accent}55`,
                }}
              >
                <div
                  className="flex shrink-0 items-center justify-center rounded-[10px]"
                  style={{
                    width: 36, height: 36,
                    background: `linear-gradient(140deg, ${inspPal.accent2} 0%, ${inspPal.accent} 100%)`,
                    boxShadow: `0 2px 8px ${inspPal.accent}55`,
                    color: '#0f172a',
                  }}
                >
                  {InspNodeIcon ? <InspNodeIcon size={16} strokeWidth={2.4} /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-black text-slate-100 truncate">{selectedNode.data.label}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] truncate" style={{ color: inspPal.accent }}>
                    {selectedNode.data.category}
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="rounded-2xl border border-slate-700/50 p-3 space-y-3" style={{ background: '#0d1117' }}>
            {runError && (
              <p className="text-[11px] text-rose-400 border border-rose-800/50 rounded-xl p-2" style={{ background: 'rgba(244,63,94,0.08)' }}>{runError}</p>
            )}
            {runDurationMs != null && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Last run</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">{runDurationMs} ms</span>
              </div>
            )}
            {runTrace.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-slate-700/50 p-2" style={{ background: 'rgba(15,23,42,0.6)' }}>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Execution trace</p>
                {runTrace.map((step) => (
                  <div key={step.node_id} className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <p className={`font-black truncate ${step.status === 'error' ? 'text-rose-400' : step.status === 'skipped' ? 'text-slate-500' : 'text-slate-200'}`}>
                        {step.label}
                      </p>
                      {step.output_preview && (
                      <p className="text-[10px] text-slate-400 truncate" title={step.output_preview}>{step.output_preview}</p>
                      )}
                      {step.error && (
                        <p className="text-[10px] text-rose-600">{step.error}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{step.duration_ms} ms</span>
                  </div>
                ))}
              </div>
            )}
            {!runError && runDurationMs == null && runTrace.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-1">No run executed yet.</p>
            )}
          </div>
        </aside>
      </div>

      {/* ── Node Settings Modal ─────────────────────────────────────────── */}
      {nodeSettingsOpen && selectedNode && createPortal(
        (() => {
          const modalPal = paletteFromColorClass(selectedTemplate?.colorClass || '');
          const ModalIcon = selectedTemplate?.icon;
          return (
            <div
              className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4"
              style={{ background: 'rgba(2,6,23,0.72)', backdropFilter: 'blur(4px)' }}
              onMouseDown={(e) => { if (e.target === e.currentTarget) setNodeSettingsOpen(false); }}
            >
              <div
                className="relative flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
                style={{
                  width: 520,
                  maxWidth: '95vw',
                  maxHeight: '90vh',
                  background: `linear-gradient(160deg, ${modalPal.accent}18 0%, #0d1117 40%, #080d18 100%)`,
                  borderColor: `${modalPal.accent}50`,
                  boxShadow: `0 0 0 1px ${modalPal.accent}30, 0 24px 80px rgba(0,0,0,0.80), 0 0 60px ${modalPal.accent}18`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
                  style={{ borderColor: `${modalPal.accent}30`, background: `linear-gradient(90deg, ${modalPal.accent}20 0%, transparent 100%)` }}
                >
                  {/* Icon */}
                  <div
                    className="flex shrink-0 items-center justify-center rounded-xl"
                    style={{
                      width: 44, height: 44,
                      background: `linear-gradient(140deg, ${modalPal.accent2} 0%, ${modalPal.accent} 100%)`,
                      boxShadow: `0 2px 12px ${modalPal.accent}60`,
                      color: '#0f172a',
                    }}
                  >
                    {ModalIcon ? <ModalIcon size={20} strokeWidth={2.4} /> : null}
                  </div>
                  {/* Title */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black text-slate-100 leading-tight truncate">{selectedNode.data.label}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: modalPal.accent }}>
                      {selectedNode.data.category}
                    </p>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={removeSelectedNode}
                      className="p-2 rounded-xl border border-rose-800/50 text-rose-400 hover:bg-rose-900/20 transition-colors"
                      title="Delete node"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNodeSettingsOpen(false)}
                      className="p-2 rounded-xl border border-slate-700/50 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-colors"
                      title="Close (Esc)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {/* Description */}
                  {selectedNode.data.description && (
                    <p className="text-[11px] leading-relaxed text-slate-400 border-b pb-3" style={{ borderColor: `${modalPal.accent}20` }}>
                      {selectedNode.data.description}
                    </p>
                  )}

                  {/* Node name */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Node name</label>
                    <input
                      type="text"
                      value={selectedNode.data.label || ''}
                      onChange={(event) => updateSelectedNodeLabel(event.target.value)}
                      className="w-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/60"
                    />
                  </div>

                  {/* Settings panel */}
                  {isDocumentUploadNode ? (
                    <UploadedDocumentsSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isChunkingNode ? (
                    <ChunkingSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      embeddingProfile={chunkingEmbeddingProfile}
                    />
                  ) : isEmbeddingNode ? (
                    <EmbeddingSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isVectorDatabaseNode ? (
                    <VectorDatabaseSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      embeddingProfile={vectorDatabaseEmbeddingProfile}
                    />
                  ) : isGraphDatabaseNode ? (
                    <GraphDatabaseSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      upstreamProfile={graphDatabaseUpstreamProfile}
                    />
                  ) : isRetrieverNode ? (
                    <RetrieverSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      embeddingProfile={retrieverContextProfile.embeddingProfile}
                      vectorStore={retrieverContextProfile.vectorStore}
                      hasQuerySource={retrieverContextProfile.hasQuerySource}
                      upstreamDocConfig={retrieverContextProfile.upstreamDocConfig}
                    />
                  ) : isRerankerNode ? (
                    <RerankerSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      hasChunksUpstream={rerankerContextProfile.hasChunksUpstream}
                      hasQuerySource={rerankerContextProfile.hasQuerySource}
                      upstreamChunkCount={rerankerContextProfile.upstreamChunkCount}
                    />
                  ) : isLlmNode ? (
                    <LLMSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      hasQuerySource={llmContextProfile.hasQuerySource}
                      hasChunksUpstream={llmContextProfile.hasChunksUpstream}
                      hasSystemPromptUpstream={llmContextProfile.hasSystemPromptUpstream}
                      upstreamChunkCount={llmContextProfile.upstreamChunkCount}
                    />
                  ) : isSystemPromptNode ? (
                    <SystemPromptSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isResponseNode ? (
                    <ResponseSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      upstreamFormat={responseContextProfile.upstreamFormat}
                      upstreamHasCitations={responseContextProfile.upstreamHasCitations}
                      hasUpstreamProducer={responseContextProfile.hasUpstreamProducer}
                    />
                  ) : isUserNode ? (
                    <UserSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isQuestionNode ? (
                    <QuestionSettingsPanel
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                      hasUserContextUpstream={questionContextProfile.hasUserContextUpstream}
                    />
                  ) : isUrlScraperNode ? (
                    <UrlScraperSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isQueryRewriterNode ? (
                    <QueryRewriterSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isHybridMergeNode ? (
                    <HybridMergeSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isContextCompressionNode ? (
                    <ContextCompressionSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isHallucinationGuardNode ? (
                    <HallucinationGuardSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isReflectionLoopNode ? (
                    <ReflectionLoopSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isKVStoreNode ? (
                    <KVSessionStoreSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isHyDEGenNode ? (
                    <HyDEGenSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isModelRouterNode ? (
                    <ModelRouterSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isGuardrailsNode ? (
                    <GuardrailsSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isPiiRedactionNode ? (
                    <PiiRedactionSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isImageUploadNode ? (
                    <ImageUploadSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isVisionLLMNode ? (
                    <VisionLLMSettingsPanel value={selectedNode.data.config} onChange={updateSelectedNodeConfig} />
                  ) : isCustomNode ? (
                    <CustomNodeSettingsPanel
                      template={selectedTemplate}
                      value={selectedNode.data.config}
                      onChange={updateSelectedNodeConfig}
                    />
                  ) : (
                    activeConfigEntries.map(([fieldName, fieldValue]) => {
                      const normalizedField = String(fieldName);
                      const valueAsString = String(fieldValue ?? '');
                      const isLongText = normalizedField.toLowerCase().includes('prompt');
                      return (
                        <div key={fieldName} className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{normalizedField}</label>
                          {isLongText ? (
                            <textarea
                              value={valueAsString}
                              onChange={(e) => updateSelectedNodeConfig(fieldName, e.target.value)}
                              rows={4}
                              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/60"
                            />
                          ) : (
                            <input
                              type="text"
                              value={valueAsString}
                              onChange={(e) => updateSelectedNodeConfig(fieldName, e.target.value)}
                              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/60"
                            />
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Document upload debug panels */}
                  {isDocumentUploadNode && (
                    <>
                      <div className="space-y-2 rounded-xl border border-slate-700/50 p-2.5" style={{ background: '#0d1117' }}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">NodeState update preview</p>
                        <pre className="text-[10px] leading-relaxed text-emerald-300 overflow-auto max-h-32">
                          {JSON.stringify(nodeState[selectedNode.id], null, 2)}
                        </pre>
                      </div>
                      <div className="space-y-2 rounded-xl border border-indigo-800/40 p-2.5" style={{ background: 'rgba(79,70,229,0.08)' }}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-indigo-400">JSON export to Chunking</p>
                        <pre className="text-[10px] leading-relaxed text-slate-300 overflow-auto max-h-44">
                          {JSON.stringify(documentChunkingPayload, null, 2)}
                        </pre>
                      </div>
                      <details className="rounded-xl border border-slate-700/50 p-2.5" style={{ background: '#0d1117' }}>
                        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-400">JSON schema</summary>
                        <pre className="mt-2 text-[10px] leading-relaxed text-slate-300 overflow-auto max-h-44">
                          {JSON.stringify(DOCUMENT_UPLOAD_JSON_SCHEMA, null, 2)}
                        </pre>
                      </details>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Browse Saved Architectures modal */}
      {browseFlowsOpen && createPortal(
        <div
          className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          onClick={() => setBrowseFlowsOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <FolderOpen size={16} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">Browse Saved Architectures</p>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">
                    {backendFlows.length} flow{backendFlows.length === 1 ? '' : 's'} available
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBrowseFlowsOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="px-5 pt-3 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={browseFlowsQuery}
                  onChange={(e) => setBrowseFlowsQuery(e.target.value)}
                  placeholder="Search by name or id…"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1.5">
              {backendFlowsStatus === 'loading' ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-[11px] text-slate-500">
                  Loading…
                </p>
              ) : (() => {
                const blueprintFlowIds = new Set(
                  RAG_BLUEPRINTS.map((bp) => bp.backendFlowId).filter(Boolean)
                );
                const q = browseFlowsQuery.trim().toLowerCase();
                const filtered = backendFlows
                  .filter((flow) => !blueprintFlowIds.has(flow.id))
                  .filter((flow) => {
                    if (!q) return true;
                    return (
                      String(flow.name || '').toLowerCase().includes(q) ||
                      String(flow.id || '').toLowerCase().includes(q)
                    );
                  });
                if (filtered.length === 0) {
                  return (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-[11px] text-slate-500">
                      {q ? 'No matches.' : 'No saved architectures yet.'}
                    </p>
                  );
                }
                return filtered.map((flow) => {
                  const isActive = flow.id === activeBackendFlowId;
                  return (
                    <div
                      key={flow.id}
                      className={`group relative flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        isActive
                          ? 'border-indigo-300 bg-indigo-50/70'
                          : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-800 truncate">{flow.name || flow.id}</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{flow.id}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {flow.node_count} nodes · {flow.edge_count} edges
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            loadCanvasFlowFromBackend(flow.id);
                            setBrowseFlowsOpen(false);
                          }}
                          className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white hover:bg-amber-600"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCanvasFlowFromBackend(flow.id)}
                          title="Delete"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Share to Community modal */}
      {shareModalOpen && createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <Share2 size={16} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">Share to Community</p>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Shared Space · publish</p>
                </div>
              </div>
              <button type="button" onClick={() => setShareModalOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100">
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Flow name</label>
                <input
                  type="text"
                  value={shareMeta.name}
                  onChange={(e) => setShareMeta((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. My Production RAG"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Description</label>
                <textarea
                  value={shareMeta.description}
                  onChange={(e) => setShareMeta((p) => ({ ...p, description: e.target.value }))}
                  placeholder="What does this pipeline do?"
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Author name</label>
                <input
                  type="text"
                  value={shareMeta.author}
                  onChange={(e) => setShareMeta((p) => ({ ...p, author: e.target.value }))}
                  placeholder="e.g. RAG_Master_42"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={shareMeta.tags}
                  onChange={(e) => setShareMeta((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="e.g. enterprise, reranker, pinecone"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const realNodes = nodes.filter((n) => !isPreviewElementId(n.id));
                  const realEdges = edges.filter((e) => !isPreviewElementId(e.id));
                  const flowData = {
                    nodes: realNodes.map((n) => ({
                      id: n.id,
                      templateKey: n.data?.templateKey,
                      label: n.data?.label || n.data?.templateKey,
                      config: n.data?.config || {},
                      position: n.position,
                    })),
                    edges: realEdges.map((e) => ({
                      id: e.id,
                      source: e.source,
                      target: e.target,
                      sourceHandle: e.sourceHandle,
                      targetHandle: e.targetHandle,
                    })),
                  };
                  const tagsArr = shareMeta.tags
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean);
                  saveUserSharedFlow(flowData, {
                    name: shareMeta.name || draftName || 'My RAG Flow',
                    description: shareMeta.description,
                    author: shareMeta.author || 'Anonymous',
                    tags: tagsArr,
                  });
                  setShareModalOpen(false);
                  window.dispatchEvent(new CustomEvent('xrag-shared-flow-added'));
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-700"
              >
                <Share2 size={13} /> Publish
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CustomNodeEditorModal
        open={customEditorOpen}
        initial={customEditorDraft}
        onClose={() => {
          setCustomEditorOpen(false);
          setCustomEditorDraft(null);
        }}
        onSaved={(saved) => {
          if (saved) {
            registerCustomTemplate(saved);
          }
          refreshCustomNodes();
        }}
        builtinTemplateKeys={Object.entries(templateByKey)
          .filter(([, t]) => !t?.isCustom)
          .map(([key, t]) => ({ key, label: t?.label || key, category: t?.category || 'Other' }))}
      />
    </div>
  );
};

const CanvasTab = () => {
  return (
    <CanvasBoardErrorBoundary>
      <ReactFlowProvider>
        <CanvasBoard />
      </ReactFlowProvider>
    </CanvasBoardErrorBoundary>
  );
};

export default CanvasTab;
