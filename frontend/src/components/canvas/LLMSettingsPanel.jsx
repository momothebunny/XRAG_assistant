/**
 * LLMSettingsPanel � OpenRouter / HuggingFace-backed chat-completion node.
 *
 * Visual language: same modern atoms as User / Question / Response panels
 * (hero card, upstream contract pills, quick-preset grid, sectioned cards,
 * ToggleChip pills, range sliders, validation strip, payload preview),
 * AMBER / YELLOW palette to mirror the brain-llm node colour
 * (`bg-amber-900/20 border-amber-700/40 text-amber-400`).
 *
 * RICH MODEL BROWSER (restored)
 *   � Loads the curated Top-1000 HuggingFace text-generation models from
 *     the server proxy (`GET /api/models/hf-chat?limit=1000`).
 *   � Virtualised scroller (52 px row height) so 1 000 entries render
 *     without lagging React.
 *   � Search + sort (downloads / likes / recent / name) + provider filter
 *     dropdown (OpenAI, Anthropic, Meta, Mistral, �).
 *   � Custom HF model import (`POST /api/models/hf-model?model_id=�`)
 *     persisted to localStorage; flagged with a Sparkles badge in the list.
 *   � Hides ids the Health Dashboard has marked as unsupported (via the
 *     `xrag.health.unsupported` localStorage key + `xrag:unsupported-models`
 *     same-tab event), but never hides the currently selected one.
 *   � Fallback model picker (silent retry on 429 / 5xx).
 *
 * BACKEND CONTRACT (UNCHANGED � backend canvas runner depends on it)
 *   step_type = "llm"
 *   gateway   = "backend_proxy"
 *   metadata  = {
 *     model_id, fallback_model_id, temperature, max_tokens, top_p,
 *     response_format, streaming, stop_sequences, frequency_penalty,
 *     presence_penalty, seed, context_overflow_strategy, structured_config?
 *   }
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Cloud,
  Compass,
  Database,
  Download,
  ExternalLink,
  Flame,
  BrainCircuit,
  Heart,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Star,
  Target,
  Type,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';
import { getProviderLogo, hasProviderLogo } from '../../data/providerLogos';

// ��� Curated fallback (only used when the proxy is unreachable) ���������
const FALLBACK_MODELS = [
  { id: 'meta-llama/Meta-Llama-3-8B-Instruct',     name: 'Meta-Llama-3-8B-Instruct',     downloads: 0, likes: 0 },
  { id: 'meta-llama/Meta-Llama-3-70B-Instruct',    name: 'Meta-Llama-3-70B-Instruct',    downloads: 0, likes: 0 },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3',      name: 'Mistral-7B-Instruct-v0.3',     downloads: 0, likes: 0 },
  { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',    name: 'Mixtral-8x7B-Instruct-v0.1',   downloads: 0, likes: 0 },
  { id: 'Qwen/Qwen2.5-7B-Instruct',                name: 'Qwen2.5-7B-Instruct',          downloads: 0, likes: 0 },
  { id: 'Qwen/Qwen2.5-72B-Instruct',               name: 'Qwen2.5-72B-Instruct',         downloads: 0, likes: 0 },
  { id: 'google/gemma-2-9b-it',                    name: 'gemma-2-9b-it',                downloads: 0, likes: 0 },
  { id: 'deepseek-ai/DeepSeek-R1',                 name: 'DeepSeek-R1',                  downloads: 0, likes: 0 },
];

const HF_MODEL_LIMIT = 1000;

// ─── Gateway provider catalogue ──────────────────────────────────────────────
// `logo` must match a key in providerLogos.jsx; `isHfBrowser` gateways use the
// full HuggingFace trending browser instead of the curated model list.
const GATEWAY_PROVIDERS = [
  // ── Sorted alphabetically per the user's requested list ──────────────
  {
    key: 'aws-bedrock', label: 'AWS Bedrock', logo: 'bedrock', initials: 'AW',
    defaultModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
    models: [
      { id: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet', desc: 'Via AWS Bedrock' },
      { id: 'bedrock/amazon.nova-pro-v1:0',                      label: 'Nova Pro',           desc: 'Amazon flagship' },
      { id: 'bedrock/amazon.nova-lite-v1:0',                     label: 'Nova Lite',          desc: 'Fast & cheap' },
      { id: 'bedrock/meta.llama3-70b-instruct-v1:0',             label: 'Llama 3 70B',        desc: 'Meta on Bedrock' },
    ],
  },
  {
    key: 'azure', label: 'Azure OpenAI', logo: 'azure', initials: 'AZ',
    defaultModel: 'azure/gpt-4o',
    models: [
      { id: 'azure/gpt-4o',           label: 'GPT-4o',      desc: 'Azure hosted' },
      { id: 'azure/gpt-4o-mini',      label: 'GPT-4o Mini', desc: 'Fast & cheap' },
      { id: 'azure/gpt-4-turbo',      label: 'GPT-4 Turbo', desc: '128 k context' },
    ],
    hasCustomInput: true,
  },
  {
    key: 'alibaba', label: 'Alibaba Tongyi', logo: 'alibaba', initials: 'AL',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct',       label: 'Qwen 2.5 72B',       desc: 'Flagship model' },
      { id: 'Qwen/Qwen2.5-7B-Instruct',        label: 'Qwen 2.5 7B',        desc: 'Fast & efficient' },
      { id: 'Qwen/QwQ-32B-Preview',            label: 'QwQ 32B',            desc: 'Reasoning model' },
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', label: 'Qwen 2.5 Coder 32B', desc: 'Code expert' },
    ],
  },
  {
    key: 'anthropic', label: 'Anthropic Claude', logo: 'anthropic', initials: 'AN',
    defaultModel: 'anthropic/claude-3-5-sonnet',
    models: [
      { id: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', desc: 'Best performance' },
      { id: 'anthropic/claude-3-5-haiku',  label: 'Claude 3.5 Haiku',  desc: 'Fast & affordable' },
      { id: 'anthropic/claude-3-opus',     label: 'Claude 3 Opus',     desc: 'Most capable' },
    ],
  },
  {
    key: 'baidu', label: 'Baidu Wenxin', logo: 'wenxin', initials: 'BD',
    defaultModel: 'ernie-4.0-8k',
    models: [
      { id: 'ernie-4.0-8k',    label: 'ERNIE 4.0 8K',   desc: 'Flagship model' },
      { id: 'ernie-3.5-8k',    label: 'ERNIE 3.5 8K',   desc: 'Balanced' },
      { id: 'ernie-speed-128k', label: 'ERNIE Speed 128K', desc: 'Fast & long ctx' },
    ],
  },
  {
    key: 'cerebras', label: 'Cerebras', logo: 'cerebras', initials: 'CB',
    defaultModel: 'cerebras/llama3.3-70b',
    models: [
      { id: 'cerebras/llama3.3-70b', label: 'Llama 3.3 70B', desc: 'Ultra-fast on Cerebras' },
      { id: 'cerebras/llama3.1-8b',  label: 'Llama 3.1 8B',  desc: 'Fastest inference' },
    ],
  },
  {
    key: 'cloudflare', label: 'Cloudflare Workers AI', logo: 'workersai', initials: 'CF',
    defaultModel: 'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    models: [
      { id: 'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B',  desc: 'Fastest Cloudflare' },
      { id: 'cloudflare/@cf/mistral/mistral-7b-instruct-v0.2',      label: 'Mistral 7B',     desc: 'Edge inference' },
      { id: 'cloudflare/@cf/google/gemma-2-2b-it',                  label: 'Gemma 2 2B',     desc: 'Lightweight' },
    ],
    hasCustomInput: true,
  },
  {
    key: 'cohere', label: 'Cohere', logo: 'cohere', initials: 'CO',
    defaultModel: 'CohereForAI/c4ai-command-r-plus-08-2024',
    models: [
      { id: 'CohereForAI/c4ai-command-r-plus-08-2024', label: 'Command R+', desc: 'Best for RAG' },
      { id: 'CohereForAI/c4ai-command-r-08-2024',      label: 'Command R',  desc: 'Efficient RAG' },
    ],
  },
  {
    key: 'comet', label: 'Comet', logo: 'comet', initials: 'CM',
    defaultModel: 'comet/comet-research',
    models: [
      { id: 'comet/comet-research', label: 'Comet Research', desc: 'Research-grade LLM' },
    ],
    hasCustomInput: true,
  },
  {
    key: 'fireworks', label: 'Fireworks AI', logo: 'fireworks', initials: 'FW',
    defaultModel: 'fireworks_ai/accounts/fireworks/models/llama-v3p3-70b-instruct',
    models: [
      { id: 'fireworks_ai/accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B', desc: 'Fast inference' },
      { id: 'fireworks_ai/accounts/fireworks/models/mixtral-8x7b-instruct',   label: 'Mixtral 8x7B',  desc: 'MoE on Fireworks' },
      { id: 'fireworks_ai/accounts/fireworks/models/deepseek-r1',             label: 'DeepSeek R1',   desc: 'Reasoning model' },
    ],
  },
  {
    key: 'google', label: 'Google Gemini', logo: 'gemini', initials: 'GG',
    defaultModel: 'google/gemini-2.0-flash',
    models: [
      { id: 'google/gemini-2.0-flash',                  label: 'Gemini 2.0 Flash',    desc: 'Fast multimodal' },
      { id: 'google/gemini-2.0-flash-thinking-exp',     label: 'Gemini 2.0 Thinking', desc: 'Reasoning' },
      { id: 'google/gemini-1.5-pro',                    label: 'Gemini 1.5 Pro',      desc: '2 M context' },
      { id: 'google/gemini-1.5-flash',                  label: 'Gemini 1.5 Flash',    desc: 'Fast responses' },
    ],
  },
  {
    key: 'vertexai', label: 'Google VertexAI', logo: 'vertexai', initials: 'VX',
    defaultModel: 'vertex_ai/gemini-2.0-flash-001',
    models: [
      { id: 'vertex_ai/gemini-2.0-flash-001',     label: 'Gemini 2.0 Flash', desc: 'Via Vertex AI' },
      { id: 'vertex_ai/gemini-1.5-pro-001',       label: 'Gemini 1.5 Pro',   desc: '2 M ctx Vertex' },
      { id: 'vertex_ai/claude-3-5-sonnet@20241022', label: 'Claude 3.5 Sonnet', desc: 'Anthropic on Vertex' },
    ],
  },
  {
    key: 'huggingface', label: 'HuggingFace', logo: 'huggingface', initials: 'HF',
    defaultModel: 'meta-llama/Meta-Llama-3-8B-Instruct',
    models: [], isHfBrowser: true,
  },
  {
    key: 'ibm', label: 'IBM Watsonx', logo: 'ibm', initials: 'IB',
    defaultModel: 'watsonx/ibm/granite-3-8b-instruct',
    models: [
      { id: 'watsonx/ibm/granite-3-8b-instruct',   label: 'Granite 3 8B',   desc: 'IBM enterprise' },
      { id: 'watsonx/ibm/granite-3-2b-instruct',   label: 'Granite 3 2B',   desc: 'Compact & fast' },
      { id: 'watsonx/meta-llama/llama-3-3-70b-instruct', label: 'Llama 3.3 70B', desc: 'Meta on Watsonx' },
    ],
  },
  {
    key: 'litellm', label: 'LiteLLM', logo: 'litellm', initials: 'LL',
    defaultModel: 'litellm/gpt-4o',
    models: [],
    hasCustomInput: true,
  },
  {
    key: 'localai', label: 'LocalAI', logo: 'localai', initials: 'LA',
    defaultModel: 'localai/gpt-4',
    models: [],
    hasCustomInput: true,
  },
  {
    key: 'mistralai', label: 'MistralAI', logo: 'mistral', initials: 'MI',
    defaultModel: 'mistralai/Mistral-Large-Instruct-2411',
    models: [
      { id: 'mistralai/Mistral-Large-Instruct-2411', label: 'Mistral Large', desc: 'Flagship model' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B',  desc: 'MoE powerhouse' },
      { id: 'mistralai/Mistral-7B-Instruct-v0.3',   label: 'Mistral 7B',    desc: 'Fast & efficient' },
    ],
  },
  {
    key: 'nemo', label: 'Nemo Guardrails', logo: 'nvidia', initials: 'NE',
    defaultModel: 'nemo/meta/llama-3.1-8b-instruct',
    models: [
      { id: 'nemo/meta/llama-3.1-8b-instruct',  label: 'Llama 3.1 8B',   desc: 'Via Nemo' },
      { id: 'nemo/meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B',  desc: 'Via Nemo' },
    ],
    hasCustomInput: true,
  },
  {
    key: 'ollama', label: 'Ollama', logo: 'ollama', initials: 'OL',
    defaultModel: 'ollama/llama3.3',
    models: [
      { id: 'ollama/llama3.3',    label: 'Llama 3.3',   desc: 'Latest Llama local' },
      { id: 'ollama/llama3.2',    label: 'Llama 3.2',   desc: 'Multimodal local' },
      { id: 'ollama/mistral',     label: 'Mistral',     desc: 'Fast local model' },
      { id: 'ollama/qwen2.5',     label: 'Qwen 2.5',    desc: 'Multilingual local' },
      { id: 'ollama/deepseek-r1', label: 'DeepSeek R1', desc: 'Reasoning local' },
    ],
    hasCustomInput: true,
  },
  {
    key: 'openai', label: 'OpenAI', logo: 'openai', initials: 'OA',
    defaultModel: 'openai/gpt-4o',
    models: [
      { id: 'openai/gpt-4o',      label: 'GPT-4o',      desc: 'Flagship multimodal' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', desc: 'Fast & affordable' },
      { id: 'openai/o3-mini',     label: 'o3-mini',     desc: 'Efficient reasoning' },
      { id: 'openai/o1',          label: 'o1',          desc: 'Advanced reasoning' },
      { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', desc: '128 k context' },
    ],
  },
  {
    key: 'openai-custom', label: 'OpenAI Custom Model', logo: 'openai', initials: 'OC',
    defaultModel: 'openai/ft:gpt-4o:org:model-name',
    models: [],
    hasCustomInput: true,
  },
  {
    key: 'openrouter', label: 'OpenRouter', logo: 'openrouter', initials: 'OR',
    defaultModel: 'openrouter/auto',
    models: [
      { id: 'openrouter/auto', label: 'Auto (best)', desc: 'Intelligent routing' },
    ],
    hasCustomInput: true,
  },
  {
    key: 'perplexity', label: 'Perplexity', logo: 'perplexity', initials: 'PP',
    defaultModel: 'perplexity/sonar-pro',
    models: [
      { id: 'perplexity/sonar-pro',    label: 'Sonar Pro',    desc: 'Online search' },
      { id: 'perplexity/sonar',        label: 'Sonar',        desc: 'Fast online' },
      { id: 'perplexity/sonar-reasoning', label: 'Sonar Reasoning', desc: 'Reasoning + web' },
    ],
  },
  {
    key: 'sambanova', label: 'SambaNova', logo: 'sambanova', initials: 'SN',
    defaultModel: 'sambanova/Meta-Llama-3.3-70B-Instruct',
    models: [
      { id: 'sambanova/Meta-Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B', desc: 'Ultra-fast on SN40L' },
      { id: 'sambanova/Meta-Llama-3.1-405B-Instruct', label: 'Llama 3.1 405B', desc: 'Largest open model' },
      { id: 'sambanova/DeepSeek-R1',                  label: 'DeepSeek R1',   desc: 'Reasoning on SN' },
    ],
  },
  {
    key: 'together', label: 'TogetherAI', logo: 'together', initials: 'TA',
    defaultModel: 'together_ai/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    models: [
      { id: 'together_ai/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo', desc: 'Fast inference' },
      { id: 'together_ai/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',  label: 'Llama 3.1 8B Turbo',  desc: 'Fastest & cheap' },
      { id: 'together_ai/deepseek-ai/DeepSeek-R1',                      label: 'DeepSeek R1',          desc: 'Reasoning model' },
      { id: 'together_ai/mistralai/Mixtral-8x7B-Instruct-v0.1',         label: 'Mixtral 8x7B',         desc: 'MoE on Together' },
    ],
  },
  {
    key: 'x-ai', label: 'xAI Grok', logo: 'xai', initials: 'XA',
    defaultModel: 'x-ai/grok-2-1212',
    models: [
      { id: 'x-ai/grok-2-1212',        label: 'Grok 2',         desc: 'Latest Grok' },
      { id: 'x-ai/grok-3-beta',        label: 'Grok 3 Beta',    desc: 'Frontier model' },
      { id: 'x-ai/grok-3-mini-beta',   label: 'Grok 3 Mini',    desc: 'Fast & efficient' },
    ],
  },
  {
    key: 'deepseek', label: 'Deepseek', logo: 'deepseek', initials: 'DS',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3',                 label: 'DeepSeek V3',   desc: 'Latest flagship' },
      { id: 'deepseek-ai/DeepSeek-R1',                 label: 'DeepSeek R1',   desc: 'Reasoning model' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', label: 'R1 Distill 7B', desc: 'Small & fast' },
    ],
  },
  {
    key: 'groq', label: 'Groq', logo: 'groq', initials: 'GQ',
    defaultModel: 'groq/llama-3.3-70b-versatile',
    models: [
      { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B', desc: 'Ultra-fast inference' },
      { id: 'groq/llama-3.1-8b-instant',    label: 'Llama 3.1 8B',  desc: 'Fastest model' },
      { id: 'groq/mixtral-8x7b-32768',      label: 'Mixtral 8x7B',  desc: 'MoE on Groq' },
      { id: 'groq/gemma2-9b-it',            label: 'Gemma 2 9B',    desc: 'Google on Groq' },
      { id: 'groq/deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B', desc: 'Reasoning on Groq' },
    ],
  },
];

const deriveGatewayKey = (modelId) => {
  const prefix = String(modelId || '').split('/')[0].toLowerCase();
  if (prefix === 'openai')                               return 'openai';
  if (prefix === 'anthropic')                            return 'anthropic';
  if (prefix === 'google' || prefix === 'gemini')        return 'google';
  if (prefix === 'vertex_ai')                            return 'vertexai';
  if (prefix === 'mistralai')                            return 'mistralai';
  if (prefix === 'deepseek-ai' || prefix === 'deepseek') return 'deepseek';
  if (prefix === 'qwen')                                 return 'alibaba';
  if (prefix === 'cohere' || prefix === 'cohereforai')   return 'cohere';
  if (prefix === 'perplexity')                           return 'perplexity';
  if (prefix === 'x-ai')                                 return 'x-ai';
  if (prefix === 'groq')                                 return 'groq';
  if (prefix === 'openrouter')                           return 'openrouter';
  if (prefix === 'ollama')                               return 'ollama';
  if (prefix === 'azure')                                return 'azure';
  if (prefix === 'bedrock')                              return 'aws-bedrock';
  if (prefix === 'fireworks_ai')                         return 'fireworks';
  if (prefix === 'together_ai')                          return 'together';
  if (prefix === 'sambanova')                            return 'sambanova';
  if (prefix === 'watsonx')                              return 'ibm';
  if (prefix === 'cerebras')                             return 'cerebras';
  if (prefix === 'cloudflare')                           return 'cloudflare';
  if (prefix === 'nemo')                                 return 'nemo';
  if (prefix === 'litellm')                              return 'litellm';
  if (prefix === 'localai')                              return 'localai';
  if (prefix === 'ernie')                                return 'baidu';
  if (prefix === 'comet')                                return 'comet';
  return 'huggingface';
};

// ─── Provider → API-key env-var mapping ──────────────────────────────────────
// null = no API key required (local provider)
const PROVIDER_ENV_MAP = {
  'openai':        { catalog: 'openai',      env_var: 'OPENAI_API_KEY' },
  'openai-custom': { catalog: 'openai',      env_var: 'OPENAI_API_KEY' },
  'anthropic':     { catalog: 'anthropic',   env_var: 'ANTHROPIC_API_KEY' },
  'google':        { catalog: 'gemini',      env_var: 'GOOGLE_API_KEY' },
  'vertexai':      { catalog: 'gemini',      env_var: 'GOOGLE_API_KEY' },
  'alibaba':       { catalog: 'custom',      env_var: 'ALIBABA_API_KEY' },
  'baidu':         { catalog: 'custom',      env_var: 'QIANFAN_API_KEY' },
  'cerebras':      { catalog: 'custom',      env_var: 'CEREBRAS_API_KEY' },
  'cloudflare':    { catalog: 'custom',      env_var: 'CLOUDFLARE_API_KEY' },
  'cohere':        { catalog: 'cohere',      env_var: 'COHERE_API_KEY' },
  'comet':         { catalog: 'custom',      env_var: 'COMET_API_KEY' },
  'fireworks':     { catalog: 'custom',      env_var: 'FIREWORKS_AI_API_KEY' },
  'huggingface':   { catalog: 'huggingface', env_var: 'HUGGINGFACE_API_KEY' },
  'ibm':           { catalog: 'custom',      env_var: 'WATSONX_API_KEY' },
  'litellm':       { catalog: 'custom',      env_var: 'LITELLM_API_KEY' },
  'mistralai':     { catalog: 'mistral',     env_var: 'MISTRAL_API_KEY' },
  'nemo':          { catalog: 'custom',      env_var: 'NVIDIA_API_KEY' },
  'openrouter':    { catalog: 'openrouter',  env_var: 'OPENROUTER_API_KEY' },
  'perplexity':    { catalog: 'custom',      env_var: 'PERPLEXITY_API_KEY' },
  'sambanova':     { catalog: 'custom',      env_var: 'SAMBANOVA_API_KEY' },
  'together':      { catalog: 'custom',      env_var: 'TOGETHER_API_KEY' },
  'x-ai':          { catalog: 'custom',      env_var: 'XAI_API_KEY' },
  'deepseek':      { catalog: 'deepseek',    env_var: 'DEEPSEEK_API_KEY' },
  'groq':          { catalog: 'groq',        env_var: 'GROQ_API_KEY' },
  'aws-bedrock': {
    catalog: 'custom',
    fields: [
      { env_var: 'AWS_ACCESS_KEY_ID',     label: 'Access Key ID',     placeholder: 'AKIA…',                                          required: true,  secret: false },
      { env_var: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', placeholder: '••••••••',                                       required: true,  secret: true  },
      { env_var: 'AWS_REGION',            label: 'AWS Region',        placeholder: 'Select region',                                  required: true,  secret: false, options: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1'] },
      { env_var: 'AWS_SESSION_TOKEN',     label: 'Session Token',     placeholder: 'For temporary credentials (optional)',           required: false, secret: true  },
      { env_var: 'AWS_ROLE_ARN',          label: 'Role ARN',          placeholder: 'arn:aws:iam::123456789012:role/role-name',       required: false, secret: false },
      { env_var: 'AWS_EXTERNAL_ID',       label: 'External ID',       placeholder: 'unique-external-id (optional)',                  required: false, secret: false },
    ],
  },
  'azure':         { catalog: 'custom',      env_var: 'AZURE_API_KEY' },
  // local providers — no key required
  'ollama':   null,
  'localai':  null,
};

// ��� Sort options for the model picker ����������������������������������
const SORT_OPTIONS = [
  { key: 'downloads', label: 'Most downloaded', short: 'Downloads', accent: 'amber',  Icon: Download },
  { key: 'likes',     label: 'Most liked',      short: 'Likes',     accent: 'rose',   Icon: Heart    },
  { key: 'recent',    label: 'Recently updated',short: 'Recent',    accent: 'sky',    Icon: Calendar },
  { key: 'name',      label: 'Name (A-Z)',      short: 'Name',      accent: 'slate',  Icon: Type     },
];

const SORT_ACCENTS = {
  amber:  { ring: 'border-amber-600/60 bg-amber-900/20 text-amber-300',     dot: 'bg-amber-500',   soft: 'text-amber-600'  },
  rose:   { ring: 'border-rose-300 bg-rose-900/20 text-rose-300',         dot: 'bg-rose-500',    soft: 'text-rose-600'   },
  sky:    { ring: 'border-sky-600/60 bg-sky-900/20 text-sky-300',            dot: 'bg-sky-500',     soft: 'text-sky-400'    },
  slate:  { ring: 'border-slate-600/60 bg-slate-800/60 text-slate-100',     dot: 'bg-slate-500',   soft: 'text-slate-300'  },
};

let _modelsPromise = null;
const loadModels = (force = false) => {
  if (force || !_modelsPromise) {
    _modelsPromise = xragApi
      .listHuggingFaceChatModels(HF_MODEL_LIMIT)
      .then((list) => (Array.isArray(list) && list.length ? list : FALLBACK_MODELS))
      .catch(() => FALLBACK_MODELS);
  }
  return _modelsPromise;
};

// ��� Provider visual identity �������������������������������������������
const PROVIDER_STYLE = {
  openai:        { label: 'OpenAI',         dot: 'bg-emerald-500', solid: 'bg-emerald-600 text-white border-emerald-600' },
  anthropic:     { label: 'Anthropic',      dot: 'bg-orange-500',  solid: 'bg-orange-500 text-white border-orange-500'   },
  google:        { label: 'Google',         dot: 'bg-sky-500',     solid: 'bg-sky-600 text-white border-sky-600'         },
  'meta-llama':  { label: 'Meta Llama',     dot: 'bg-blue-600',    solid: 'bg-blue-600 text-white border-blue-600'       },
  mistralai:     { label: 'Mistral',        dot: 'bg-orange-600',  solid: 'bg-orange-600 text-white border-orange-600'   },
  Qwen:          { label: 'Qwen',           dot: 'bg-purple-500',  solid: 'bg-purple-600 text-white border-purple-600'   },
  'deepseek-ai': { label: 'DeepSeek',       dot: 'bg-indigo-500',  solid: 'bg-indigo-600 text-white border-indigo-600'   },
  deepseek:      { label: 'DeepSeek',       dot: 'bg-indigo-500',  solid: 'bg-indigo-600 text-white border-indigo-600'   },
  'x-ai':        { label: 'xAI Grok',       dot: 'bg-slate-700',   solid: 'bg-slate-700 text-white border-slate-700'     },
  cohere:        { label: 'Cohere',         dot: 'bg-pink-500',    solid: 'bg-pink-600 text-white border-pink-600'       },
  perplexity:    { label: 'Perplexity',     dot: 'bg-teal-500',    solid: 'bg-teal-600 text-white border-teal-600'       },
  microsoft:     { label: 'Microsoft',      dot: 'bg-blue-500',    solid: 'bg-blue-500 text-white border-blue-500'       },
  nvidia:        { label: 'NVIDIA',         dot: 'bg-lime-500',    solid: 'bg-lime-600 text-white border-lime-600'       },
  nousresearch:  { label: 'Nous Research',  dot: 'bg-fuchsia-500', solid: 'bg-fuchsia-600 text-white border-fuchsia-600' },
  HuggingFaceH4: { label: 'HuggingFace H4', dot: 'bg-amber-500',   solid: 'bg-amber-600 text-white border-amber-600'     },
};

const DEFAULT_PROVIDER_STYLE = {
  label: null,
  dot: 'bg-slate-400',
  solid: 'bg-slate-500 text-white border-slate-500',
};

const providerStyle = (id) => PROVIDER_STYLE[id] || DEFAULT_PROVIDER_STYLE;
const providerLabel = (id) => providerStyle(id).label || id;

const formatCount = (n) => {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
};

const stripProvider = (id) => String(id || '').split('/').slice(1).join('/') || id;

// ��� Shared atoms (amber palette) ����������������������������������������
const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-200/50';

const selectClass =
  'w-full appearance-none rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 pr-8 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-amber-600/60 bg-amber-900/20 text-amber-300 shadow-sm shadow-amber-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-amber-700/40 hover:text-amber-400'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-amber-500' : 'bg-slate-300 group-hover:bg-amber-300'
      }`}
    />
    {label}
  </button>
);

// ��� Domain options ������������������������������������������������������
const RESPONSE_FORMATS = [
  { value: 'text',        label: 'Plain text',  hint: 'Free-form natural language.' },
  { value: 'markdown',    label: 'Markdown',    hint: 'Hint the LLM to emit Markdown.' },
  { value: 'json_object', label: 'JSON object', hint: 'Strict valid JSON (free schema).' },
  { value: 'json_schema', label: 'JSON schema', hint: 'JSON validated against a schema.' },
  { value: 'latex',       label: 'LaTeX',       hint: 'Equations / scientific output.' },
];

const OVERFLOW_STRATEGIES = [
  { value: 'strict',          label: 'Strict - fail on overflow' },
  { value: 'truncate_middle', label: 'Truncate middle of context' },
  { value: 'truncate_end',    label: 'Truncate end of context' },
];

const LLM_PRESETS = [
  {
    id: 'precise',
    label: 'Precise',
    description: 'Low temperature, factual.',
    icon: Target,
    overrides: {
      temperature: 0.05, top_p: 1.0, max_tokens: 1024,
      response_format: 'text', streaming: true,
      frequency_penalty: 0.0, presence_penalty: 0.0,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default RAG settings.',
    icon: Compass,
    overrides: {
      temperature: 0.2, top_p: 1.0, max_tokens: 1024,
      response_format: 'text', streaming: true,
      frequency_penalty: 0.0, presence_penalty: 0.0,
    },
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Higher temperature, longer.',
    icon: Wand2,
    overrides: {
      temperature: 0.8, top_p: 0.95, max_tokens: 2048,
      response_format: 'markdown', streaming: true,
      frequency_penalty: 0.2, presence_penalty: 0.2,
    },
  },
  {
    id: 'json',
    label: 'JSON Tool',
    description: 'Structured JSON output.',
    icon: Sliders,
    overrides: {
      temperature: 0.0, top_p: 1.0, max_tokens: 1024,
      response_format: 'json_object', streaming: false,
      frequency_penalty: 0.0, presence_penalty: 0.0,
    },
  },
];

// ��� Public payload builder (UNCHANGED � backend depends on it) ����������
export function buildLlmPayload(config = {}) {
  const meta = config.metadata || {};
  const stopSeqRaw = Array.isArray(meta.stop_sequences) ? meta.stop_sequences : [];
  const seedRaw = meta.seed;
  const seed =
    seedRaw === null || seedRaw === undefined || seedRaw === ''
      ? null
      : Number.isFinite(Number(seedRaw))
        ? Math.trunc(Number(seedRaw))
        : null;
  return {
    step_type: 'llm',
    gateway: config.gateway || 'backend_proxy',
    metadata: {
      model_id: meta.model_id || 'openai/gpt-4o',
      fallback_model_id:
        typeof meta.fallback_model_id === 'string' && meta.fallback_model_id.trim()
          ? meta.fallback_model_id.trim()
          : null,
      temperature: Number(meta.temperature ?? 0.2),
      max_tokens: Number(meta.max_tokens ?? 1024),
      top_p: Number(meta.top_p ?? 1.0),
      response_format: ['text', 'json_object', 'json_schema', 'markdown', 'latex'].includes(
        meta.response_format,
      )
        ? meta.response_format
        : 'text',
      streaming: meta.streaming !== undefined ? Boolean(meta.streaming) : true,
      stop_sequences: stopSeqRaw.filter((s) => typeof s === 'string' && s.length > 0).slice(0, 4),
      frequency_penalty: Number(meta.frequency_penalty ?? 0.0),
      presence_penalty: Number(meta.presence_penalty ?? 0.0),
      seed,
      context_overflow_strategy: ['strict', 'truncate_middle', 'truncate_end'].includes(
        meta.context_overflow_strategy,
      )
        ? meta.context_overflow_strategy
        : 'strict',
      enable_memory: Boolean(meta.enable_memory ?? false),
      memory_type: ['buffer', 'summary', 'vector', 'kg'].includes(meta.memory_type)
        ? meta.memory_type
        : 'buffer',
    },
  };
}

export const DEFAULT_LLM_CONFIG = {
  gateway: 'backend_proxy',
  metadata: {
    model_id: 'openai/gpt-4o',
    fallback_model_id: null,
    temperature: 0.2,
    max_tokens: 1024,
    top_p: 1.0,
    response_format: 'text',
    streaming: true,
    stop_sequences: [],
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    seed: null,
    context_overflow_strategy: 'strict',
    enable_memory: false,
    memory_type: 'buffer',
  },
  preset: 'balanced',
};

// ��� Component �����������������������������������������������������������
export default function LLMSettingsPanel({
  value = {},
  onChange,
  hasQuerySource = false,
  hasChunksUpstream = false,
  hasSystemPromptUpstream = false,
  upstreamChunkCount = 0,
}) {
  // �� Catalogue / browser state ������������������������������������������
  const [models, setModels] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [sortBy, setSortBy] = useState('downloads');
  const [sortOpen, setSortOpen] = useState(false);
  const [gatewayKey, setGatewayKey] = useState(
    () => value?.gateway_provider ?? null,
  );
  const [gatewayOpen, setGatewayOpen] = useState(false);

  // Custom HF model imports persisted to localStorage.
  const [customModels, setCustomModels] = useState(() => {
    try {
      const raw = localStorage.getItem('xrag.llm.customModels');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [customId, setCustomId] = useState('');
  const [customError, setCustomError] = useState(null);
  const [customLoading, setCustomLoading] = useState(false);

  // Health dashboard � unsupported model ids to hide from the picker.
  const [unsupportedSet, setUnsupportedSet] = useState(() => {
    try {
      const raw = localStorage.getItem('xrag.health.unsupported');
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });

  // Advanced section + stop-sequences tag editor.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stopInput, setStopInput] = useState('');

  // Virtualisation � fixed row height, small overscan.
  const ROW_HEIGHT = 52;
  const VIEWPORT_HEIGHT = 360;
  const OVERSCAN = 4;
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const providerMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const gatewayMenuRef = useRef(null);

  // ── API-key modal state ────────────────────────────────────────────────
  const [apiKeyModal, setApiKeyModal] = useState(false);
  const [apiKeyName, setApiKeyName] = useState('');
  // single-field
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyShowValue, setApiKeyShowValue] = useState(false);
  // multi-field (e.g. AWS)
  const [apiKeyFields, setApiKeyFields] = useState({});      // { [env_var]: string }
  const [apiKeyShowFields, setApiKeyShowFields] = useState({}); // { [env_var]: boolean }
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(null);
  // tracks masked/status text per provider key after a successful save
  const [apiKeyMasked, setApiKeyMasked] = useState({});
  const [existingKeys, setExistingKeys] = useState([]);
  const [existingKeysLoading, setExistingKeysLoading] = useState(false);
  const [selectedExistingKeyId, setSelectedExistingKeyId] = useState(''); // '' = new key

  // ── Fallback model state ───────────────────────────────────────────────
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackGwKey, setFallbackGwKey] = useState(null);   // provider key for fallback
  const [fallbackModelCustom, setFallbackModelCustom] = useState(''); // free-text fallback model
  const [mainCustomOpen, setMainCustomOpen] = useState(false);     // custom model input visible for main provider
  const [fallbackCustomOpen, setFallbackCustomOpen] = useState(false); // custom model input visible for fallback
  const [modalGatewayKey, setModalGatewayKey] = useState(null);     // which provider the API key modal targets

  const metadata = value.metadata || {};
  const modelId = metadata.model_id || 'openai/gpt-4o';

  // 🔑 Pre-populate apiKeyMasked from backend on mount
  useEffect(() => {
    xragApi.listApiKeys()
      .then((keys) => {
        if (!Array.isArray(keys)) return;
        const masked = {};
        for (const [gwKey, envInfo] of Object.entries(PROVIDER_ENV_MAP)) {
          if (!envInfo) continue;
          const found = envInfo.fields
            ? keys.find((k) => k.provider === envInfo.catalog)
            : keys.find((k) => k.env_var === envInfo.env_var || k.provider === envInfo.catalog);
          if (found) masked[gwKey] = found.label || 'Key configured';
        }
        // session-set values (from saving in this session) take priority
        setApiKeyMasked((prev) => ({ ...masked, ...prev }));
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // �� Effects ������������������������������������������������������������
  // Debounce search (1 000-row dataset � re-filter on every keystroke is wasteful).
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Persist custom models.
  useEffect(() => {
    try {
      localStorage.setItem('xrag.llm.customModels', JSON.stringify(customModels));
    } catch { /* quota / disabled � fail silently */ }
  }, [customModels]);
  // Pre-fill customId when provider changes and current model is not in new list.
  useEffect(() => {
    const gp = GATEWAY_PROVIDERS.find((p) => p.key === gatewayKey);
    const inList = (gp?.models ?? []).some((m) => m.id === modelId);
    setCustomId(inList ? '' : (modelId || ''));
  }, [gatewayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open fallback panel if metadata already has a fallback model.
  useEffect(() => {
    if (metadata.fallback_model_id && !fallbackOpen) {
      setFallbackOpen(true);
      const found = GATEWAY_PROVIDERS.find((p) =>
        p.models?.some((m) => m.id === metadata.fallback_model_id),
      );
      setFallbackGwKey(found?.key ?? gatewayKey);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Live-sync unsupported model list (Health Dashboard updates it).
  useEffect(() => {
    const onSameTab = (event) => {
      const list = Array.isArray(event?.detail) ? event.detail : [];
      setUnsupportedSet(new Set(list));
    };
    const onCrossTab = (event) => {
      if (event.key !== 'xrag.health.unsupported') return;
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : [];
        setUnsupportedSet(new Set(Array.isArray(parsed) ? parsed : []));
      } catch { /* malformed � keep previous */ }
    };
    window.addEventListener('xrag:unsupported-models', onSameTab);
    window.addEventListener('storage', onCrossTab);
    return () => {
      window.removeEventListener('xrag:unsupported-models', onSameTab);
      window.removeEventListener('storage', onCrossTab);
    };
  }, []);

  // Outside-click for the provider dropdown.
  useEffect(() => {
    if (!providerOpen) return undefined;
    const handle = (event) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target)) {
        setProviderOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [providerOpen]);

  // Outside-click for the sort dropdown.
  useEffect(() => {
    if (!sortOpen) return undefined;
    const handle = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [sortOpen]);

  // Outside-click for the gateway dropdown.
  useEffect(() => {
    if (!gatewayOpen) return undefined;
    const handle = (event) => {
      if (gatewayMenuRef.current && !gatewayMenuRef.current.contains(event.target)) {
        setGatewayOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [gatewayOpen]);

  // Lazily ensure config carries `gateway` and `metadata` even on legacy drafts.
  useEffect(() => {
    if (!value.gateway) onChange?.('gateway', 'backend_proxy');
    if (!value.metadata) {
      onChange?.('metadata', {
        model_id: modelId,
        temperature: 0.2,
        max_tokens: 1024,
        top_p: 1.0,
        response_format: 'text',
        streaming: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // �� Catalogue refresh ��������������������������������������������������
  const refresh = (force = false) => {
    setRefreshing(true);
    setLoadError(null);
    loadModels(force)
      .then((list) => {
        setModels(list);
        if (list === FALLBACK_MODELS) {
          setLoadError('Backend unavailable � using built-in fallback list.');
        }
      })
      .finally(() => setRefreshing(false));
  };
  useEffect(() => { refresh(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // �� Custom HF model import ���������������������������������������������
  const setMeta = (key, next) => {
    onChange?.('metadata', { ...metadata, [key]: next });
    if (value.preset && value.preset !== 'custom') onChange?.('preset', 'custom');
  };

  const addCustomModel = async () => {
    const raw = customId.trim();
    setCustomError(null);
    if (!raw) return;
    if (!/^[\w.\-]+\/[\w.\-]+$/.test(raw)) {
      setCustomError('Format: org/model-name (e.g. meta-llama/Llama-3.1-8B-Instruct).');
      return;
    }
    if (customModels.some((m) => m.id === raw)) {
      setCustomError('Already in your custom list.');
      return;
    }
    setCustomLoading(true);
    try {
      const projected = await xragApi.getHuggingFaceModel(raw);
      const tag = String(projected.pipeline_tag || '').toLowerCase();
      if (tag && tag !== 'text-generation' && tag !== 'text2text-generation') {
        setCustomError(`Not a text-generation model (pipeline: ${tag}).`);
        return;
      }
      setCustomModels((prev) => [{ ...projected, __custom: true }, ...prev]);
      setMeta('model_id', projected.id);
      setCustomId('');
    } catch (err) {
      let detail = err?.message || 'Failed to fetch model.';
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.detail) detail = parsed.detail;
      } catch { /* not JSON */ }
      setCustomError(String(detail));
    } finally {
      setCustomLoading(false);
    }
  };
  const removeCustomModel = (id) =>
    setCustomModels((prev) => prev.filter((m) => m.id !== id));

  const selectGateway = (key) => {
    const gp = GATEWAY_PROVIDERS.find((g) => g.key === key);
    if (!gp) return;
    setGatewayKey(key);
    onChange?.('gateway_provider', key);
    if (!gp.isHfBrowser && gp.defaultModel) {
      setMeta('model_id', gp.defaultModel);
    }
  };

  const openApiKeyModal = (overrideKey) => {
    const targetGw = (overrideKey ? GATEWAY_PROVIDERS.find((p) => p.key === overrideKey) : activeGateway) ?? activeGateway;
    setModalGatewayKey(overrideKey ?? null);
    setApiKeyName('');
    setApiKeyValue('');
    setApiKeyFields({});
    setApiKeyShowValue(false);
    setApiKeyShowFields({});
    setApiKeyError(null);
    setSelectedExistingKeyId('');
    setExistingKeys([]);
    setExistingKeysLoading(true);
    xragApi.listApiKeys()
      .then((keys) => {
        const envInfo = PROVIDER_ENV_MAP[targetGw?.key];
        const relevant = Array.isArray(keys) ? keys.filter((k) =>
          envInfo?.fields
            ? k.provider === envInfo.catalog
            : k.env_var === envInfo?.env_var || k.provider === envInfo?.catalog,
        ) : [];
        setExistingKeys(relevant);
      })
      .catch(() => setExistingKeys([]))
      .finally(() => setExistingKeysLoading(false));
    setApiKeyModal(true);
  };

  const saveApiKey = async () => {
    if (!modalGateway) return;
    const envInfo = PROVIDER_ENV_MAP[modalGateway.key];
    if (!envInfo) return;
    setApiKeySaving(true);
    setApiKeyError(null);
    try {
      if (selectedExistingKeyId) {
        await xragApi.activateApiKey(selectedExistingKeyId);
        const found = existingKeys.find((k) => k.id === selectedExistingKeyId);
        setApiKeyMasked((prev) => ({ ...prev, [modalGateway.key]: found?.label ?? 'Existing key activated' }));
      } else if (envInfo.fields) {
        const toSave = envInfo.fields.filter((f) => apiKeyFields[f.env_var]?.trim());
        if (toSave.length === 0) return;
        const baseName = apiKeyName.trim() || modalGateway.label;
        await Promise.all(toSave.map((f) => xragApi.upsertApiKey({
          label: `${baseName} — ${f.label}`, provider: envInfo.catalog, env_var: f.env_var,
          key: apiKeyFields[f.env_var].trim(), is_active: true,
        })));
        setApiKeyMasked((prev) => ({ ...prev, [modalGateway.key]: `${toSave.length} credential${toSave.length !== 1 ? 's' : ''} saved` }));
      } else {
        if (!apiKeyValue.trim()) return;
        await xragApi.upsertApiKey({
          label: apiKeyName.trim() || `${modalGateway.label} key`,
          provider: envInfo.catalog, env_var: envInfo.env_var, key: apiKeyValue.trim(), is_active: true,
        });
        const v = apiKeyValue.trim();
        setApiKeyMasked((prev) => ({ ...prev, [modalGateway.key]: v.length <= 8 ? '•'.repeat(v.length) : `${v.slice(0, 4)}…${v.slice(-4)}` }));
      }
      setApiKeyModal(false);
    } catch (err) {
      setApiKeyError(err?.message || 'Failed to save credentials');
    } finally {
      setApiKeySaving(false);
    }
  };

  const applyPreset = (presetId) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange?.('preset', preset.id);
    onChange?.('metadata', { ...metadata, ...preset.overrides });
  };

  // �� Catalogue + filtering ����������������������������������������������
  const catalogue = models || FALLBACK_MODELS;

  // Merge custom models in front of the catalogue. Hide unsupported ids,
  // but never hide the currently selected model (otherwise the picker
  // would silently contradict the saved config).
  const list = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of customModels) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ ...m, __custom: true });
    }
    for (const m of catalogue) {
      if (!m?.id || seen.has(m.id)) continue;
      if (unsupportedSet.has(m.id) && m.id !== modelId) continue;
      seen.add(m.id);
      out.push(m);
    }
    if (modelId && !seen.has(modelId)) {
      out.unshift({ id: modelId, name: modelId, __custom: true, downloads: 0, likes: 0 });
    }
    return out;
  }, [catalogue, customModels, unsupportedSet, modelId]);

  const selectedModel = list.find((m) => m.id === modelId);

  const providers = useMemo(() => {
    const counts = new Map();
    for (const m of list) {
      const provider = String(m.id || '').split('/')[0] || 'unknown';
      counts.set(provider, (counts.get(provider) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count }));
  }, [list]);

  const filteredList = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    const filtered = list.filter((model) => {
      const provider = String(model.id || '').split('/')[0];
      if (providerFilter !== 'all' && provider !== providerFilter) return false;
      if (!needle) return true;
      const haystack = `${model.id || ''} ${model.name || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
    const sorted = filtered.slice();
    if (sortBy === 'downloads') {
      sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else if (sortBy === 'likes') {
      sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => {
        const ta = Date.parse(a.last_modified || '') || 0;
        const tb = Date.parse(b.last_modified || '') || 0;
        return tb - ta;
      });
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    }
    return sorted;
  }, [list, providerFilter, debouncedSearch, sortBy]);

  // Reset scroll when the filter narrows the list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [providerFilter, debouncedSearch, sortBy]);

  const totalHeight = filteredList.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredList.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleSlice = filteredList.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  // Stop-sequences --------------------------------------------------------
  const stopSeqs = Array.isArray(metadata.stop_sequences) ? metadata.stop_sequences : [];
  const addStopSeq = () => {
    const v = stopInput.trim();
    if (!v || stopSeqs.includes(v) || stopSeqs.length >= 4) return;
    setMeta('stop_sequences', [...stopSeqs, v]);
    setStopInput('');
  };
  const removeStopSeq = (s) =>
    setMeta('stop_sequences', stopSeqs.filter((x) => x !== s));

  const payload = useMemo(() => buildLlmPayload(value), [value]);
  const provider = String(modelId).split('/')[0] || 'unknown';
  const displayName = selectedModel?.name || stripProvider(modelId);
  const activeGateway = GATEWAY_PROVIDERS.find((g) => g.key === gatewayKey) ?? null;
  const isHfGateway = activeGateway?.isHfBrowser === true;
  const modalGateway = (modalGatewayKey ? GATEWAY_PROVIDERS.find((p) => p.key === modalGatewayKey) : activeGateway) ?? activeGateway;

  // Validation ------------------------------------------------------------
  const warnings = [];
  if (!hasQuerySource) {
    warnings.push('No query source connected → connect Question / Query Rewriter / Reranker.');
  }
  if (!modelId || String(modelId).trim() === '') {
    warnings.push('No model selected — choose a model from the provider list above.');
  }
  {
    const envInfo = PROVIDER_ENV_MAP[gatewayKey];
    // envInfo === undefined: gateway not in map (backend_proxy handled server-side, no key needed)
    // envInfo === null: local provider, never needs a key
    const requiresKey = envInfo !== undefined && envInfo !== null;
    if (requiresKey && !apiKeyMasked[gatewayKey]) {
      warnings.push(`No API key set for ${activeGateway?.label ?? gatewayKey} — click the key icon above to add one.`);
    }
  }
  if (metadata.response_format === 'json_object' && metadata.streaming) {
    warnings.push('JSON object output works best with streaming disabled.');
  }
  if ((metadata.max_tokens ?? 0) > 4096 && metadata.response_format === 'json_object') {
    warnings.push('Very large JSON outputs are often invalid → consider lowering max_tokens.');
  }

  // ��� Sleeping state (no query upstream) ��������������������������������
  if (!hasQuerySource) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-amber-600/60 bg-amber-900/15 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0d1117] shadow-sm ring-1 ring-amber-700/60">
              <Lock size={18} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                LLM � idle
              </p>
              <p className="text-xs font-semibold text-slate-200">
                Connect a query source to wake this node.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[11px] text-slate-400">
            <Search size={12} />
            <span className="font-bold">Query (text)</span>
            <span className="ml-auto font-mono text-[10px] text-amber-600">missing</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-300">
            Generation without a query is meaningless. Recommended pipeline:{' '}
            <span className="font-mono font-bold">Reranker � LLM</span>, optional System
            Prompt attached.
          </p>
        </div>
      </div>
    );
  }

  // ��� Awake state �������������������������������������������������������
  return (
    <div className="space-y-3">
      {/* ─── Provider / Model ─────────────────────────────────────────────── */}
      <section className="space-y-2.5 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="mb-1 flex items-center gap-1.5">
          <Cloud size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Provider / Model</h4>
        </header>
        <div className="relative" ref={gatewayMenuRef}>
          {/* Trigger button */}
          <button
            type="button"
            onClick={() => setGatewayOpen((o) => !o)}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
              gatewayKey
                ? 'border-amber-600/60 bg-amber-900/20'
                : 'border-slate-700/50 bg-[#161b22] hover:border-amber-700/40'
            }`}
          >
            {activeGateway ? (
              <>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0d1117] ring-1 ring-slate-700/50">
                  {hasProviderLogo(activeGateway.logo)
                    ? <span style={{ filter: 'brightness(0) invert(1)', opacity: 0.85 }}>{getProviderLogo(activeGateway.logo, 15)}</span>
                    : <span className="text-[8px] font-black text-slate-300">{activeGateway.initials}</span>}
                </span>
                <span className="flex-1 text-xs font-bold text-amber-200">{activeGateway.label}</span>
              </>
            ) : (
              <>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0d1117] ring-1 ring-slate-700/50">
                  <Cloud size={12} className="text-slate-500" />
                </span>
                <span className="flex-1 text-xs font-semibold text-slate-500">Choose provider…</span>
              </>
            )}
            <ChevronDown
              size={13}
              className={`shrink-0 text-slate-400 transition-transform duration-150 ${
                gatewayOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown list */}
          {gatewayOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-slate-700/50 bg-[#161b22] shadow-xl">
              {GATEWAY_PROVIDERS.map((gp) => {
                const active = gatewayKey === gp.key;
                return (
                  <button
                    key={gp.key}
                    type="button"
                    onClick={() => { selectGateway(gp.key); setGatewayOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition first:rounded-t-xl last:rounded-b-xl ${
                      active
                        ? 'bg-amber-900/30 text-amber-200'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0d1117] ring-1 ring-slate-700/50">
                      {hasProviderLogo(gp.logo)
                        ? <span style={{ filter: 'brightness(0) invert(1)', opacity: 0.85 }}>{getProviderLogo(gp.logo, 15)}</span>
                        : <span className="text-[8px] font-black text-slate-300">{gp.initials}</span>}
                    </span>
                    <span className="flex-1 text-xs font-semibold">{gp.label}</span>
                    {active && <Check size={11} className="shrink-0 text-amber-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {gatewayKey && PROVIDER_ENV_MAP[gatewayKey] !== undefined && PROVIDER_ENV_MAP[gatewayKey] !== null && (
          <button
            type="button"
            onClick={() => openApiKeyModal()}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                          apiKeyMasked[gatewayKey]
                            ? 'border-emerald-700/40 bg-emerald-900/15 hover:border-emerald-600/50'
                            : 'border-amber-700/40 bg-amber-900/10 hover:border-amber-600/50'
                        }`}
          >
            <Lock size={13} className={apiKeyMasked[gatewayKey] ? 'text-emerald-400' : 'text-amber-500'} />
            <span className={`flex-1 font-mono text-xs ${apiKeyMasked[gatewayKey] ? 'text-emerald-300' : 'text-slate-400'}`}>
              {apiKeyMasked[gatewayKey] ?? 'Click to set API key\u2026'}
            </span>
            {apiKeyMasked[gatewayKey]
              ? <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
              : <AlertTriangle size={12} className="shrink-0 text-amber-500" />}
          </button>
        )}
        {gatewayKey && !isHfGateway && (() => {
          const mList = activeGateway?.models ?? [];
          const mInList = mList.some((m) => m.id === modelId);
          const customActive = mainCustomOpen || !mInList;
          return (
            <>
              {mList.length > 0 ? (
                <>
                  <select
                    value={customActive ? '__custom__' : modelId}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') { setMainCustomOpen(true); }
                      else { setMeta('model_id', e.target.value); setCustomId(''); setMainCustomOpen(false); }
                    }}
                    className="w-full rounded-lg border border-slate-700/50 bg-[#161b22] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-600/60"
                  >
                    {mList.map((m) => (
                      <option key={m.id} value={m.id}>{m.label ?? m.id}</option>
                    ))}
                    <option value="__custom__">Custom model ID...</option>
                  </select>
                  {customActive && (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={customId}
                        onChange={(e) => { setCustomId(e.target.value); if (customError) setCustomError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (customId.trim()) { setMeta('model_id', customId.trim()); setCustomId(''); setMainCustomOpen(false); } } }}
                        placeholder={`${activeGateway.key}/model-name`}
                        className="min-w-0 flex-1 rounded-lg border border-amber-700/40 bg-[#161b22] px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-amber-600/60"
                      />
                      <button
                        type="button"
                        onClick={() => { if (customId.trim()) { setMeta('model_id', customId.trim()); setCustomId(''); setMainCustomOpen(false); } }}
                        disabled={!customId.trim()}
                        className="shrink-0 rounded-lg bg-amber-900/40 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-800/50 disabled:opacity-40"
                      >
                        Use
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customId}
                    onChange={(e) => { setCustomId(e.target.value); if (customError) setCustomError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (customId.trim()) { setMeta('model_id', customId.trim()); setCustomId(''); } } }}
                    placeholder={activeGateway?.defaultModel ?? `${activeGateway?.key ?? 'provider'}/model-name`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-[#161b22] px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-amber-600/60"
                  />
                  <button
                    type="button"
                    onClick={() => { if (customId.trim()) { setMeta('model_id', customId.trim()); setCustomId(''); } }}
                    disabled={!customId.trim()}
                    className="shrink-0 rounded-lg bg-amber-900/40 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-800/50 disabled:opacity-40"
                  >
                    Use
                  </button>
                </div>
              )}
              {customError && <p className="text-[10px] text-red-400">{customError}</p>}
            </>
          );
        })()}
      </section>

      {/* ─── Fallback model ─────────────────────────────────────────────────── */}
      {gatewayKey && !isHfGateway && (() => {
        const fbGateway = GATEWAY_PROVIDERS.find((p) => p.key === fallbackGwKey) ?? null;
        const fbModelList = fbGateway?.models ?? [];
        const fbModelId = metadata.fallback_model_id || '';
        const fbInList = fbModelList.some((m) => m.id === fbModelId);
        const fbCustomActive = fallbackCustomOpen || (fallbackGwKey && !fbInList && fbModelList.length > 0);
        const showFallback = fallbackOpen || Boolean(fbModelId);
        const fbEnvInfo = fallbackGwKey ? PROVIDER_ENV_MAP[fallbackGwKey] : undefined;
        const fbNeedsKey = fbEnvInfo !== undefined && fbEnvInfo !== null;
        if (!showFallback) {
          return (
            <button
              type="button"
              onClick={() => { setFallbackOpen(true); setFallbackGwKey(gatewayKey); }}
              className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-slate-700/40 px-3 py-2 text-left text-[11px] font-semibold text-slate-500 transition hover:border-amber-700/40 hover:text-amber-400"
            >
              <ShieldCheck size={11} className="shrink-0" />
              + Add fallback model
              <span className="ml-auto text-[9px] font-normal normal-case text-slate-600">Auto-retry on 429 / 5xx</span>
            </button>
          );
        }
        return (
          <section className="space-y-2.5 rounded-2xl border border-amber-700/30 bg-[#0d1117] p-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-amber-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Fallback model</span>
              <span className="ml-auto text-[9px] text-slate-500">Auto-retry on 429 / 5xx</span>
              <button
                type="button"
                onClick={() => { setFallbackOpen(false); setFallbackGwKey(null); setFallbackModelCustom(''); setFallbackCustomOpen(false); setMeta('fallback_model_id', null); }}
                className="shrink-0 rounded-md p-0.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <X size={12} />
              </button>
            </div>
            <select
              value={fallbackGwKey ?? ''}
              onChange={(e) => { setFallbackGwKey(e.target.value || null); setFallbackModelCustom(''); setFallbackCustomOpen(false); setMeta('fallback_model_id', null); }}
              className="w-full rounded-lg border border-slate-700/50 bg-[#161b22] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-600/60"
            >
              <option value="">-- Choose provider --</option>
              {GATEWAY_PROVIDERS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            {fallbackGwKey && fbNeedsKey && (
              <button
                type="button"
                onClick={() => openApiKeyModal(fallbackGwKey)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                                  apiKeyMasked[fallbackGwKey]
                                    ? 'border-emerald-700/40 bg-emerald-900/15 hover:border-emerald-600/50'
                                    : 'border-amber-700/40 bg-amber-900/10 hover:border-amber-600/50'
                                }`}
              >
                <Lock size={13} className={apiKeyMasked[fallbackGwKey] ? 'text-emerald-400' : 'text-amber-500'} />
                <span className={`flex-1 font-mono text-xs ${apiKeyMasked[fallbackGwKey] ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {apiKeyMasked[fallbackGwKey] ?? 'Click to set API key\u2026'}
                </span>
                {apiKeyMasked[fallbackGwKey]
                  ? <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
                  : <AlertTriangle size={12} className="shrink-0 text-amber-500" />}
              </button>
            )}
            {fallbackGwKey && (() => {
              return (
                <>
                  {fbModelList.length > 0 ? (
                    <>
                      <select
                        value={fbCustomActive ? '__custom__' : (fbModelId || '')}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') { setFallbackCustomOpen(true); }
                          else if (e.target.value && e.target.value !== modelId) { setMeta('fallback_model_id', e.target.value); setFallbackModelCustom(''); setFallbackCustomOpen(false); }
                        }}
                        className="w-full rounded-lg border border-slate-700/50 bg-[#161b22] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-600/60"
                      >
                        <option value="">-- Select model --</option>
                        {fbModelList.filter((m) => m.id !== modelId).map((m) => (
                          <option key={m.id} value={m.id}>{m.label ?? m.id}</option>
                        ))}
                        <option value="__custom__">Custom model ID...</option>
                      </select>
                      {fbCustomActive && (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={fallbackModelCustom}
                            onChange={(e) => setFallbackModelCustom(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = fallbackModelCustom.trim(); if (v && v !== modelId) { setMeta('fallback_model_id', v); setFallbackModelCustom(''); setFallbackCustomOpen(false); } } }}
                            placeholder={`${fallbackGwKey}/model-name`}
                            className="min-w-0 flex-1 rounded-lg border border-amber-700/40 bg-[#161b22] px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-amber-600/60"
                          />
                          <button
                            type="button"
                            onClick={() => { const v = fallbackModelCustom.trim(); if (v && v !== modelId) { setMeta('fallback_model_id', v); setFallbackModelCustom(''); setFallbackCustomOpen(false); } }}
                            disabled={!fallbackModelCustom.trim() || fallbackModelCustom.trim() === modelId}
                            className="shrink-0 rounded-lg bg-amber-900/40 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-800/50 disabled:opacity-40"
                          >
                            Use
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={fallbackModelCustom}
                        onChange={(e) => setFallbackModelCustom(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = fallbackModelCustom.trim(); if (v && v !== modelId) { setMeta('fallback_model_id', v); setFallbackModelCustom(''); } } }}
                        placeholder={fbGateway?.defaultModel ?? `${fallbackGwKey}/model-name`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-[#161b22] px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-amber-600/60"
                      />
                      <button
                        type="button"
                        onClick={() => { const v = fallbackModelCustom.trim(); if (v && v !== modelId) { setMeta('fallback_model_id', v); setFallbackModelCustom(''); } }}
                        disabled={!fallbackModelCustom.trim() || fallbackModelCustom.trim() === modelId}
                        className="shrink-0 rounded-lg bg-amber-900/40 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-800/50 disabled:opacity-40"
                      >
                        Use
                      </button>
                    </div>
                  )}
                  {fallbackModelCustom.trim() === modelId && (
                    <p className="text-[10px] text-red-400">Fallback cannot be the same as the primary model.</p>
                  )}
                </>
              );
            })()}
            {fbModelId && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/30 bg-slate-800/30 px-2.5 py-1.5">
                <ShieldCheck size={10} className="shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-300">{fbModelId}</span>
                <button type="button" onClick={() => { setMeta('fallback_model_id', null); setFallbackModelCustom(''); setFallbackCustomOpen(false); }} className="shrink-0 text-slate-500 transition hover:text-slate-200">
                  <X size={10} />
                </button>
              </div>
            )}
          </section>
        );
      })()}

      {/* �� Quick presets ������������������������������������������������� */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <header className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Quick presets
          </p>
          {!LLM_PRESETS.some((p) => p.id === value.preset) && (
            <span className="rounded-full border border-amber-700/40 bg-[#0d1117] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
              custom
            </span>
          )}
        </header>
        <div className="grid grid-cols-2 gap-1.5">
          {LLM_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = value.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`group flex flex-col gap-1 rounded-xl border bg-[#0d1117] p-2 text-left transition ${
                  active
                    ? 'border-amber-600/60 ring-2 ring-amber-600/60'
                    : 'border-slate-700/50 hover:border-amber-700/40'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      active
                        ? 'bg-amber-900/40 text-amber-300'
                        : 'bg-slate-800/60 text-slate-400 group-hover:bg-amber-900/20 group-hover:text-amber-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span className={`text-[11px] font-bold ${active ? 'text-amber-300' : 'text-slate-200'}`}>
                    {preset.label}
                  </span>
                </div>
                <span className="text-[9.5px] leading-snug text-slate-400">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── HuggingFace model browser (only when HF provider selected) ──── */}
      {isHfGateway && (
      <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3 shadow-sm">
        {/* HF Top-1000 banner */}
        <div className="relative overflow-hidden rounded-xl border border-amber-700/40 bg-amber-900/20 px-3 py-2">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-amber-300/40 to-yellow-300/30 blur-xl" />
          <div className="relative flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 text-white shadow-md ring-1 ring-amber-300/60">
              <Flame size={14} className="drop-shadow-sm" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-300">
                  Top {HF_MODEL_LIMIT}
                </span>
                <span className="rounded-full bg-slate-900/60 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-700/60">
                  Trending
                </span>
              </div>
              <div className="truncate text-[10px] font-semibold text-slate-200">
                Most popular models on Hugging Face
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 ring-1 ring-emerald-700/60">
              <Cloud size={10} />
              proxy
            </span>
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain size={12} className="text-amber-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Model
            </h4>
            <span className="rounded-full bg-amber-900/40 px-1.5 py-px text-[9px] font-bold text-amber-400">
              {filteredList.length}/{list.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700/50 bg-[#0d1117] px-2 py-0.5 text-[10px] font-semibold text-slate-300 transition hover:border-amber-600/60 hover:bg-amber-900/20 hover:text-amber-400 disabled:opacity-50"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadError && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-700/40 bg-amber-900/20 px-2 py-1 text-[10px] font-semibold text-amber-300">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            {loadError}
          </p>
        )}

        {/* Toolbar: search + sort */}
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name or id�"
              className="w-full rounded-lg border border-slate-700/50 bg-[#0d1117] py-1.5 pl-7 pr-7 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-600/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div ref={sortMenuRef} className="relative shrink-0">
            {(() => {
              const active = SORT_OPTIONS.find((o) => o.key === sortBy) || SORT_OPTIONS[0];
              const accent = SORT_ACCENTS[active.accent];
              const ActiveIcon = active.Icon;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => setSortOpen((open) => !open)}
                    title={`Sort: ${active.label}`}
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                    className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition ${accent.ring} hover:shadow`}
                  >
                    <ActiveIcon
                      size={12}
                      className={active.accent === 'rose' ? 'fill-rose-500 text-rose-500' : ''}
                    />
                    <span>{active.short}</span>
                    <ChevronDown
                      size={12}
                      className={`transition ${sortOpen ? 'rotate-180' : ''} opacity-70 group-hover:opacity-100`}
                    />
                  </button>
                  {sortOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-700/50 bg-[#0d1117]/95 shadow-xl ring-1 ring-black/5 backdrop-blur"
                    >
                      <div className="border-b border-slate-100 bg-slate-800/40/80 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Sort
                      </div>
                      <ul className="py-1">
                        {SORT_OPTIONS.map((opt) => {
                          const isActive = opt.key === sortBy;
                          const optAccent = SORT_ACCENTS[opt.accent];
                          const OptIcon = opt.Icon;
                          return (
                            <li key={opt.key}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                                  isActive ? `${optAccent.ring} font-semibold` : 'text-slate-200 hover:bg-slate-800/50'
                                }`}
                              >
                                <span
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${
                                    isActive ? optAccent.dot + ' text-white' : 'bg-slate-800/60 ' + optAccent.soft
                                  }`}
                                >
                                  <OptIcon
                                    size={11}
                                    className={
                                      opt.accent === 'rose' && isActive
                                        ? 'fill-white text-white'
                                        : opt.accent === 'rose'
                                          ? 'fill-rose-500 text-rose-500'
                                          : ''
                                    }
                                  />
                                </span>
                                <span className="flex-1">{opt.label}</span>
                                {isActive && <Check size={12} className={optAccent.soft} />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Provider dropdown */}
        {(() => {
          const isAll = providerFilter === 'all';
          const activeStyle = isAll ? null : providerStyle(providerFilter);
          const activeCount = isAll
            ? list.length
            : providers.find((p) => p.id === providerFilter)?.count ?? 0;
          const needle = providerSearch.trim().toLowerCase();
          const visibleProviders = needle
            ? providers.filter((p) => p.id.toLowerCase().includes(needle))
            : providers;
          return (
            <div ref={providerMenuRef} className="relative">
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Provider
              </label>
              <button
                type="button"
                onClick={() => setProviderOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={providerOpen}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-bold shadow-sm transition ${
                  isAll
                    ? 'border-slate-700/50 bg-[#0d1117] text-slate-200 hover:border-amber-600/60'
                    : `${activeStyle.solid} hover:brightness-110`
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    isAll ? 'bg-amber-900/40 text-amber-300' : 'bg-[#0d1117]/25 text-white'
                  }`}
                >
                  {isAll ? <span className="text-[9px] font-black">?</span> : <Check size={11} />}
                </span>
                <span className="flex-1 truncate">
                  {isAll ? 'All providers' : providerLabel(providerFilter)}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${
                    isAll ? 'bg-slate-800/60 text-slate-300' : 'bg-[#0d1117]/25 text-white'
                  }`}
                >
                  {activeCount}
                </span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition ${providerOpen ? 'rotate-180' : ''} ${
                    isAll ? 'text-slate-400' : 'text-white/80'
                  }`}
                />
              </button>

              {providerOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-slate-700/50 bg-[#0d1117] shadow-xl"
                >
                  <div className="relative border-b border-slate-100 bg-slate-800/40 px-2 py-1.5">
                    <Search
                      size={11}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="search"
                      value={providerSearch}
                      onChange={(event) => setProviderSearch(event.target.value)}
                      autoFocus
                      placeholder={`Search providers (${providers.length})�`}
                      className="w-full rounded-md border border-slate-700/50 bg-[#0d1117] py-1 pl-6 pr-2 text-[11px] outline-none focus:border-amber-600/60 focus:ring-1 focus:ring-amber-600/60"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isAll}
                      onClick={() => { setProviderFilter('all'); setProviderOpen(false); setProviderSearch(''); }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                        isAll ? 'bg-amber-900/20 text-amber-900' : 'text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-900/40 text-[9px] font-black text-amber-400">?</span>
                      <span className="flex-1 font-bold">All providers</span>
                      <span className="font-mono text-[9px] text-slate-400">{list.length}</span>
                      {isAll && <Check size={12} className="text-amber-600" />}
                    </button>
                    <div className="my-1 h-px bg-slate-800/60" />
                    {visibleProviders.length === 0 && (
                      <p className="px-3 py-3 text-center text-[11px] text-slate-400">
                        No such provider.
                      </p>
                    )}
                    {visibleProviders.map((p) => {
                      const style = providerStyle(p.id);
                      const active = providerFilter === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => { setProviderFilter(p.id); setProviderOpen(false); setProviderSearch(''); }}
                          className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                            active ? 'bg-amber-900/20 text-amber-900' : 'text-slate-200 hover:bg-slate-800/50'
                          }`}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                          <span className="flex-1 truncate">
                            <span className="font-bold">{providerLabel(p.id)}</span>
                            {providerLabel(p.id) !== p.id && (
                              <span className="ml-1.5 font-mono text-[9px] text-slate-400">
                                {p.id}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400">{p.count}</span>
                          {active && <Check size={12} className="text-amber-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Virtualised model list */}
        {filteredList.length === 0 ? (
          <div className="rounded-lg border border-slate-700/50 bg-[#0d1117] px-3 py-8 text-center text-[11px] text-slate-400">
            No results � narrow your search or pick another provider.
          </div>
        ) : (
          <div
            ref={listRef}
            role="listbox"
            aria-label="Available models"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="relative overflow-y-auto rounded-lg border border-slate-700/50 bg-[#0d1117]"
            style={{ height: VIEWPORT_HEIGHT }}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  transform: `translateY(${offsetY}px)`,
                  position: 'absolute',
                  left: 0,
                  right: 0,
                }}
              >
                {visibleSlice.map((model) => {
                  const prov = String(model.id || '').split('/')[0];
                  const style = providerStyle(prov);
                  const isActive = model.id === modelId;
                  const dl = formatCount(model.downloads);
                  const lk = formatCount(model.likes);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => setMeta('model_id', model.id)}
                      style={{ height: ROW_HEIGHT }}
                      className={`group flex w-full items-center gap-2 border-b border-slate-100 px-2 text-left transition ${
                        isActive
                          ? 'bg-amber-900/20 ring-1 ring-inset ring-amber-300'
                          : 'bg-[#0d1117] hover:bg-slate-800/50'
                      }`}
                    >
                      <span
                        className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full shadow-sm ${
                          hasProviderLogo(prov)
                            ? 'bg-[#0d1117] ring-1 ring-slate-200'
                            : `text-white ${style.dot}`
                        }`}
                        aria-hidden
                      >
                        {hasProviderLogo(prov) ? (
                          getProviderLogo(prov, 18)
                        ) : (
                          <span className="text-[9px] font-black">
                            {providerLabel(prov).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        {isActive && (
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-amber-600 text-white ring-2 ring-white">
                            <Check size={8} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-bold ${isActive ? 'text-amber-900' : 'text-slate-100'}`}>
                          {model.__custom && (
                            <Sparkles
                              size={10}
                              className="mr-1 inline-block -translate-y-px text-amber-500"
                            />
                          )}
                          {model.name || stripProvider(model.id)}
                        </p>
                        <p className="truncate font-mono text-[9px] text-slate-400">{model.id}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[9px] text-slate-400">
                        {dl && (
                          <span className="inline-flex items-center gap-0.5" title={`${model.downloads} downloads`}>
                            <Download size={9} />
                            {dl}
                          </span>
                        )}
                        {lk && (
                          <span className="inline-flex items-center gap-0.5 text-rose-500" title={`${model.likes} likes`}>
                            <Heart size={9} />
                            {lk}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selectedModel && !filteredList.find((m) => m.id === modelId) && (
          <div className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-amber-900/20 px-2 py-1.5 text-[10px] text-amber-300">
            <Check size={11} />
            <span>Active: <span className="font-mono font-bold">{modelId}</span></span>
            <span className="ml-auto text-[9px] opacity-70">(filtered out)</span>
          </div>
        )}

        {/* Custom HF model importer */}
        <div className="space-y-2 rounded-lg border border-dashed border-amber-700/40 bg-amber-900/10 p-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-amber-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-400">
              Import custom HF model
            </span>
          </div>
          <p className="text-[10px] leading-snug text-slate-300">
            Don't see your model?{' '}
            <a
              href="https://huggingface.co/models?pipeline_tag=text-generation&sort=trending"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-amber-400 underline decoration-amber-300 underline-offset-2 transition hover:text-amber-900 hover:decoration-amber-600"
            >
              Browse on Hugging Face
              <ExternalLink size={9} />
            </a>{' '}
            and paste any{' '}
            <span className="font-mono text-[9.5px] text-slate-200">org/model-name</span> below.
          </p>
          <div className="flex items-stretch gap-1.5">
            <input
              type="text"
              value={customId}
              onChange={(event) => {
                setCustomId(event.target.value);
                if (customError) setCustomError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); addCustomModel(); }
              }}
              placeholder="org/model-name (e.g. meta-llama/Llama-3.1-8B-Instruct)"
              className="min-w-0 flex-1 rounded-md border border-slate-700/50 bg-[#0d1117] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-600/60"
            />
            <button
              type="button"
              onClick={addCustomModel}
              disabled={customLoading || !customId.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-br from-amber-500 to-amber-600 px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:from-amber-600 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {customLoading ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
              Import
            </button>
          </div>
          {customError && (
            <p className="rounded-md border border-rose-700/40 bg-rose-900/20 px-2 py-0.5 text-[10px] font-medium text-rose-400">
              {customError}
            </p>
          )}
          {customModels.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {customModels.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-700/40 bg-slate-900/70 py-0.5 pl-1.5 pr-1 text-[10px] font-medium text-amber-300"
                  title={m.id}
                >
                  <Sparkles size={9} className="text-amber-500" />
                  <span className="max-w-[140px] truncate">{m.name || m.id}</span>
                  <button
                    type="button"
                    onClick={() => removeCustomModel(m.id)}
                    className="ml-0.5 rounded-full p-0.5 text-amber-400 hover:bg-amber-900/30 hover:text-amber-300"
                    aria-label={`Remove ${m.id}`}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Fallback model picker */}
        {(() => {
          const fallbackId = metadata.fallback_model_id || '';
          const fallbackOptions = list.filter((m) => m.id !== modelId);
          const customIds = new Set(customModels.map((m) => m.id));
          const customOpts = fallbackOptions.filter((m) => customIds.has(m.id));
          const hfOpts = fallbackOptions.filter((m) => !customIds.has(m.id));
          const fallbackMeta = list.find((m) => m.id === fallbackId);
          const fallbackUnknown = fallbackId && !fallbackMeta;
          return (
            <div className="space-y-1.5 rounded-lg border border-dashed border-amber-700/40 bg-amber-900/10 p-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-amber-600" />
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-400">
                  Fallback model
                </span>
                <span className="ml-auto text-[9.5px] font-medium text-slate-400">
                  Auto-retry on 429 / 5xx
                </span>
              </div>
              <p className="text-[10px] leading-snug text-slate-300">
                If the primary model returns a network error or rate-limit response, the
                gateway silently retries the prompt against this fallback model.
              </p>
              <select
                value={fallbackId}
                onChange={(event) => setMeta('fallback_model_id', event.target.value || null)}
                className="w-full rounded-md border border-slate-700/50 bg-[#0d1117] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-600/60"
              >
                <option value="">� No fallback (fail loud) �</option>
                {fallbackUnknown && (
                  <option value={fallbackId}>{fallbackId} (not in catalogue)</option>
                )}
                {customOpts.length > 0 && (
                  <optgroup label="Custom imports">
                    {customOpts.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {hfOpts.length > 0 && (
                  <optgroup label="Hugging Face � Top 1000">
                    {hfOpts.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {fallbackId ? (
                <p className="flex items-center gap-1 text-[10px] font-medium text-amber-300">
                  <ShieldCheck size={10} className="text-amber-600" />
                  Active fallback: <span className="font-mono font-bold">{fallbackId}</span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-400">
                  No fallback � execution halts if the primary model fails.
                </p>
              )}
            </div>
          );
        })()}
      </section>
      )}

      {/* �� Sampling ������������������������������������������������������ */}
      <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Flame size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Sampling
          </h4>
        </header>
        <SliderRow
          label="Temperature"
          help="Higher = more creative. 0 = deterministic."
          value={Number(metadata.temperature ?? 0.2)}
          min={0} max={2} step={0.05}
          onChange={(v) => setMeta('temperature', v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Top-p (nucleus)"
          help="Sample from the smallest set whose total probability is <= p."
          value={Number(metadata.top_p ?? 1.0)}
          min={0} max={1} step={0.05}
          onChange={(v) => setMeta('top_p', v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Max tokens"
          help="Hard cap on completion length."
          value={Number(metadata.max_tokens ?? 1024)}
          min={64} max={8192} step={64}
          onChange={(v) => setMeta('max_tokens', v)}
          format={(v) => `${v}`}
        />
      </section>

      {/* �� Output format ������������������������������������������������� */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Sparkles size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Output format
          </h4>
        </header>
        <div>
          <FieldLabel
            title="Response format"
            help="Hint passed to the LLM (e.g. JSON object enforcement)."
          />
          {(() => {
            const selectedFormat = metadata.response_format || 'text';
            const selectedOption = RESPONSE_FORMATS.find((option) => option.value === selectedFormat);
            return (
              <>
                <div className="relative">
                  <Sparkles
                    size={12}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500/80"
                  />
                  <select
                    value={selectedFormat}
                    onChange={(event) => setMeta('response_format', event.target.value)}
                    className={`${selectClass} pl-7`}
                  >
                    {RESPONSE_FORMATS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">
                  {selectedOption?.hint || 'Format hint passed to the model.'}
                </p>
              </>
            );
          })()}
        </div>
        {/* Streaming row */}
        <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-900/30 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Streaming
            </span>
            <span
              title="Tokens arrive progressively (SSE). The UI renders each token as it is generated instead of waiting for the full response. Disable for strict JSON output or when the downstream step needs the complete text before continuing."
              className="cursor-help text-slate-500 hover:text-amber-400"
            >
              <CircleHelp size={10} />
            </span>
            {metadata.streaming !== false && (
              <span className="rounded-full border border-emerald-700/40 bg-emerald-900/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                on
              </span>
            )}
          </div>
          <button
            type="button"
            aria-pressed={metadata.streaming !== false}
            onClick={() => setMeta('streaming', !(metadata.streaming !== false))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none ${
              metadata.streaming !== false
                ? 'border-amber-600/60 bg-amber-500'
                : 'border-slate-600 bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                metadata.streaming !== false ? 'translate-x-4' : 'translate-x-0.5'
              }`}
              style={{ marginTop: 1 }}
            />
          </button>
        </div>
      </section>

      {/* Memory ───────────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <BrainCircuit size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Memory
          </h4>
        </header>
        <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-900/30 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Enable memory
            </span>
            {metadata.enable_memory && (
              <span className="rounded-full border border-emerald-700/40 bg-emerald-900/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                on
              </span>
            )}
          </div>
          <button
            type="button"
            aria-pressed={Boolean(metadata.enable_memory)}
            onClick={() => setMeta('enable_memory', !metadata.enable_memory)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none ${
              metadata.enable_memory
                ? 'border-amber-600/60 bg-amber-500'
                : 'border-slate-600 bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                metadata.enable_memory ? 'translate-x-4' : 'translate-x-0.5'
              }`}
              style={{ marginTop: 1 }}
            />
          </button>
        </div>
        {metadata.enable_memory && (
          <div>
            <FieldLabel title="Memory type" help="How the node stores and recalls past context." />
            <div className="relative">
              <BrainCircuit
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500/80"
              />
              <select
                value={metadata.memory_type || 'buffer'}
                onChange={(e) => setMeta('memory_type', e.target.value)}
                className={`${selectClass} pl-7`}
              >
                <option value="buffer">Buffer — last N messages</option>
                <option value="summary">Summary — condensed history</option>
                <option value="vector">Vector — semantic retrieval</option>
                <option value="kg">Knowledge graph — entity links</option>
              </select>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">
              {(!metadata.memory_type || metadata.memory_type === 'buffer') &&
                'Keeps the most recent messages in the context window.'}
              {metadata.memory_type === 'summary' &&
                'Progressively summarises older turns to save tokens.'}
              {metadata.memory_type === 'vector' &&
                'Embeds past turns and retrieves semantically relevant ones.'}
              {metadata.memory_type === 'kg' &&
                'Extracts entities and relationships into a knowledge graph.'}
            </p>
          </div>
        )}
      </section>

      {/* �� Advanced (collapsible) ���������������������������������������� */}
      <section className="rounded-2xl border border-slate-700/50 bg-[#0d1117] overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((s) => !s)}
          className="flex w-full items-center justify-between p-3 text-left transition hover:bg-slate-800/30"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sliders size={12} className="text-amber-500" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Advanced
              </h4>
              {advancedOpen && (
                <span className="rounded-full border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                  expanded
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Fine-tune penalties, stop sequences, and overflow behavior.
            </p>
          </div>
          <ChevronDown
            size={14}
            className={`text-slate-400 transition ${advancedOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {advancedOpen && (
          <div className="space-y-3 border-t border-slate-700/50 bg-slate-900/20 p-3">
            <div className="space-y-3 rounded-xl border border-slate-700/40 bg-[#0d1117] p-2.5">
              <SliderRow
                label="Frequency penalty"
                help="Penalises repeated tokens (-2 .. 2)."
                value={Number(metadata.frequency_penalty ?? 0)}
                min={-2} max={2} step={0.1}
                onChange={(v) => setMeta('frequency_penalty', v)}
                format={(v) => v.toFixed(1)}
              />
              <SliderRow
                label="Presence penalty"
                help="Penalises tokens already in the text (-2 .. 2)."
                value={Number(metadata.presence_penalty ?? 0)}
                min={-2} max={2} step={0.1}
                onChange={(v) => setMeta('presence_penalty', v)}
                format={(v) => v.toFixed(1)}
              />
            </div>

            <div className="grid gap-3 @[360px]:grid-cols-2">
              <div>
                <FieldLabel title="Seed" help="Integer for reproducibility, blank = random." />
                <input
                  type="number"
                  value={metadata.seed ?? ''}
                  placeholder="random"
                  onChange={(event) => {
                    const raw = event.target.value;
                    setMeta('seed', raw === '' ? null : Number(raw));
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel title="Context overflow strategy" />
                <select
                  value={metadata.context_overflow_strategy || 'strict'}
                  onChange={(event) => setMeta('context_overflow_strategy', event.target.value)}
                  className={selectClass}
                >
                  {OVERFLOW_STRATEGIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <FieldLabel title="Stop sequences (max 4)" help="Stop generation when one is emitted." />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={stopInput}
                  placeholder='e.g. "\nUser:"'
                  onChange={(event) => setStopInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); addStopSeq(); }
                  }}
                  className={`${inputClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={addStopSeq}
                  disabled={!stopInput.trim() || stopSeqs.length >= 4}
                  className="rounded-lg border border-amber-600/60 bg-amber-900/20 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 transition hover:bg-amber-800/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {stopSeqs.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {stopSeqs.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 font-mono text-[10px] text-amber-300"
                    >
                      {JSON.stringify(s)}
                      <button
                        type="button"
                        onClick={() => removeStopSeq(s)}
                        className="text-amber-500 hover:text-amber-400"
                        aria-label={`Remove ${s}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* �� Validation strip ���������������������������������������������� */}
      {warnings.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-700/40 bg-amber-900/15 p-2.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Configuration issues
            </p>
          </div>
          <ul className="space-y-1">
            {warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-[#0d1117]/70 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-200"
              >
                <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-500" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-700/40 bg-gradient-to-r from-emerald-900/30 to-emerald-800/10 p-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-900/40 ring-1 ring-emerald-700/40">
              <CheckCircle2 size={12} className="text-emerald-400" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Configuration valid</p>
              <p className="text-[10.5px] font-medium text-emerald-200/90">All checks passed, ready to generate.</p>
            </div>
          </div>
        </div>
      )}

      {/* �� Output payload preview ���������������������������������������� */}
      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-400">chat_completion</span> — Response / Chat
      </div>

      {/* ─── API Key Modal ────────────────────────────────────────────────── */}
      {apiKeyModal && modalGateway && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 2147483647, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setApiKeyModal(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-[#0d1117] shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b border-slate-700/50 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-slate-300/30">
                {hasProviderLogo(modalGateway.logo)
                  ? getProviderLogo(modalGateway.logo, 18)
                  : <span className="text-[10px] font-black text-slate-600">{modalGateway.initials}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-100">{modalGateway.label}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  {PROVIDER_ENV_MAP[modalGateway.key]?.fields
                    ? `${PROVIDER_ENV_MAP[modalGateway.key].fields.length} credentials`
                    : PROVIDER_ENV_MAP[modalGateway.key]?.env_var}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApiKeyModal(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal body */}
            {(() => {
              const envInfo = PROVIDER_ENV_MAP[modalGateway.key];
              const isMultiField = Boolean(envInfo?.fields);
              return (
                <div className="space-y-3 px-4 py-4">

                  {/* ─── Existing key picker ───────────────────────────────────────── */}
                  {(existingKeysLoading || existingKeys.length > 0) && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Existing key
                      </label>
                      {existingKeysLoading ? (
                        <p className="text-[10px] text-slate-500">Loading saved keys…</p>
                      ) : (
                        <select
                          value={selectedExistingKeyId}
                          onChange={(e) => setSelectedExistingKeyId(e.target.value)}
                          className="w-full rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-1 focus:ring-emerald-600/30"
                        >
                          <option value="">+ Enter new key…</option>
                          {existingKeys.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.label ?? k.env_var}{k.is_active ? ' ✓' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* ─── New key form (hidden when existing key selected) ────────── */}
                  {!selectedExistingKeyId && (
                    <>
                  {/* Credential label (shared) */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {isMultiField ? 'Credential name' : 'Label'}{' '}
                      <span className="normal-case text-slate-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder={`${modalGateway.label}${isMultiField ? ' credentials' : ' key'}`}
                      className="w-full rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-1 focus:ring-amber-600/30"
                    />
                  </div>

                  {isMultiField ? (
                    /* ── Multi-field form (AWS Bedrock etc.) ─────────────────── */
                    envInfo.fields.map((field) => (
                      <div key={field.env_var} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {field.label}
                            {field.required && <span className="ml-0.5 text-red-400"> *</span>}
                          </label>
                          <span className="font-mono text-[9px] text-slate-600">{field.env_var}</span>
                        </div>
                        <div className="flex gap-1.5">
                          {Array.isArray(field.options) && field.options.length > 0 ? (
                            <div className="relative min-w-0 flex-1">
                              <select
                                value={apiKeyFields[field.env_var] ?? ''}
                                onChange={(e) => setApiKeyFields((prev) => ({ ...prev, [field.env_var]: e.target.value }))}
                                className="min-w-0 flex-1 w-full appearance-none rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 pr-8 font-mono text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-1 focus:ring-amber-600/30"
                              >
                                <option value="">{field.placeholder}</option>
                                {field.options.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                              <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                          ) : (
                            <input
                              type={field.secret && !apiKeyShowFields[field.env_var] ? 'password' : 'text'}
                              value={apiKeyFields[field.env_var] ?? ''}
                              onChange={(e) => setApiKeyFields((prev) => ({ ...prev, [field.env_var]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(); }}
                              placeholder={field.placeholder}
                              className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 font-mono text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-1 focus:ring-amber-600/30"
                            />
                          )}
                          {field.secret && (
                            <button
                              type="button"
                              onClick={() => setApiKeyShowFields((prev) => ({ ...prev, [field.env_var]: !prev[field.env_var] }))}
                              className="shrink-0 rounded-xl border border-slate-700/50 bg-[#161b22] px-2.5 text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition"
                            >
                              {apiKeyShowFields[field.env_var] ? 'Hide' : 'Show'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    /* ── Single-field form ──────────────────────────────────── */
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        API Key <span className="text-red-400">*</span>
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type={apiKeyShowValue ? 'text' : 'password'}
                          value={apiKeyValue}
                          onChange={(e) => setApiKeyValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(); }}
                          placeholder="sk-…"
                          className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 font-mono text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-1 focus:ring-amber-600/30"
                        />
                        <button
                          type="button"
                          onClick={() => setApiKeyShowValue((v) => !v)}
                          className="shrink-0 rounded-xl border border-slate-700/50 bg-[#161b22] px-2.5 text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition"
                        >
                          {apiKeyShowValue ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Server-side hint */}
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/30 bg-slate-800/40 px-2.5 py-1.5">
                    <ShieldCheck size={11} className="shrink-0 text-slate-500" />
                    <span className="text-[10px] text-slate-400">
                      {isMultiField
                        ? 'Saved server-side as environment variables — never sent to the browser.'
                        : <>Saved server-side as <span className="font-mono font-bold text-slate-300">{envInfo?.env_var}</span> — never sent to the browser.</>}
                    </span>
                  </div>
                  </>
                  )}

                  {apiKeyError && (
                    <p className="flex items-center gap-1.5 text-[10.5px] text-red-400">
                      <AlertTriangle size={11} className="shrink-0" />
                      {apiKeyError}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-700/50 px-4 py-3">
              <button
                type="button"
                onClick={() => setApiKeyModal(false)}
                className="rounded-xl border border-slate-700/50 px-4 py-1.5 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveApiKey}
                disabled={(() => {
                  const envInfo = PROVIDER_ENV_MAP[modalGateway?.key];
                  if (!envInfo || apiKeySaving) return true;
                  if (selectedExistingKeyId) return false;
                  if (envInfo.fields) {
                    return envInfo.fields.some((f) => f.required && !apiKeyFields[f.env_var]?.trim());
                  }
                  return !apiKeyValue.trim();
                })()}
                className="rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow transition hover:from-amber-600 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {apiKeySaving ? 'Saving…' : selectedExistingKeyId ? 'Use this key' : 'Save & Activate'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ��� Small atoms used by the panel ���������������������������������������
function UpstreamPill({ label, ok, hint, Icon }) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-[10px] ${
        ok
          ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
          : 'border-slate-700/50 bg-[#0d1117] text-slate-400'
      }`}
    >
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 font-mono text-[9px]">{hint}</p>
    </div>
  );
}

function SliderRow({ label, help, value, min, max, step, onChange, format }) {
  const pct = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </span>
          {help && (
            <span title={help} className="cursor-help text-slate-500 hover:text-amber-400">
              <CircleHelp size={10} />
            </span>
          )}
        </div>
        <span className="min-w-[44px] rounded-md bg-slate-800 px-2 py-0.5 text-center font-mono text-[11px] font-bold text-amber-400 ring-1 ring-slate-700/60">
          {format(value)}
        </span>
      </div>
      {/* custom track */}
      <div className="relative h-5 w-full">
        {/* gray track */}
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-700/70">
          {/* amber fill */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
        </div>
        {/* custom thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 bg-slate-900 shadow shadow-black/60"
          style={{ left: `${pct}%` }}
        />
        {/* invisible native input for interaction */}
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-600">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
