// Maps an LLM provider key (HF org prefix or OpenRouter vendor) to a
// brand-coloured logo component from `@lobehub/icons`. Used in the LLM
// model picker row, the provider filter dropdown, and anywhere else we
// surface a model id to the user.
//
// `getProviderLogo(key, size)` returns a React node or `null` if no brand
// match is found — callers should keep an initials-based fallback.

import {
  Anthropic,
  Cohere,
  DeepSeek,
  Gemini,
  Google,
  HuggingFace,
  Meta,
  Microsoft,
  Mistral,
  Nvidia,
  Ollama,
  OpenAI,
  OpenRouter,
  Perplexity,
  Qwen,
  Stability,
  XAI,
} from '@lobehub/icons';

// Map of normalized provider keys → logo component. Keys are lowercased so
// `Qwen`, `qwen`, and `QWEN` all resolve to the same icon.
const PROVIDER_LOGOS = {
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
};

export const hasProviderLogo = (providerKey) => {
  if (!providerKey) return false;
  return Boolean(PROVIDER_LOGOS[String(providerKey).toLowerCase()]);
};

export const getProviderLogo = (providerKey, size = 18) => {
  if (!providerKey) return null;
  const Component = PROVIDER_LOGOS[String(providerKey).toLowerCase()];
  if (!Component) return null;
  // Most lobehub icons expose a `.Color` subcomponent for the multi-colour
  // brand variant. Fall back to the monochrome root if `.Color` is absent.
  const Variant = Component.Color || Component;
  return <Variant size={size} />;
};
