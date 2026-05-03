const API_BASE_URL = import.meta.env.VITE_XRAG_API_BASE_URL || 'http://localhost:8000';

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
};

export const xragApi = {
  getSettings: () => requestJson('/api/settings'),
  saveSettings: (settings) =>
    requestJson('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  chat: (payload) =>
    requestJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listAnswers: () => requestJson('/api/answers'),
  saveAnswer: (payload) =>
    requestJson('/api/answers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteAnswer: (answerId) =>
    requestJson(`/api/answers/${encodeURIComponent(answerId)}`, { method: 'DELETE' }),

  // ---------------------------------------------------------------------
  // Canvas (Langflow-style backend)
  // ---------------------------------------------------------------------
  listCanvasNodeDescriptors: () => requestJson('/api/canvas/nodes'),
  fetchEmbeddingRegistry: () => requestJson('/api/registry/embedding-models'),
  fetchVectorProvidersRegistry: () => requestJson('/api/registry/vector-providers'),
  fetchGraphProvidersRegistry: () => requestJson('/api/registry/graph-providers'),
  fetchRerankersRegistry: () => requestJson('/api/registry/rerankers'),
  // Server-side proxy to OpenRouter — keeps the API key off the client.
  listEmbeddingModels: () => requestJson('/api/models/embeddings'),
  listRerankerModels: () => requestJson('/api/models/rerankers'),
  listChatModels: () => requestJson('/api/models/chat'),
  listHuggingFaceChatModels: (limit = 1000) =>
    requestJson(`/api/models/hf-chat?limit=${encodeURIComponent(limit)}`),
  getHuggingFaceModel: (modelId) =>
    requestJson(`/api/models/hf-model?model_id=${encodeURIComponent(modelId)}`),

  // ---------------------------------------------------------------------
  // Model health probing (LLM Status & Health Dashboard)
  // ---------------------------------------------------------------------
  listTopHfChatModels: (limit = 10) =>
    requestJson(`/api/health/top-hf?limit=${encodeURIComponent(limit)}`),
  probeModel: (provider, modelId) =>
    requestJson('/api/health/probe', {
      method: 'POST',
      body: JSON.stringify({ provider, model_id: modelId }),
    }),
  listCanvasFlows: () => requestJson('/api/canvas/flows'),
  getCanvasFlow: (flowId) => requestJson(`/api/canvas/flows/${encodeURIComponent(flowId)}`),
  saveCanvasFlow: (flow) =>
    requestJson('/api/canvas/flows', {
      method: 'POST',
      body: JSON.stringify(flow),
    }),
  deleteCanvasFlow: (flowId) =>
    requestJson(`/api/canvas/flows/${encodeURIComponent(flowId)}`, {
      method: 'DELETE',
    }),
  runCanvasFlow: (payload) =>
    requestJson('/api/canvas/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ---------------------------------------------------------------------
  // Knowledge base (real document uploads + chunking)
  // ---------------------------------------------------------------------
  listKnowledgeDocuments: () => requestJson('/api/knowledge/documents'),
  getKnowledgeDocument: (documentId) =>
    requestJson(`/api/knowledge/documents/${encodeURIComponent(documentId)}`),
  deleteKnowledgeDocument: (documentId) =>
    requestJson(`/api/knowledge/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    }),
  reindexKnowledgeDocument: (documentId, flowId) => {
    const query = flowId ? `?flow_id=${encodeURIComponent(flowId)}` : '';
    return requestJson(
      `/api/knowledge/documents/${encodeURIComponent(documentId)}/reindex${query}`,
      { method: 'POST' }
    );
  },
  factCheckDocument: (documentId) =>
    requestJson(
      `/api/knowledge/documents/${encodeURIComponent(documentId)}/fact-check`,
      { method: 'POST' }
    ),
  compareDocumentsSummary: (docIdA, docIdB) =>
    requestJson('/api/knowledge/compare-summary', {
      method: 'POST',
      body: JSON.stringify({ doc_id_a: docIdA, doc_id_b: docIdB }),
    }),
  replaceKnowledgeDocument: async ({ documentId, file, flowId }) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (flowId) formData.append('flow_id', flowId);
    const response = await fetch(
      `${API_BASE_URL}/api/knowledge/documents/${encodeURIComponent(documentId)}/replace`,
      { method: 'POST', body: formData }
    );
    if (!response.ok) {
      let message = `Replace failed: ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.detail === 'string') message = data.detail;
        else if (data && data.detail) message = JSON.stringify(data.detail);
      } catch {
        try {
          const text = await response.text();
          if (text) message = text;
        } catch {
          /* ignore */
        }
      }
      throw new Error(message);
    }
    return response.json();
  },
  classifyKnowledgeDocuments: ({ model, language = 'hu' } = {}) =>
    requestJson('/api/knowledge/classify', {
      method: 'POST',
      body: JSON.stringify({ model: model || null, language }),
    }),
  uploadKnowledgeDocuments: async ({ files, flowId }) => {
    const formData = new FormData();
    files.forEach((entry) => {
      const file = entry.file || entry;
      const relativePath = entry.relativePath ?? file.webkitRelativePath ?? file.name ?? '';
      formData.append('files', file, file.name);
      formData.append('relative_paths', relativePath);
    });
    if (flowId) {
      formData.append('flow_id', flowId);
    }
    const response = await fetch(`${API_BASE_URL}/api/knowledge/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      let message = `Upload failed: ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.detail === 'string') message = data.detail;
        else if (data && data.detail) message = JSON.stringify(data.detail);
      } catch {
        try {
          const text = await response.text();
          if (text) message = text;
        } catch {
          /* ignore */
        }
      }
      throw new Error(message);
    }
    return response.json();
  },

  // ---------------------------------------------------------------------
  // Audit / Flow Arena
  // ---------------------------------------------------------------------
  listAuditSessions: () => requestJson('/api/audit/sessions'),
  createAuditSession: (body) =>
    requestJson('/api/audit/sessions', { method: 'POST', body: JSON.stringify(body) }),
  getAuditSession: (sessionId) =>
    requestJson(`/api/audit/sessions/${encodeURIComponent(sessionId)}`),
  deleteAuditSession: (sessionId) =>
    requestJson(`/api/audit/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  auditAsk: (sessionId, question) =>
    requestJson(`/api/audit/sessions/${encodeURIComponent(sessionId)}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  auditVote: (sessionId, questionIndex, winnerLabel) =>
    requestJson(`/api/audit/sessions/${encodeURIComponent(sessionId)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ question_index: questionIndex, winner_label: winnerLabel }),
    }),
  auditFinish: (sessionId) =>
    requestJson(`/api/audit/sessions/${encodeURIComponent(sessionId)}/finish`, { method: 'POST' }),
  getAuditReport: (sessionId) =>
    requestJson(`/api/audit/sessions/${encodeURIComponent(sessionId)}/report`),

  // ---------------------------------------------------------------------
  // Benchmark / evaluation-dataset
  // ---------------------------------------------------------------------
  listBenchmarkDatasets: () => requestJson('/api/audit/benchmarks'),
  createBenchmarkDataset: (body) =>
    requestJson('/api/audit/benchmarks', { method: 'POST', body: JSON.stringify(body) }),
  importSquadBenchmark: (body) =>
    requestJson('/api/audit/benchmarks/import-squad', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  importHfBenchmark: (body) =>
    requestJson('/api/audit/benchmarks/import-hf', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getBenchmarkDataset: (id) =>
    requestJson(`/api/audit/benchmarks/${encodeURIComponent(id)}`),
  deleteBenchmarkDataset: (id) =>
    requestJson(`/api/audit/benchmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listBenchmarkRuns: () => requestJson('/api/audit/benchmark-runs'),
  runBenchmark: (datasetId, body) =>
    requestJson(`/api/audit/benchmarks/${encodeURIComponent(datasetId)}/run`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getBenchmarkRun: (runId) =>
    requestJson(`/api/audit/benchmark-runs/${encodeURIComponent(runId)}`),
  deleteBenchmarkRun: (runId) =>
    requestJson(`/api/audit/benchmark-runs/${encodeURIComponent(runId)}`, { method: 'DELETE' }),
};
