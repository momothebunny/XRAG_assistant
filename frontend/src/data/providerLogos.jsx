// Maps an LLM provider key (HF org prefix or OpenRouter vendor) to a
// brand-coloured logo component from `@lobehub/icons`. Used in the LLM
// model picker row, the provider filter dropdown, and anywhere else we
// surface a model id to the user.
//
// `getProviderLogo(key, size)` returns a React node or `null` if no brand
// match is found — callers should keep an initials-based fallback.

import {
  Alibaba,
  Anthropic,
  Azure,
  Bedrock,
  Cerebras,
  Cohere,
  CometAPI,
  DeepSeek,
  Fireworks,
  Gemini,
  Google,
  Groq,
  HuggingFace,
  IBM,
  Meta,
  Microsoft,
  Mistral,
  Nvidia,
  Ollama,
  OpenAI,
  OpenRouter,
  Perplexity,
  Qwen,
  SambaNova,
  Stability,
  Together,
  VertexAI,
  Wenxin,
  WorkersAI,
  XAI,
} from '@lobehub/icons';

// Map of normalized provider keys → logo component. Keys are lowercased so
// `Qwen`, `qwen`, and `QWEN` all resolve to the same icon.
const PROVIDER_LOGOS = {
  // ── Standard keys used by GATEWAY_PROVIDERS ──────────────────────────
  openai: OpenAI,
  anthropic: Anthropic,
  google: Google,
  gemini: Gemini,
  'meta-llama': Meta,
  meta: Meta,
  mistralai: Mistral,
  mistral: Mistral,
  deepseek: DeepSeek,
  'deepseek-ai': DeepSeek,
  qwen: Qwen,
  alibaba: Alibaba,
  cohere: Cohere,
  cohereforai: Cohere,
  perplexity: Perplexity,
  xai: XAI,
  nvidia: Nvidia,
  microsoft: Microsoft,
  stabilityai: Stability,
  stability: Stability,
  ollama: Ollama,
  huggingface: HuggingFace,
  huggingfaceh4: HuggingFace,
  hf: HuggingFace,
  openrouter: OpenRouter,
  // ── New provider logos ────────────────────────────────────────────────
  bedrock: Bedrock,
  'aws-bedrock': Bedrock,
  azure: Azure,
  wenxin: Wenxin,
  baidu: Wenxin,
  cerebras: Cerebras,
  workersai: WorkersAI,
  cloudflare: WorkersAI,
  comet: CometAPI,
  fireworks: Fireworks,
  vertexai: VertexAI,
  ibm: IBM,
  sambanova: SambaNova,
  together: Together,
  groq: Groq,
};

// Image-based logos (SVG files in /public/provider-logos/) for providers
// not available in @lobehub/icons.
const IMAGE_LOGOS = {
  localai:      '/provider-logos/localai.svg',
  litellm:      '/provider-logos/litellm.svg',
  bedrock:      '/provider-logos/aws-bedrock.svg',
  'aws-bedrock': '/provider-logos/aws-bedrock.svg',
};

export const hasProviderLogo = (providerKey) => {
  if (!providerKey) return false;
  const key = String(providerKey).toLowerCase();
  return Boolean(PROVIDER_LOGOS[key] || IMAGE_LOGOS[key]);
};

export const getProviderLogo = (providerKey, size = 18) => {
  if (!providerKey) return null;
  const key = String(providerKey).toLowerCase();

  // Image-based logos
  const imgSrc = IMAGE_LOGOS[key];
  if (imgSrc) {
    return <img src={imgSrc} alt={providerKey} width={size} height={size} style={{ objectFit: 'contain' }} />;
  }

  // @lobehub/icons components
  const Component = PROVIDER_LOGOS[key];
  if (!Component) return null;
  // Most lobehub icons expose a `.Color` subcomponent for the multi-colour
  // brand variant. Fall back to the monochrome root if `.Color` is absent.
  const Variant = Component.Color || Component;
  return <Variant size={size} />;
};
