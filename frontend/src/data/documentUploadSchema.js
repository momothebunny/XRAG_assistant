export const DEFAULT_DOCUMENT_UPLOAD_CONFIG = {
  remove_headers_footers: true,
  normalize_whitespace: true,
  ocr_enabled: false,
  ocr_dpi: 300,
  page_range: '1-10, 15',
  image_handling: 'ignore',
  auto_tagging: false,
  source_label: 'policy_docs_2024',
};

// Re-exported from the new panel so canvasConfig only needs to import from
// this module. Keeps the legacy schema co-located with the new selection-
// based default config.
export { DEFAULT_UPLOADED_DOCUMENTS_CONFIG } from '../components/canvas/UploadedDocumentsSettingsPanel';

export const DOCUMENT_UPLOAD_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'xrag.document-upload.config.schema.json',
  title: 'Document Upload Node Config',
  description: 'Config schema for INPUT/Document Upload node before handing off to Chunking.',
  type: 'object',
  additionalProperties: false,
  required: [
    'remove_headers_footers',
    'normalize_whitespace',
    'ocr_enabled',
    'page_range',
    'image_handling',
    'auto_tagging',
    'source_label',
  ],
  properties: {
    remove_headers_footers: {
      type: 'boolean',
      description: 'Removes repeated page headers/footers to reduce retrieval noise.',
      default: true,
    },
    normalize_whitespace: {
      type: 'boolean',
      description: 'Normalizes spaces and blank lines to improve chunk consistency.',
      default: true,
    },
    ocr_enabled: {
      type: 'boolean',
      description: 'Runs OCR for scanned/image PDFs when text layer is missing.',
      default: false,
    },
    ocr_dpi: {
      type: 'integer',
      minimum: 150,
      maximum: 600,
      description: 'OCR rendering DPI. Higher values can improve text extraction quality at higher cost.',
      default: 300,
    },
    page_range: {
      type: 'string',
      pattern: '^[0-9,\-\s]+$',
      description: 'Page selection in range notation, e.g. "1-10, 15".',
      default: '1-10, 15',
    },
    image_handling: {
      type: 'string',
      enum: ['ignore', 'extract'],
      description: 'Image policy during extraction.',
      default: 'ignore',
    },
    auto_tagging: {
      type: 'boolean',
      description: 'Uses a lightweight model to auto-assign domain tags.',
      default: false,
    },
    source_label: {
      type: 'string',
      minLength: 1,
      maxLength: 80,
      description: 'Human-readable source identifier for provenance and filtering.',
      default: 'policy_docs_2024',
    },
  },
};

export const buildDocumentUploadChunkingPayload = (config) => {
  return {
    node_type: 'input.document_upload',
    version: '1.0.0',
    handoff_to: 'process.chunking',
    preprocessing: {
      remove_headers_footers: config.remove_headers_footers,
      normalize_whitespace: config.normalize_whitespace,
      ocr_enabled: config.ocr_enabled,
      ocr_dpi: config.ocr_dpi,
    },
    extraction_strategy: {
      page_range: config.page_range,
      image_handling: config.image_handling,
    },
    metadata_enrichment: {
      auto_tagging: config.auto_tagging,
      source_label: config.source_label,
    },
  };
};
