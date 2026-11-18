import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cpu,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Server,
  WifiOff,
  X,
} from 'lucide-react';
import { AIProviderConfig, ModelCategory, ProviderStatus } from '../types/nexora';

interface ModelHubViewProps {
  providers: AIProviderConfig[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  smartRouting: boolean;
  onToggleSmartRouting: (next: boolean) => void;
  onSaveProviderKey: (providerId: string, apiKey: string) => Promise<void>;
  onTestProvider: (providerId: string) => Promise<void>;
  onRefreshAllAvailability: () => Promise<void>;
  onAddCustomProvider: (input: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    modelId: string;
    modelName: string;
    category: ModelCategory;
    freeAccessConfirmed: boolean;
  }) => Promise<void>;
  onAddModelToProvider: (input: {
    providerId: string;
    modelId: string;
    modelName: string;
    contextWindow?: string;
    category: ModelCategory;
    freeAccessConfirmed: boolean;
  }) => Promise<void>;
}

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  coding: 'Coding Models',
  general: 'General AI Models',
  reasoning: 'Reasoning Models',
  'game-dev': 'Game Development Models',
  writing: 'Writing Models',
  'image-gen': 'Image Generation Models',
};

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4cd7f6]">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Available</span>
      </span>
    );
  }
  if (status === 'rate_limited') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#d0bcff]">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Rate Limited</span>
      </span>
    );
  }
  if (status === 'auth_error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ffb4ab]">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Auth Error</span>
      </span>
    );
  }
  if (status === 'unreachable') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ffb4ab]">
        <WifiOff className="w-3.5 h-3.5" />
        <span>Unreachable</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#958ea0]">
      <AlertCircle className="w-3.5 h-3.5" />
      <span>Unconfigured</span>
    </span>
  );
}

export const ModelHubView: React.FC<ModelHubViewProps> = ({
  providers,
  selectedModelId,
  onSelectModel,
  smartRouting,
  onToggleSmartRouting,
  onSaveProviderKey,
  onTestProvider,
  onRefreshAllAvailability,
  onAddCustomProvider,
  onAddModelToProvider,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ModelCategory>('all');
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvName, setNewProvName] = useState('');
  const [newProvUrl, setNewProvUrl] = useState('http://127.0.0.1:11434/v1');
  const [newProvKey, setNewProvKey] = useState('');
  const [newProvModelId, setNewProvModelId] = useState('');
  const [newProvModelName, setNewProvModelName] = useState('');
  const [newProvCat, setNewProvCat] = useState<ModelCategory>('coding');
  const [newProvFree, setNewProvFree] = useState(true);

  const [addModelForProvider, setAddModelForProvider] = useState<string | null>(null);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelCtx, setNewModelCtx] = useState('64K');
  const [newModelCat, setNewModelCat] = useState<ModelCategory>('coding');
  const [newModelFree, setNewModelFree] = useState(true);

  const filteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return providers
      .filter((p) => {
        if (availabilityFilter === 'available' && p.status !== 'connected') return false;
        if (availabilityFilter === 'unavailable' && p.status === 'connected') return false;
        return true;
      })
      .map((p) => ({
        ...p,
        models: p.models.filter((m) => {
          const matchesQuery =
            !q ||
            p.name.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q);
          const matchesCat = categoryFilter === 'all' || m.categories.includes(categoryFilter);
          return matchesQuery && matchesCat;
        }),
      }))
      .filter((p) => p.models.length > 0 || (!q && categoryFilter === 'all'));
  }, [providers, searchQuery, availabilityFilter, categoryFilter]);

  const routingPreview = useMemo(() => {
    const connected = providers.filter((p) => p.status === 'connected');
    return (Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((cat) => {
      let picked: { providerName: string; modelName: string; modelId: string } | null = null;
      for (const p of connected) {
        const match = p.models.find((m) => m.available && m.categories.includes(cat));
        if (match) {
          picked = { providerName: p.name, modelName: match.name, modelId: match.id };
          break;
        }
      }
      return { cat, label: CATEGORY_LABELS[cat], picked };
    });
  }, [providers]);

  const handleTest = async (providerId: string) => {
    setTestingId(providerId);
    setFeedback(null);
    try {
      await onTestProvider(providerId);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingId(null);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      await onRefreshAllAvailability();
      setFeedback('Completed live availability checks across keyless, local, and runtime-managed free endpoints.');
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleSaveKey = async (providerId: string) => {
    setSavingId(providerId);
    setFeedback(null);
    try {
      await onSaveProviderKey(providerId, keyDrafts[providerId] || '');
      setKeyDrafts((prev) => ({ ...prev, [providerId]: '' }));
      setFeedback('Free-tier API key saved on server. Run Test Connection to verify reachability.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
              AI Model Hub
            </h1>
            <p className="mt-1 text-sm text-[#958ea0]">
              Modular provider hub supporting verified free-tier, anonymous open-source, local
              inference, and optional bring-your-own-key endpoints. Auto-routing uses free models
              only and never switches silently to paid APIs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={refreshingAll}
              className="btn-kinetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-[#4cd7f6] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingAll ? 'animate-spin' : ''}`} />
              <span>{refreshingAll ? 'Checking...' : 'Check Availability'}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleSmartRouting(!smartRouting)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                smartRouting
                  ? 'bg-[#06b6d4]/15 border-[#06b6d4]/50 text-[#4cd7f6]'
                  : 'bg-[#131318] border-white/[0.1] text-[#cbc3d7]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Auto-Select Free Model: {smartRouting ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddProvider(true)}
              className="btn-synthetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Free / Local Provider</span>
            </button>
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#131318]/90 border border-white/[0.06] rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/50'
                : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
            }`}
          >
            All Categories
          </button>
          {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/50'
                  : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Search & Availability Filter */}
        <div className="glass-layer-2 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#958ea0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search free models or providers..."
              aria-label="Search free models"
              className="w-full bg-[#0a0a0f]/85 border border-white/[0.08] focus:border-[#06b6d4] rounded-md pl-9 pr-3 py-2 text-xs text-[#e4e1e9] placeholder:text-[#958ea0] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'available', 'unavailable'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setAvailabilityFilter(st)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  availabilityFilter === st
                    ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/55'
                    : 'bg-[#0a0a0f]/60 text-[#958ea0] hover:text-[#e4e1e9] border border-white/[0.06]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {feedback && (
          <div className="rounded-lg border border-[#06b6d4]/40 bg-[#06b6d4]/10 px-4 py-2.5 text-xs text-[#4cd7f6] flex items-center justify-between">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Free Category Auto-Routing Preview */}
        <section className="glass-layer-2 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#e4e1e9]">
              Automatic Free Model Routing
            </h2>
            <span className="text-xs text-[#958ea0]">
              Routes strictly to available free-tier or local models
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {routingPreview.map((item) => (
              <div
                key={item.cat}
                className="rounded-xl bg-[#0a0a0f]/75 border border-white/[0.06] px-3.5 py-2.5 flex flex-col justify-between gap-1"
              >
                <span className="text-xs text-[#958ea0]">{item.label}</span>
                {item.picked ? (
                  <span className="font-mono text-xs text-[#e4e1e9] truncate">
                    {item.picked.providerName} · {item.picked.modelName}
                  </span>
                ) : (
                  <span className="text-xs text-[#ffb4ab]">No available free model in category</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Providers List */}
        <div className="space-y-4">
          {filteredProviders.map((provider) => {
            const isTesting = testingId === provider.id;
            const isSaving = savingId === provider.id;

            return (
              <article
                key={provider.id}
                className="glass-layer-2 rounded-2xl p-5 space-y-4 border border-white/[0.08]"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-display text-lg font-semibold text-[#e4e1e9]">
                        {provider.name}
                      </h3>
                      <StatusBadge status={provider.status} />
                      <span className="text-xs text-[#d0bcff] font-medium">
                        {provider.freeTierSummary}
                      </span>
                      {provider.latencyMs !== null && (
                        <span className="font-mono text-xs text-[#958ea0] tabular-nums">
                          {provider.latencyMs} ms
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#958ea0] font-mono">
                      {provider.baseUrl} · {provider.statusMessage}
                    </div>
                    <div className="text-xs text-[#cbc3d7]">
                      Quota &amp; Limits: {provider.quotaNote}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {provider.id === 'gemini' ? (
                      <span className="text-xs text-[#cbc3d7] px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                        Managed via Studio Secrets
                      </span>
                    ) : !provider.requiresKey ? (
                      <span className="text-xs text-[#4cd7f6] px-3 py-1.5 rounded-md bg-[#06b6d4]/10 border border-[#06b6d4]/30">
                        No Key Required
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <KeyRound className="w-3.5 h-3.5 text-[#958ea0] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="password"
                            value={keyDrafts[provider.id] ?? ''}
                            onChange={(e) =>
                              setKeyDrafts((prev) => ({
                                ...prev,
                                [provider.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              provider.hasKey ? 'Free key saved (replace)' : 'Optional free-tier key...'
                            }
                            aria-label={`${provider.name} free API key`}
                            className="bg-[#0a0a0f]/90 border border-white/[0.1] focus:border-[#06b6d4] rounded-md pl-8 pr-3 py-1.5 font-mono text-xs text-[#e4e1e9] placeholder:text-[#958ea0] w-48 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveKey(provider.id)}
                          disabled={isSaving || !(keyDrafts[provider.id] || '').trim()}
                          className="btn-kinetic px-3 py-1.5 rounded-md text-xs font-medium text-[#e4e1e9] cursor-pointer disabled:opacity-45"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleTest(provider.id)}
                      disabled={isTesting}
                      className="btn-kinetic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#4cd7f6] cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddModelForProvider(provider.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-[#cbc3d7] hover:text-[#e4e1e9] hover:bg-white/[0.06] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Free Model</span>
                    </button>
                  </div>
                </div>

                {/* Models Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {provider.models.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    return (
                      <div
                        key={model.id}
                        className={`rounded-xl p-3.5 flex flex-col justify-between gap-3 border transition-all ${
                          isSelected
                            ? 'bg-[#8b5cf6]/18 border-[#8b5cf6]/60'
                            : 'bg-[#0a0a0f]/70 border-white/[0.06]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-display text-sm font-semibold text-[#e4e1e9]">
                              {model.name}
                            </span>
                            <span className="font-mono text-[11px] text-[#958ea0] tabular-nums shrink-0">
                              {model.contextWindow}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-[#958ea0] truncate">
                            {model.id}
                          </div>
                          <div className="text-[11px] font-medium">
                            <span
                              className={
                                model.freeAccessConfirmed ? 'text-[#4cd7f6]' : 'text-[#d0bcff]'
                              }
                            >
                              {model.freeAccessLabel}
                            </span>
                            <span className="text-[#958ea0]"> · </span>
                            <span className={model.available ? 'text-[#4cd7f6]' : 'text-[#ffb4ab]'}>
                              {model.available ? 'Available' : model.unavailableReason || 'Unavailable'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#cbc3d7]">
                            {model.categories.map((c) => CATEGORY_LABELS[c]).join(' · ')}
                          </div>
                          <div className="text-[11px] text-[#958ea0]">{model.usageLimitations}</div>
                        </div>

                        <button
                          type="button"
                          disabled={!model.available}
                          onClick={() => {
                            onSelectModel(model.id);
                            onToggleSmartRouting(false);
                          }}
                          className={`w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                            !model.available
                              ? 'bg-white/[0.03] text-[#958ea0]/60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-[#8b5cf6] text-white cursor-pointer'
                              : 'btn-kinetic text-[#e4e1e9] cursor-pointer'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          <span>
                            {!model.available
                              ? 'Unavailable'
                              : isSelected
                              ? 'Selected Model'
                              : 'Select Model'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Add Free/Local Provider Modal */}
      {showAddProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAddCustomProvider({
                name: newProvName,
                baseUrl: newProvUrl,
                apiKey: newProvKey,
                modelId: newProvModelId,
                modelName: newProvModelName || newProvModelId,
                category: newProvCat,
                freeAccessConfirmed: newProvFree,
              });
              setShowAddProvider(false);
              setNewProvName('');
              setNewProvKey('');
              setNewProvModelId('');
              setNewProvModelName('');
            }}
            className="glass-layer-3 w-full max-w-md rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#4cd7f6]" />
                <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                  Add Free or Local Provider
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddProvider(false)}
                className="text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-[#cbc3d7]">Provider Name</span>
                <input
                  required
                  value={newProvName}
                  onChange={(e) => setNewProvName(e.target.value)}
                  placeholder="e.g. Local LM Studio or Free Inference Server"
                  className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 text-[#e4e1e9]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[#cbc3d7]">Base URL (OpenAI-compatible)</span>
                <input
                  required
                  type="url"
                  value={newProvUrl}
                  onChange={(e) => setNewProvUrl(e.target.value)}
                  className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 font-mono text-[#e4e1e9]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[#cbc3d7]">Optional Free Key (leave blank for local)</span>
                <input
                  type="password"
                  value={newProvKey}
                  onChange={(e) => setNewProvKey(e.target.value)}
                  className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 font-mono text-[#e4e1e9]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[#cbc3d7]">Model ID</span>
                  <input
                    required
                    value={newProvModelId}
                    onChange={(e) => setNewProvModelId(e.target.value)}
                    placeholder="qwen2.5-coder:7b"
                    className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 font-mono text-[#e4e1e9]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[#cbc3d7]">Category</span>
                  <select
                    value={newProvCat}
                    onChange={(e) => setNewProvCat(e.target.value as ModelCategory)}
                    className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-2.5 py-2 text-[#e4e1e9]"
                  >
                    {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 pt-1 text-[#cbc3d7]">
                <input
                  type="checkbox"
                  required
                  checked={newProvFree}
                  onChange={(e) => setNewProvFree(e.target.checked)}
                />
                <span>I confirm this endpoint provides free/local access without paid billing</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddProvider(false)}
                className="btn-kinetic px-4 py-2 rounded-md text-xs text-[#cbc3d7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-synthetic px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer"
              >
                Save Provider
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Free Model Modal */}
      {addModelForProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAddModelToProvider({
                providerId: addModelForProvider,
                modelId: newModelId,
                modelName: newModelName || newModelId,
                contextWindow: newModelCtx,
                category: newModelCat,
                freeAccessConfirmed: newModelFree,
              });
              setAddModelForProvider(null);
              setNewModelId('');
              setNewModelName('');
            }}
            className="glass-layer-3 w-full max-w-md rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Add Free Model
              </h2>
              <button
                type="button"
                onClick={() => setAddModelForProvider(null)}
                className="text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-[#cbc3d7]">Exact Model ID (use :free suffix for OpenRouter)</span>
                <input
                  required
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder="e.g. google/gemma-3-27b-it:free"
                  className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 font-mono text-[#e4e1e9]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[#cbc3d7]">Display Name</span>
                <input
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Gemma 3 27B (:free)"
                  className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 text-[#e4e1e9]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[#cbc3d7]">Context Window</span>
                  <input
                    value={newModelCtx}
                    onChange={(e) => setNewModelCtx(e.target.value)}
                    className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 font-mono text-[#e4e1e9]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[#cbc3d7]">Category</span>
                  <select
                    value={newModelCat}
                    onChange={(e) => setNewModelCat(e.target.value as ModelCategory)}
                    className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-2.5 py-2 text-[#e4e1e9]"
                  >
                    {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 pt-1 text-[#cbc3d7]">
                <input
                  type="checkbox"
                  required
                  checked={newModelFree}
                  onChange={(e) => setNewModelFree(e.target.checked)}
                />
                <span>Confirmed free-tier or open-source model</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddModelForProvider(null)}
                className="btn-kinetic px-4 py-2 rounded-md text-xs text-[#cbc3d7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-synthetic px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer"
              >
                Add Model
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
