import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type {
  AIModelInfo,
  AIProviderConfig,
  FreeFallbackOption,
  ModelCategory,
  ProviderStatus,
} from '../src/types/nexora.ts';
import type { AIInvokeInput, AIInvokeOutput, AIProviderAdapter } from './contracts.ts';
import { DATA_DIR, ensureDatabaseDirs, writeJsonAtomic } from './database.ts';

interface StoredProviderState {
  id: string;
  name?: string;
  baseUrl?: string;
  authType?: 'none' | 'bearer' | 'local';
  apiKey?: string;
  customModels?: AIModelInfo[];
  lastStatus?: ProviderStatus;
  lastMessage?: string;
  lastCheckedAt?: string | null;
  lastLatencyMs?: number | null;
}

const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');

function readStoredState(): Record<string, StoredProviderState> {
  ensureDatabaseDirs();
  if (!fs.existsSync(PROVIDERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStoredState(data: Record<string, StoredProviderState>) {
  writeJsonAtomic(PROVIDERS_FILE, data);
}

interface BuiltinProviderTemplate {
  id: string;
  name: string;
  baseUrl: string;
  authType: 'none' | 'env-managed' | 'bearer' | 'local';
  requiresKey: boolean;
  freeTierSummary: string;
  quotaNote: string;
  models: Omit<AIModelInfo, 'available' | 'unavailableReason'>[];
}

const BUILTIN_PROVIDERS: BuiltinProviderTemplate[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (Free Tier)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authType: 'env-managed',
    requiresKey: false,
    freeTierSummary: 'Free AI Studio Tier',
    quotaNote: 'Free-tier RPM & RPD quotas apply via GEMINI_API_KEY runtime secret.',
    models: [
      {
        id: 'gemini-4-hydrogen',
        providerId: 'gemini',
        name: 'Gemini 4 Hydrogen',
        contextWindow: '1M',
        categories: ['coding', 'general', 'reasoning', 'game-dev', 'writing'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Tier (Studio Runtime)',
        usageLimitations: 'Google AI Studio free-tier rate & daily token limits apply.',
      },
      {
        id: 'gemini-3.1-flash-lite',
        providerId: 'gemini',
        name: 'Gemini 3.1 Flash Lite',
        contextWindow: '1M',
        categories: ['general', 'writing', 'coding'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Tier (Studio Runtime)',
        usageLimitations: 'Lightweight free-tier quotas; fast response budget.',
      },
    ],
  },
  {
    id: 'pollinations',
    name: 'Pollinations Open AI',
    baseUrl: 'https://text.pollinations.ai',
    authType: 'none',
    requiresKey: false,
    freeTierSummary: 'Keyless Free Hosted Open Models',
    quotaNote: 'Anonymous open-source endpoint; shared community rate limits apply.',
    models: [
      {
        id: 'openai-fast',
        providerId: 'pollinations',
        name: 'GPT-OSS 20B (Open Reasoning)',
        contextWindow: '64K',
        categories: ['coding', 'general', 'reasoning', 'game-dev', 'writing'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Anonymous Open Endpoint',
        usageLimitations: 'No API key required; subject to shared community queue throttling.',
      },
      {
        id: 'pollinations-flux',
        providerId: 'pollinations',
        name: 'Flux Open Image Generator',
        contextWindow: 'Prompt',
        categories: ['image-gen'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Anonymous Image Endpoint',
        usageLimitations: 'Rate-limited public image synthesis; no SLA.',
      },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (:free Tier)',
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
    requiresKey: true,
    freeTierSummary: 'Zero-Cost :free Community Models Only',
    quotaNote: 'Free OpenRouter account key required; only :free zero-price models enabled.',
    models: [
      {
        id: 'qwen/qwen-2.5-coder-32b-instruct:free',
        providerId: 'openrouter',
        name: 'Qwen 2.5 Coder 32B (:free)',
        contextWindow: '32K',
        categories: ['coding', 'game-dev'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Tier (:free)',
        usageLimitations: 'Requires free OpenRouter key; daily free request cap applies.',
      },
      {
        id: 'deepseek/deepseek-r1:free',
        providerId: 'openrouter',
        name: 'DeepSeek R1 (:free)',
        contextWindow: '64K',
        categories: ['reasoning', 'coding'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Tier (:free)',
        usageLimitations: 'Requires free OpenRouter key; rate-limited free pool.',
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        providerId: 'openrouter',
        name: 'Llama 3.3 70B Instruct (:free)',
        contextWindow: '128K',
        categories: ['general', 'writing', 'game-dev'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Tier (:free)',
        usageLimitations: 'Requires free OpenRouter key; shared free-tier throughput.',
      },
    ],
  },
  {
    id: 'groq',
    name: 'Groq (Free Developer Tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    authType: 'bearer',
    requiresKey: true,
    freeTierSummary: 'Free Developer Tier (Rate-Limited)',
    quotaNote: 'Free Groq developer key required; strict RPM/TPM/TPD limits.',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        providerId: 'groq',
        name: 'Llama 3.3 70B Versatile',
        contextWindow: '128K',
        categories: ['general', 'writing', 'coding', 'game-dev'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Developer Tier',
        usageLimitations: 'Groq free-tier RPM/TPM daily quotas apply.',
      },
      {
        id: 'qwen-qwq-32b',
        providerId: 'groq',
        name: 'Qwen QwQ 32B Reasoning',
        contextWindow: '128K',
        categories: ['reasoning', 'coding'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free Developer Tier',
        usageLimitations: 'Groq free-tier RPM/TPM daily quotas apply.',
      },
    ],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face (Free Inference)',
    baseUrl: 'https://router.huggingface.co/v1',
    authType: 'bearer',
    requiresKey: true,
    freeTierSummary: 'Free Serverless Inference Tier',
    quotaNote: 'Free Hugging Face token required; monthly free inference credits/quotas apply.',
    models: [
      {
        id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        providerId: 'huggingface',
        name: 'Qwen 2.5 Coder 32B Instruct',
        contextWindow: '32K',
        categories: ['coding', 'game-dev'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free HF Inference Tier',
        usageLimitations: 'Subject to Hugging Face free serverless rate limits.',
      },
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct',
        providerId: 'huggingface',
        name: 'Llama 3.3 70B Instruct',
        contextWindow: '128K',
        categories: ['general', 'writing'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free HF Inference Tier',
        usageLimitations: 'Subject to Hugging Face free serverless rate limits.',
      },
      {
        id: 'black-forest-labs/FLUX.1-schnell',
        providerId: 'huggingface',
        name: 'FLUX.1 Schnell (Open Image)',
        contextWindow: 'Prompt',
        categories: ['image-gen'],
        freeAccessConfirmed: true,
        freeAccessLabel: 'Free HF Image Inference',
        usageLimitations: 'Free HF token required; shared GPU queue limits apply.',
      },
    ],
  },
  {
    id: 'ollama',
    name: 'Local Ollama (100% Free Local)',
    baseUrl: 'http://127.0.0.1:11434',
    authType: 'local',
    requiresKey: false,
    freeTierSummary: 'Local Hardware Inference (Zero Cloud Cost)',
    quotaNote: 'Unlimited local inference when Ollama daemon is running on port 11434.',
    models: [
      {
        id: 'ollama:qwen2.5-coder:7b',
        providerId: 'ollama',
        name: 'Qwen 2.5 Coder 7B (Local)',
        contextWindow: '32K',
        categories: ['coding', 'game-dev'],
        freeAccessConfirmed: true,
        freeAccessLabel: '100% Free Local',
        usageLimitations: 'Requires local Ollama server running at http://127.0.0.1:11434.',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    requiresKey: true,
    freeTierSummary: 'Requires User API Key (Usage-Billed)',
    quotaNote: 'Not a free tier; requires your own OpenAI API key and billing credits. Excluded from auto free routing.',
    models: [
      {
        id: 'gpt-4o-mini',
        providerId: 'openai',
        name: 'GPT-4o Mini',
        contextWindow: '128K',
        categories: ['coding', 'general', 'writing'],
        freeAccessConfirmed: false,
        freeAccessLabel: 'Requires Own API Key (Paid)',
        usageLimitations: 'Requires user-supplied OpenAI key; billed per token by OpenAI.',
      },
      {
        id: 'gpt-4o',
        providerId: 'openai',
        name: 'GPT-4o',
        contextWindow: '128K',
        categories: ['coding', 'reasoning', 'game-dev'],
        freeAccessConfirmed: false,
        freeAccessLabel: 'Requires Own API Key (Paid)',
        usageLimitations: 'Requires user-supplied OpenAI key; billed per token by OpenAI.',
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    authType: 'bearer',
    requiresKey: true,
    freeTierSummary: 'Requires User API Key (Usage-Billed)',
    quotaNote: 'Not a free tier; requires your own Anthropic API key and credits. Excluded from auto free routing.',
    models: [
      {
        id: 'claude-3-5-haiku-latest',
        providerId: 'anthropic',
        name: 'Claude 3.5 Haiku',
        contextWindow: '200K',
        categories: ['coding', 'general', 'writing'],
        freeAccessConfirmed: false,
        freeAccessLabel: 'Requires Own API Key (Paid)',
        usageLimitations: 'Requires user-supplied Anthropic key; billed per token by Anthropic.',
      },
      {
        id: 'claude-sonnet-4-20250514',
        providerId: 'anthropic',
        name: 'Claude Sonnet 4',
        contextWindow: '200K',
        categories: ['coding', 'reasoning', 'game-dev'],
        freeAccessConfirmed: false,
        freeAccessLabel: 'Requires Own API Key (Paid)',
        usageLimitations: 'Requires user-supplied Anthropic key; billed per token by Anthropic.',
      },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Direct API',
    baseUrl: 'https://api.deepseek.com/v1',
    authType: 'bearer',
    requiresKey: true,
    freeTierSummary: 'Requires User API Key (Usage-Billed)',
    quotaNote: 'Direct DeepSeek API requires your own funded key (use OpenRouter DeepSeek R1 :free for zero-cost access).',
    models: [
      {
        id: 'deepseek-chat',
        providerId: 'deepseek',
        name: 'DeepSeek V3 Chat',
        contextWindow: '64K',
        categories: ['coding', 'general', 'game-dev'],
        freeAccessConfirmed: false,
        freeAccessLabel: 'Requires Own API Key (Paid)',
        usageLimitations: 'Requires user-supplied DeepSeek API key; excluded from auto free routing.',
      },
      {
        id: 'deepseek-reasoner',
        providerId: 'deepseek',
        name: 'DeepSeek R1 Reasoner',
        contextWindow: '64K',
        categories: ['reasoning', 'coding'],
        freeAccessConfirmed: false,
        freeAccessLabel: 'Requires Own API Key (Paid)',
        usageLimitations: 'Requires user-supplied DeepSeek API key; excluded from auto free routing.',
      },
    ],
  },
];

let dynamicOllamaModels: Omit<AIModelInfo, 'available' | 'unavailableReason'>[] = [];
let initialProbePromise: Promise<void> | null = null;

function getEnvApiKey(providerId: string): string | undefined {
  switch (providerId) {
    case 'gemini':
      return process.env.GEMINI_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'huggingface':
      return process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY;
    default:
      return undefined;
  }
}

export function resolveProviderApiKey(providerId: string): string | undefined {
  if (providerId === 'gemini') return process.env.GEMINI_API_KEY;
  if (providerId === 'pollinations' || providerId === 'ollama') return 'no-key-required';
  const stored = readStoredState()[providerId];
  return stored?.apiKey || getEnvApiKey(providerId);
}

export function listProviders(): AIProviderConfig[] {
  const stored = readStoredState();

  const result: AIProviderConfig[] = BUILTIN_PROVIDERS.map((bp) => {
    const s = stored[bp.id];
    const key = resolveProviderApiKey(bp.id);
    const hasKey = !bp.requiresKey || Boolean(key && key.trim().length > 0);

    let status: ProviderStatus;
    if (bp.id === 'ollama') {
      status = s?.lastStatus || 'unreachable';
    } else if (bp.id === 'pollinations') {
      status = s?.lastStatus || 'unreachable';
    } else if (bp.id === 'gemini') {
      status = hasKey ? s?.lastStatus || 'unconfigured' : 'unconfigured';
    } else {
      // Key-required providers remain unconfigured until key is saved AND connection is verified
      status = hasKey ? s?.lastStatus || 'unconfigured' : 'unconfigured';
    }

    const availableNow = status === 'connected';
    const unavailableReason =
      status === 'unconfigured'
        ? hasKey
          ? 'Connection not yet verified (run Test Connection)'
          : 'API key not configured'
        : status === 'auth_error'
        ? 'Authentication failed'
        : status === 'rate_limited'
        ? 'Free-tier quota reached'
        : status === 'unreachable'
        ? s?.lastMessage || 'Endpoint unreachable'
        : undefined;

    const baseModels =
      bp.id === 'ollama' && dynamicOllamaModels.length > 0 ? dynamicOllamaModels : bp.models;

    const customModels = (s?.customModels || []).map((m) => ({
      ...m,
      available: availableNow,
      unavailableReason,
    }));

    return {
      id: bp.id,
      name: bp.name,
      baseUrl: bp.baseUrl,
      authType: bp.authType,
      isBuiltIn: true,
      requiresKey: bp.requiresKey,
      hasKey,
      status,
      statusMessage:
        s?.lastMessage ||
        (bp.id === 'pollinations'
          ? 'Run Check Availability to verify Pollinations reachability.'
          : bp.id === 'ollama'
          ? 'Local daemon not detected on 127.0.0.1:11434.'
          : hasKey
          ? 'Credentials detected on server. Run Test Connection to verify.'
          : 'API key required to activate.'),
      freeTierSummary: bp.freeTierSummary,
      quotaNote: bp.quotaNote,
      lastCheckedAt: s?.lastCheckedAt ?? null,
      latencyMs: s?.lastLatencyMs ?? null,
      models: [
        ...baseModels.map((m) => ({
          ...m,
          available: availableNow,
          unavailableReason,
        })),
        ...customModels,
      ],
    };
  });

  // Add user-configured custom free/local providers
  for (const [id, entry] of Object.entries(stored)) {
    if (BUILTIN_PROVIDERS.some((b) => b.id === id)) continue;
    if (!entry.name || !entry.baseUrl) continue;
    const hasKey =
      Boolean(entry.apiKey && entry.apiKey.trim().length > 0) ||
      entry.authType === 'none' ||
      entry.authType === 'local';
    const status: ProviderStatus = entry.lastStatus || 'unconfigured';
    const availableNow = status === 'connected';

    result.push({
      id,
      name: entry.name,
      baseUrl: entry.baseUrl,
      authType: entry.authType || 'bearer',
      isBuiltIn: false,
      requiresKey: entry.authType !== 'none' && entry.authType !== 'local',
      hasKey,
      status,
      statusMessage: entry.lastMessage || 'Run Test Connection to verify availability.',
      freeTierSummary: 'Custom Free / Local Endpoint',
      quotaNote: 'User-configured endpoint.',
      lastCheckedAt: entry.lastCheckedAt ?? null,
      latencyMs: entry.lastLatencyMs ?? null,
      models: (entry.customModels || []).map((m) => ({
        ...m,
        available: availableNow,
        unavailableReason: availableNow ? undefined : entry.lastMessage || 'Not verified',
      })),
    });
  }

  return result;
}

export async function testProviderConnection(providerId: string): Promise<AIProviderConfig> {
  const providers = listProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" not found.`);
  }

  const stored = readStoredState();
  const now = new Date().toISOString();
  const start = Date.now();
  let status: ProviderStatus = 'unreachable';
  let message = 'Availability check failed.';

  try {
    if (providerId === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        status = 'unconfigured';
        message = 'GEMINI_API_KEY runtime secret is not configured.';
      } else {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const resp = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: 'Reply with OK',
        });
        if (resp.text) {
          status = 'connected';
          message = 'Verified Google Gemini free-tier reachability.';
        } else {
          status = 'unreachable';
          message = 'Empty response from Gemini API.';
        }
      }
    } else if (providerId === 'pollinations') {
      const res = await fetch('https://text.pollinations.ai/models', {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        status = 'connected';
        message = 'Pollinations anonymous free endpoint reachable (HTTP 200).';
      } else if (res.status === 429) {
        status = 'rate_limited';
        message = 'Pollinations anonymous tier is currently rate-limited (HTTP 429).';
      } else {
        status = 'unreachable';
        message = `Pollinations returned HTTP ${res.status}.`;
      }
    } else if (providerId === 'ollama') {
      const res = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const json = (await res.json()) as { models?: Array<{ name: string }> };
        const tags = json.models || [];
        if (tags.length > 0) {
          dynamicOllamaModels = tags.map((t) => ({
            id: `ollama:${t.name}`,
            providerId: 'ollama',
            name: `${t.name} (Local)`,
            contextWindow: 'Local',
            categories: ['coding', 'general', 'reasoning', 'game-dev', 'writing'],
            freeAccessConfirmed: true,
            freeAccessLabel: '100% Free Local',
            usageLimitations: 'Runs locally on host hardware via Ollama.',
          }));
        }
        status = 'connected';
        message = `Ollama running locally (${tags.length} model(s) loaded).`;
      } else {
        status = 'unreachable';
        message = `Local Ollama returned HTTP ${res.status}.`;
      }
    } else {
      const apiKey = resolveProviderApiKey(providerId);
      if (!apiKey && provider.requiresKey) {
        status = 'unconfigured';
        message = 'API key not configured.';
      } else if (providerId === 'huggingface') {
        const res = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          status = 'connected';
          message = 'Hugging Face free inference token verified.';
        } else if (res.status === 401 || res.status === 403) {
          status = 'auth_error';
          message = `Hugging Face rejected token (HTTP ${res.status}).`;
        } else if (res.status === 429) {
          status = 'rate_limited';
          message = 'Hugging Face free-tier rate limit reached (HTTP 429).';
        } else {
          status = 'unreachable';
          message = `Hugging Face returned HTTP ${res.status}.`;
        }
      } else if (providerId === 'anthropic') {
        const res = await fetch(`${provider.baseUrl}/models`, {
          headers: {
            'x-api-key': apiKey || '',
            'anthropic-version': '2023-06-01',
          },
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          status = 'connected';
          message = 'Anthropic Claude API key verified (HTTP 200).';
        } else if (res.status === 401 || res.status === 403) {
          status = 'auth_error';
          message = `Authentication failed (HTTP ${res.status}).`;
        } else if (res.status === 429) {
          status = 'rate_limited';
          message = 'Anthropic rate limit active (HTTP 429).';
        } else {
          status = 'unreachable';
          message = `Anthropic returned HTTP ${res.status}.`;
        }
      } else {
        const res = await fetch(`${provider.baseUrl}/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          status = 'connected';
          message = `${provider.name} endpoint verified (HTTP 200).`;
        } else if (res.status === 401 || res.status === 403) {
          status = 'auth_error';
          message = `Authentication failed (HTTP ${res.status}).`;
        } else if (res.status === 429) {
          status = 'rate_limited';
          message = `${provider.name} rate limit active (HTTP 429).`;
        } else {
          status = 'unreachable';
          message = `${provider.name} returned HTTP ${res.status}.`;
        }
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('401') || errMsg.includes('403')) {
      status = 'auth_error';
    } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      status = 'rate_limited';
    } else {
      status = 'unreachable';
    }
    message =
      providerId === 'ollama'
        ? 'No local Ollama daemon detected on http://127.0.0.1:11434.'
        : errMsg;
  }

  const latencyMs = Date.now() - start;
  stored[providerId] = {
    ...(stored[providerId] || { id: providerId }),
    lastStatus: status,
    lastMessage: message,
    lastCheckedAt: now,
    lastLatencyMs: latencyMs,
  };
  writeStoredState(stored);
  return listProviders().find((p) => p.id === providerId)!;
}

export async function refreshAllProvidersAvailability(): Promise<AIProviderConfig[]> {
  await Promise.all([
    testProviderConnection('pollinations').catch(() => null),
    testProviderConnection('ollama').catch(() => null),
    ...(process.env.GEMINI_API_KEY ? [testProviderConnection('gemini').catch(() => null)] : []),
  ]);
  return listProviders();
}

export function triggerStartupProbe(): Promise<void> {
  if (!initialProbePromise) {
    initialProbePromise = refreshAllProvidersAvailability().then(() => undefined);
  }
  return initialProbePromise;
}

export async function ensureInitialProbe(timeoutMs = 2500): Promise<void> {
  const probe = triggerStartupProbe();
  await Promise.race([
    probe,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function configureProviderKey(providerId: string, apiKey: string) {
  if (providerId === 'gemini') {
    throw new Error('Google Gemini uses the managed GEMINI_API_KEY runtime secret.');
  }
  if (providerId === 'pollinations' || providerId === 'ollama') {
    throw new Error(`${providerId} does not require an API key.`);
  }
  const stored = readStoredState();
  const existing = stored[providerId] || { id: providerId };
  const cleanKey = apiKey.trim();
  stored[providerId] = {
    ...existing,
    apiKey: cleanKey,
    // Never mark connected until testProviderConnection verifies reachability
    lastStatus: 'unconfigured',
    lastMessage: cleanKey
      ? 'API key saved on server. Run Test Connection to confirm availability.'
      : 'API key cleared.',
  };
  writeStoredState(stored);
}

export function addCustomFreeProvider(input: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  modelName: string;
  category: ModelCategory;
  freeAccessConfirmed: boolean;
}) {
  if (!input.freeAccessConfirmed) {
    throw new Error(
      'Only verified free-access or local endpoints can be added to the Free Model Hub.'
    );
  }
  const cleanName = input.name.trim();
  const cleanUrl = input.baseUrl.trim().replace(/\/+$/, '');
  if (!cleanName || !cleanUrl.startsWith('http')) {
    throw new Error('Provider name and valid http(s):// base URL are required.');
  }
  const isLocal = cleanUrl.includes('127.0.0.1') || cleanUrl.includes('localhost');
  const id = `custom-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const stored = readStoredState();
  stored[id] = {
    id,
    name: cleanName,
    baseUrl: cleanUrl,
    authType: input.apiKey?.trim() ? 'bearer' : isLocal ? 'local' : 'none',
    apiKey: input.apiKey?.trim() || '',
    customModels: [
      {
        id: input.modelId.trim(),
        providerId: id,
        name: input.modelName.trim() || input.modelId.trim(),
        contextWindow: '64K',
        categories: [input.category],
        freeAccessConfirmed: true,
        freeAccessLabel: isLocal ? 'Free Local Endpoint' : 'User-Confirmed Free Tier',
        usageLimitations: 'Subject to provider rate limits or local hardware.',
        available: false,
      },
    ],
    lastStatus: 'unconfigured',
    lastMessage: 'Added custom endpoint. Click Test Connection to verify availability.',
  };
  writeStoredState(stored);
  return id;
}

export function addFreeModelToProvider(input: {
  providerId: string;
  modelId: string;
  modelName: string;
  contextWindow?: string;
  category: ModelCategory;
  freeAccessConfirmed: boolean;
}) {
  if (!input.freeAccessConfirmed) {
    throw new Error(
      'Confirm that this model offers free-tier or open-source access before adding.'
    );
  }
  const cleanModelId = input.modelId.trim();
  if (!cleanModelId) throw new Error('Model ID is required.');
  if (input.providerId === 'openrouter' && !cleanModelId.endsWith(':free')) {
    throw new Error('OpenRouter models in Nexora Studio must use the zero-cost ":free" suffix.');
  }
  const providers = listProviders();
  const target = providers.find((p) => p.id === input.providerId);
  if (!target) throw new Error(`Unknown provider: ${input.providerId}`);
  if (target.models.some((m) => m.id === cleanModelId)) {
    throw new Error(`Model "${cleanModelId}" is already registered.`);
  }

  const stored = readStoredState();
  const existing = stored[input.providerId] || { id: input.providerId };
  const newModel: AIModelInfo = {
    id: cleanModelId,
    providerId: input.providerId,
    name: input.modelName.trim() || cleanModelId,
    contextWindow: input.contextWindow?.trim() || '64K',
    categories: [input.category],
    freeAccessConfirmed: true,
    freeAccessLabel: target.freeTierSummary,
    usageLimitations: target.quotaNote,
    available: target.status === 'connected',
  };
  stored[input.providerId] = {
    ...existing,
    customModels: [...(existing.customModels || []), newModel],
  };
  writeStoredState(stored);
  return newModel;
}

export function getFreeFallbackSuggestions(
  category: ModelCategory,
  excludeModelId?: string
): FreeFallbackOption[] {
  const providers = listProviders();
  const suggestions: FreeFallbackOption[] = [];

  for (const p of providers) {
    if (p.status !== 'connected') continue;
    for (const m of p.models) {
      if (!m.available || !m.freeAccessConfirmed) continue;
      if (m.id === excludeModelId) continue;
      if (m.categories.includes('image-gen') && category !== 'image-gen') continue;
      suggestions.push({
        modelId: m.id,
        modelName: m.name,
        providerId: p.id,
        providerName: p.name,
        freeAccessLabel: m.freeAccessLabel,
      });
    }
  }

  return suggestions.sort((a, b) => {
    const provA = providers.find((p) => p.id === a.providerId);
    const modA = provA?.models.find((m) => m.id === a.modelId);
    const provB = providers.find((p) => p.id === b.providerId);
    const modB = provB?.models.find((m) => m.id === b.modelId);
    const aMatch = modA?.categories.includes(category) ? 1 : 0;
    const bMatch = modB?.categories.includes(category) ? 1 : 0;
    return bMatch - aMatch;
  });
}

export function routeFreeModel(
  category: ModelCategory,
  preferredModelId?: string
): {
  model: AIModelInfo;
  provider: AIProviderConfig;
  reason: string;
} {
  const providers = listProviders();

  // Manual model selection: check real availability (never silently switch to paid)
  if (preferredModelId) {
    for (const p of providers) {
      const found = p.models.find((m) => m.id === preferredModelId);
      if (found) {
        if (!found.available || p.status !== 'connected') {
          throw new Error(
            `Selected model "${found.name}" (${p.name}) is currently unavailable: ${
              found.unavailableReason || p.statusMessage
            }.`
          );
        }
        return {
          model: found,
          provider: p,
          reason: `Using selected model: ${p.name} · ${found.name}.`,
        };
      }
    }
  }

  // Automatic routing strictly picks ONLY verified free-access & connected providers
  const candidates: Array<{ model: AIModelInfo; provider: AIProviderConfig; score: number }> = [];
  for (const p of providers) {
    if (p.status !== 'connected') continue;
    for (const m of p.models) {
      if (!m.available || !m.freeAccessConfirmed) continue;
      if (m.categories.includes('image-gen') && category !== 'image-gen') continue;
      let score = m.categories.includes(category) ? 10 : 3;
      if (p.id === 'gemini') score += 4;
      if (p.id === 'pollinations') score += 2;
      candidates.push({ model: m, provider: p, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length === 0) {
    throw new Error(
      'No verified free AI provider is currently connected. Open AI Models to test or configure a connection.'
    );
  }

  const winner = candidates[0];
  return {
    model: winner.model,
    provider: winner.provider,
    reason: `Auto-selected free model for ${category}: ${winner.provider.name} · ${winner.model.name}.`,
  };
}

/**
 * Non-throwing resolver used by instant workspace initialization so projects &
 * workspaces can always be created independently of AI provider readiness.
 */
export function tryResolveModelForWorkspace(
  category: ModelCategory,
  preferredModelId?: string
):
  | {
      available: true;
      model: AIModelInfo;
      provider: AIProviderConfig;
      reason: string;
    }
  | {
      available: false;
      requestedModelId: string;
      requestedProviderName: string;
      reason: string;
      fallbackSuggestions: FreeFallbackOption[];
    } {
  try {
    const routed = routeFreeModel(category, preferredModelId);
    return { available: true, ...routed };
  } catch (err) {
    const providers = listProviders();
    const matchedProvider = preferredModelId
      ? providers.find((p) => p.models.some((m) => m.id === preferredModelId))
      : undefined;
    return {
      available: false,
      requestedModelId: preferredModelId || 'unconfigured',
      requestedProviderName: matchedProvider?.name || 'No Connected Provider',
      reason: err instanceof Error ? err.message : String(err),
      fallbackSuggestions: getFreeFallbackSuggestions(category, preferredModelId),
    };
  }
}

export function markProviderRateLimited(providerId: string, reason: string) {
  const stored = readStoredState();
  stored[providerId] = {
    ...(stored[providerId] || { id: providerId }),
    lastStatus: 'rate_limited',
    lastMessage: reason,
    lastCheckedAt: new Date().toISOString(),
  };
  writeStoredState(stored);
}

export async function invokeFreeModelText(options: AIInvokeInput): Promise<AIInvokeOutput> {
  const providers = listProviders();
  const provider = providers.find((p) => p.models.some((m) => m.id === options.modelId));
  if (!provider) {
    throw new Error(`Model "${options.modelId}" is not registered in the AI Model Hub.`);
  }
  const model = provider.models.find((m) => m.id === options.modelId)!;
  if (provider.status !== 'connected') {
    throw new Error(`${provider.name} (${model.name}) is unavailable: ${provider.statusMessage}`);
  }

  try {
    if (provider.id === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured in Studio Secrets.');
      }
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: options.modelId,
            contents: options.prompt,
            config: {
              systemInstruction: options.systemInstruction,
              ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
            },
          });
          return {
            text: response.text ?? '',
            providerId: provider.id,
            modelId: options.modelId,
          };
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          if ((msg.includes('503') || msg.includes('UNAVAILABLE')) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    }

    if (provider.id === 'pollinations') {
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.modelId,
          messages: [
            { role: 'system', content: options.systemInstruction },
            { role: 'user', content: options.prompt },
          ],
          ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429) {
        markProviderRateLimited(
          provider.id,
          'Pollinations anonymous quota rate-limited (HTTP 429).'
        );
        throw new Error('Pollinations anonymous free tier is rate-limited (HTTP 429).');
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(json.error?.message || `Pollinations HTTP ${res.status}`);
      }
      return {
        text: json.choices?.[0]?.message?.content ?? '',
        providerId: provider.id,
        modelId: options.modelId,
      };
    }

    if (provider.id === 'ollama') {
      const cleanModel = options.modelId.replace(/^ollama:/, '');
      const res = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          stream: false,
          messages: [
            { role: 'system', content: options.systemInstruction },
            { role: 'user', content: options.prompt },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        throw new Error(`Local Ollama returned HTTP ${res.status}`);
      }
      const json = (await res.json()) as { message?: { content?: string } };
      return {
        text: json.message?.content ?? '',
        providerId: provider.id,
        modelId: options.modelId,
      };
    }

    if (provider.id === 'anthropic') {
      const apiKey = resolveProviderApiKey(provider.id);
      if (!apiKey) throw new Error('Anthropic API key is required.');
      const res = await fetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.modelId,
          max_tokens: 4096,
          system: options.systemInstruction,
          messages: [{ role: 'user', content: options.prompt }],
        }),
        signal: AbortSignal.timeout(60000),
      });
      const json = (await res.json()) as {
        content?: Array<{ text?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(json.error?.message || `Anthropic HTTP ${res.status}`);
      }
      return {
        text: json.content?.[0]?.text ?? '',
        providerId: provider.id,
        modelId: options.modelId,
      };
    }

    // OpenRouter (:free), Groq, Hugging Face, OpenAI, DeepSeek, Custom OpenAI-compatible
    const apiKey = resolveProviderApiKey(provider.id);
    if (!apiKey && provider.requiresKey) {
      throw new Error(`${provider.name} requires an API key.`);
    }
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.modelId,
        messages: [
          { role: 'system', content: options.systemInstruction },
          { role: 'user', content: options.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.status === 429) {
      markProviderRateLimited(provider.id, `${provider.name} quota exceeded (HTTP 429).`);
      throw new Error(`${provider.name} quota rate-limited (HTTP 429).`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json.error?.message || `${provider.name} HTTP ${res.status}`);
    }
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      providerId: provider.id,
      modelId: options.modelId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      markProviderRateLimited(provider.id, msg);
    }
    throw err;
  }
}

export const defaultAIProviderAdapter: AIProviderAdapter = {
  id: 'nexora-unified-hub',
  listRegisteredProviders: listProviders,
  testConnection: testProviderConnection,
  invokeText: invokeFreeModelText,
};
