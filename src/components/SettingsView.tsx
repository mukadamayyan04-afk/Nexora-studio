import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  Download,
  FolderGit2,
  Plug,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import {
  AIProviderConfig,
  GitHubConnectionStatus,
  ProjectType,
  UserSettings,
} from '../types/nexora';
import { NexoraLogo } from './NexoraLogo';

interface SettingsViewProps {
  settings: UserSettings;
  providers: AIProviderConfig[];
  onSaveSettings: (patch: Partial<Omit<UserSettings, 'updatedAt'>>) => Promise<void>;
  onResetSettings: () => Promise<void>;
  onOpenModelHub: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  providers,
  onSaveSettings,
  onResetSettings,
  onOpenModelHub,
}) => {
  const [draft, setDraft] = useState<Omit<UserSettings, 'updatedAt'>>({
    defaultProjectType: settings.defaultProjectType,
    smartRouting: settings.smartRouting,
    preferredModelId: settings.preferredModelId,
    editorTabSize: settings.editorTabSize,
    autoSaveOnBlur: settings.autoSaveOnBlur,
    compactDensity: settings.compactDensity,
    accentPreset: settings.accentPreset,
  });
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [ghStatus, setGhStatus] = useState<GitHubConnectionStatus | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    githubOAuthConfigured: boolean;
    androidBuildConfigured: boolean;
    toolchain: {
      java: boolean;
      gradle: boolean;
      androidSdk: boolean;
      remoteRunner: boolean;
    };
  } | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const refreshIntegrations = useCallback(async () => {
    setIntegrationLoading(true);
    setIntegrationError(null);
    try {
      const [hRes, gRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/github/status'),
      ]);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHealthInfo(hData);
      }
      if (gRes.ok) {
        const gData = (await gRes.json()) as { status: GitHubConnectionStatus };
        setGhStatus(gData.status);
      }
    } catch (err) {
      setIntegrationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIntegrationLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshIntegrations();
  }, [refreshIntegrations]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS') {
        void refreshIntegrations();
      } else if (e.data?.type === 'OAUTH_AUTH_ERROR') {
        setIntegrationError(e.data?.message || 'GitHub OAuth failed');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshIntegrations]);

  const handleGitHubConnect = async () => {
    setIntegrationError(null);
    try {
      const res = await fetch('/api/github/auth/url');
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'GitHub OAuth is not configured.');
      }
      window.open(data.url, 'nexora_github_oauth', 'width=600,height=720');
    } catch (err) {
      setIntegrationError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGitHubDisconnect = async () => {
    await fetch('/api/github/disconnect', { method: 'POST' });
    void refreshIntegrations();
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedText(value);
      window.setTimeout(() => setCopiedText(null), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  useEffect(() => {
    setDraft({
      defaultProjectType: settings.defaultProjectType,
      smartRouting: settings.smartRouting,
      preferredModelId: settings.preferredModelId,
      editorTabSize: settings.editorTabSize,
      autoSaveOnBlur: settings.autoSaveOnBlur,
      compactDensity: settings.compactDensity,
      accentPreset: settings.accentPreset,
    });
  }, [settings]);

  const allTextModels = useMemo(() => {
    return providers.flatMap((p) =>
      p.models
        .filter((m) => !m.categories.includes('image-gen'))
        .map((m) => ({
          ...m,
          providerName: p.name,
        }))
    );
  }, [providers]);

  const connectedCount = providers.filter((p) => p.status === 'connected').length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings(draft);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg p-4 sm:p-6">
      <form onSubmit={handleSave} className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
              Studio Settings
            </h1>
            <p className="mt-1 text-sm text-[#958ea0]">
              Configure workspace editor behavior, default project target, AI routing preferences,
              and visual density. All preferences persist across sessions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetSettings}
              className="btn-kinetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-[#cbc3d7] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-synthetic inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer disabled:opacity-50"
            >
              {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving...' : savedNotice ? 'Saved' : 'Save Preferences'}</span>
            </button>
          </div>
        </div>

        {/* Project & AI Routing Defaults */}
        <section className="glass-layer-2 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Cpu className="w-4 h-4 text-[#4cd7f6]" />
            <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
              Project &amp; AI Model Defaults
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7] font-medium">Default Project Type</span>
              <select
                value={draft.defaultProjectType}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    defaultProjectType: e.target.value as ProjectType,
                  }))
                }
                className="w-full bg-[#0a0a0f]/90 border border-white/[0.1] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none focus:border-[#8b5cf6]"
              >
                <option value="android-apk">Android APK (Kotlin / Jetpack Compose)</option>
                <option value="game-2d">2D Game (Canvas / Android Host)</option>
                <option value="game-3d">3D Game (3D Engine / Android Host)</option>
                <option value="website">Website (Responsive Web App)</option>
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7] font-medium">Preferred Default Model</span>
              <select
                value={draft.preferredModelId}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, preferredModelId: e.target.value }))
                }
                className="w-full bg-[#0a0a0f]/90 border border-white/[0.1] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none focus:border-[#8b5cf6]"
              >
                {allTextModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.providerName} · {m.name} {m.available ? '(Available)' : '(Unavailable)'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 text-xs text-[#e4e1e9] cursor-pointer">
              <input
                type="checkbox"
                checked={draft.smartRouting}
                onChange={(e) => setDraft((prev) => ({ ...prev, smartRouting: e.target.checked }))}
              />
              <span>
                Automatically route new projects to the best connected free-access model
              </span>
            </label>

            <button
              type="button"
              onClick={onOpenModelHub}
              className="btn-kinetic px-3 py-1.5 rounded-md text-xs text-[#4cd7f6] cursor-pointer w-fit"
            >
              Manage Providers ({connectedCount} connected)
            </button>
          </div>
        </section>

        {/* Workspace Editor Preferences */}
        <section className="glass-layer-2 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Sliders className="w-4 h-4 text-[#d0bcff]" />
            <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
              Workspace Editor Preferences
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7] font-medium">Code Editor Indentation</span>
              <select
                value={draft.editorTabSize}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    editorTabSize: Number(e.target.value) === 4 ? 4 : 2,
                  }))
                }
                className="w-full bg-[#0a0a0f]/90 border border-white/[0.1] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none focus:border-[#8b5cf6]"
              >
                <option value={2}>2 Spaces</option>
                <option value={4}>4 Spaces</option>
              </select>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-[#e4e1e9] cursor-pointer self-end pb-2">
              <input
                type="checkbox"
                checked={draft.autoSaveOnBlur}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, autoSaveOnBlur: e.target.checked }))
                }
              />
              <span>Auto-save active workspace file when editor loses focus</span>
            </label>
          </div>
        </section>

        {/* Theme & Interface Density */}
        <section className="glass-layer-2 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Sparkles className="w-4 h-4 text-[#4cd7f6]" />
            <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
              Theme &amp; Interface Density
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {(
              [
                {
                  id: 'violet-cyan',
                  label: 'Electric Violet & Cyan',
                  desc: 'Default Stitch obsidian palette',
                },
                {
                  id: 'cyan-emerald',
                  label: 'Kinetic Cyan & Teal',
                  desc: 'High-contrast telemetry accents',
                },
                {
                  id: 'amber-violet',
                  label: 'Solaris & Violet',
                  desc: 'Warm studio highlight accents',
                },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, accentPreset: preset.id }))}
                className={`p-3.5 rounded-xl text-left border transition-colors cursor-pointer ${
                  draft.accentPreset === preset.id
                    ? 'bg-[#8b5cf6]/20 border-[#8b5cf6]/60 text-[#e4e1e9]'
                    : 'bg-[#0a0a0f]/70 border-white/[0.08] text-[#958ea0] hover:text-[#e4e1e9]'
                }`}
              >
                <div className="font-display font-semibold text-[#e4e1e9]">{preset.label}</div>
                <div className="text-[11px] mt-0.5">{preset.desc}</div>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#e4e1e9] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={draft.compactDensity}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, compactDensity: e.target.checked }))
              }
            />
            <span>Enable compact workspace panel density</span>
          </label>
        </section>

        {/* Optional Integrations & Setup Guidance */}
        <section className="glass-layer-2 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-[#4cd7f6]" />
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Optional Integrations &amp; Setup Guidance
              </h2>
            </div>
            <button
              type="button"
              onClick={refreshIntegrations}
              disabled={integrationLoading}
              className="btn-kinetic inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-[#cbc3d7] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${integrationLoading ? 'animate-spin' : ''}`} />
              <span>Re-check Status</span>
            </button>
          </div>

          <p className="text-xs text-[#958ea0] leading-relaxed">
            GitHub OAuth and external Android APK compilation are completely optional. Project creation,
            AI code generation, live full-stack sandboxes, interactive Compose/game previews, testing,
            and Source ZIP downloads remain 100% functional without them.
          </p>

          {integrationError && (
            <div className="p-2.5 rounded-lg bg-[#93000a]/25 border border-[#ffb4ab]/35 text-xs text-[#ffdad6]">
              {integrationError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* GitHub Integration Card */}
            <div className="rounded-xl bg-[#0a0a0f]/85 border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-[#d0bcff] shrink-0" />
                  <div>
                    <div className="font-display text-sm font-semibold text-[#e4e1e9]">
                      GitHub Integration
                    </div>
                    <div className="text-[11px] text-[#958ea0]">
                      Official OAuth repo clone, pull &amp; confirmed push
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10.5px] border shrink-0 ${
                    ghStatus?.connected
                      ? 'bg-[#06b6d4]/15 border-[#06b6d4]/40 text-[#4cd7f6]'
                      : 'bg-white/[0.04] border-white/[0.12] text-[#cbc3d7]'
                  }`}
                >
                  {ghStatus?.connected ? `Connected (@${ghStatus.user?.login})` : 'Not Connected'}
                </span>
              </div>

              <div className="rounded-lg bg-[#131318] border border-white/[0.06] p-2.5 font-mono text-[11px] space-y-1 text-[#958ea0]">
                <div>
                  OAuth Env ({' '}
                  <span className="text-[#e4e1e9]">GITHUB_CLIENT_ID / SECRET</span> ):{' '}
                  <span className={ghStatus?.oauthConfigured ? 'text-[#4cd7f6]' : 'text-[#d0bcff]'}>
                    {ghStatus?.oauthConfigured ? 'Configured' : 'Not Configured'}
                  </span>
                </div>
                {ghStatus?.callbackUrls && (
                  <>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="truncate" title={ghStatus.callbackUrls.dev}>
                        Dev Callback: {ghStatus.callbackUrls.dev}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(ghStatus.callbackUrls.dev)}
                        className="text-[#4cd7f6] hover:underline shrink-0 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedText === ghStatus.callbackUrls.dev ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedText === ghStatus.callbackUrls.dev ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate" title={ghStatus.callbackUrls.shared}>
                        Shared Callback: {ghStatus.callbackUrls.shared}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(ghStatus.callbackUrls.shared)}
                        className="text-[#4cd7f6] hover:underline shrink-0 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedText === ghStatus.callbackUrls.shared ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>
                          {copiedText === ghStatus.callbackUrls.shared ? 'Copied' : 'Copy'}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1.5 text-[11px] text-[#cbc3d7]">
                <div className="font-semibold text-[#e4e1e9]">Setup Steps:</div>
                <ol className="list-decimal list-inside space-y-1 text-[#958ea0]">
                  <li>
                    Register an OAuth App in{' '}
                    <a
                      href="https://github.com/settings/developers"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#4cd7f6] hover:underline"
                    >
                      GitHub Developer Settings
                    </a>
                    .
                  </li>
                  <li>Add the Dev &amp; Shared callback URLs above to Authorization callback URLs.</li>
                  <li>
                    Set <code className="text-[#e4e1e9]">GITHUB_CLIENT_ID</code> and{' '}
                    <code className="text-[#e4e1e9]">GITHUB_CLIENT_SECRET</code> in server
                    environment secrets and restart.
                  </li>
                </ol>
              </div>

              {ghStatus?.connected ? (
                <button
                  type="button"
                  onClick={handleGitHubDisconnect}
                  className="btn-kinetic w-full py-1.5 rounded text-xs text-[#ffb4ab] cursor-pointer"
                >
                  Disconnect GitHub Account
                </button>
              ) : ghStatus?.oauthConfigured ? (
                <button
                  type="button"
                  onClick={handleGitHubConnect}
                  className="btn-synthetic w-full py-1.5 rounded text-xs font-medium text-white cursor-pointer"
                >
                  Sign in with GitHub OAuth
                </button>
              ) : (
                <div className="text-[11px] font-mono text-[#958ea0]">
                  Status: Not Connected — awaiting real OAuth credentials in environment.
                </div>
              )}
            </div>

            {/* Android Build Service Card */}
            <div className="rounded-xl bg-[#0a0a0f]/85 border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#4cd7f6] shrink-0" />
                  <div>
                    <div className="font-display text-sm font-semibold text-[#e4e1e9]">
                      Android Build Service
                    </div>
                    <div className="text-[11px] text-[#958ea0]">
                      Optional native Gradle &amp; Android SDK APK compilation
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10.5px] border shrink-0 ${
                    healthInfo?.toolchain.remoteRunner ||
                    (healthInfo?.toolchain.java &&
                      healthInfo?.toolchain.gradle &&
                      healthInfo?.toolchain.androidSdk)
                      ? 'bg-[#06b6d4]/15 border-[#06b6d4]/40 text-[#4cd7f6]'
                      : 'bg-white/[0.04] border-white/[0.12] text-[#cbc3d7]'
                  }`}
                >
                  {healthInfo?.toolchain.remoteRunner
                    ? 'Configured'
                    : healthInfo?.toolchain.java &&
                      healthInfo?.toolchain.gradle &&
                      healthInfo?.toolchain.androidSdk
                    ? 'Local SDK Ready'
                    : 'Not Configured'}
                </span>
              </div>

              <div className="rounded-lg bg-[#131318] border border-white/[0.06] p-2.5 font-mono text-[11px] grid grid-cols-2 gap-1.5 text-[#958ea0]">
                <div>
                  Build Service URL:{' '}
                  <span
                    className={
                      healthInfo?.toolchain.remoteRunner ? 'text-[#4cd7f6]' : 'text-[#d0bcff]'
                    }
                  >
                    {healthInfo?.toolchain.remoteRunner ? 'Configured' : 'Not Configured'}
                  </span>
                </div>
                <div>
                  JDK:{' '}
                  <span className={healthInfo?.toolchain.java ? 'text-[#4cd7f6]' : 'text-[#cbc3d7]'}>
                    {healthInfo?.toolchain.java ? 'Ready' : 'Missing'}
                  </span>
                </div>
                <div>
                  Gradle:{' '}
                  <span
                    className={healthInfo?.toolchain.gradle ? 'text-[#4cd7f6]' : 'text-[#cbc3d7]'}
                  >
                    {healthInfo?.toolchain.gradle ? 'Ready' : 'Missing'}
                  </span>
                </div>
                <div>
                  Android SDK:{' '}
                  <span
                    className={
                      healthInfo?.toolchain.androidSdk ? 'text-[#4cd7f6]' : 'text-[#cbc3d7]'
                    }
                  >
                    {healthInfo?.toolchain.androidSdk ? 'Ready' : 'Missing'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-[#cbc3d7]">
                <div className="font-semibold text-[#e4e1e9]">Setup Steps:</div>
                <ol className="list-decimal list-inside space-y-1 text-[#958ea0]">
                  <li>
                    <span className="text-[#e4e1e9]">Local SDK:</span> Install JDK 17+, Gradle CLI,
                    and Android SDK (<code className="text-[#e4e1e9]">ANDROID_HOME</code>) on the
                    runtime host for direct <code className="text-[#e4e1e9]">assembleDebug</code>.
                  </li>
                  <li>
                    <span className="text-[#e4e1e9]">Remote Runner:</span> Set{' '}
                    <code className="text-[#e4e1e9]">ANDROID_BUILD_SERVICE_URL</code> in server
                    secrets pointing to your real external Gradle build worker.
                  </li>
                  <li>
                    <span className="text-[#e4e1e9]">Android Studio Export:</span> Download the{' '}
                    <span className="text-[#e4e1e9]">Complete Source Project (.zip)</span> from any
                    workspace&apos;s Export Center to compile locally anytime.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Nexora Studio Brand Identity & Assets */}
        <section className="glass-layer-2 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <NexoraLogo variant="symbol" size="xs" />
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Nexora Studio Brand Identity Kit
              </h2>
            </div>
            <span className="font-mono text-[11px] text-[#958ea0]">
              SVG &amp; Transparent PNG Assets
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl bg-[#0a0a0f] border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between text-[#958ea0]">
                <span>Dark-Background Primary</span>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <a
                    href="/assets/branding/nexora-logo-dark.svg"
                    download
                    className="text-[#4cd7f6] hover:underline inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    SVG
                  </a>
                  <a
                    href="/assets/branding/nexora-logo-dark.png"
                    download
                    className="text-[#d0bcff] hover:underline inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    PNG
                  </a>
                </div>
              </div>
              <div className="h-16 flex items-center justify-center rounded-lg bg-[#0a0a0f] border border-white/[0.05] px-4">
                <img
                  src="/assets/branding/nexora-logo-dark.svg"
                  alt="Nexora Studio dark background horizontal logo"
                  className="max-h-11 w-auto object-contain"
                />
              </div>
            </div>

            <div className="rounded-xl bg-[#f8fafc] border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Light-Background Variant</span>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <a
                    href="/assets/branding/nexora-logo-light.svg"
                    download
                    className="text-[#0891b2] hover:underline inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    SVG
                  </a>
                  <a
                    href="/assets/branding/nexora-logo-light.png"
                    download
                    className="text-[#6d28d9] hover:underline inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    PNG
                  </a>
                </div>
              </div>
              <div className="h-16 flex items-center justify-center rounded-lg bg-white border border-slate-200 px-4">
                <img
                  src="/assets/branding/nexora-logo-light.svg"
                  alt="Nexora Studio light background horizontal logo"
                  className="max-h-11 w-auto object-contain"
                />
              </div>
            </div>

            <div className="rounded-xl bg-[#131318] border border-white/[0.08] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/branding/nexora-symbol.png"
                  alt="Nexora Studio standalone transparent PNG symbol"
                  className="w-11 h-11 object-contain shrink-0"
                />
                <div>
                  <div className="font-display font-semibold text-[#e4e1e9]">Standalone Symbol</div>
                  <div className="font-mono text-[11px] text-[#958ea0]">512px Transparent PNG / SVG</div>
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <a href="/assets/branding/nexora-symbol.svg" download className="text-[#4cd7f6] hover:underline">
                  SVG
                </a>
                <a href="/assets/branding/nexora-symbol.png" download className="text-[#d0bcff] hover:underline">
                  PNG
                </a>
              </div>
            </div>

            <div className="rounded-xl bg-[#131318] border border-white/[0.08] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/branding/nexora-app-icon-512.png"
                  alt="Nexora Studio application icon"
                  className="w-11 h-11 rounded-xl object-contain shrink-0"
                />
                <div>
                  <div className="font-display font-semibold text-[#e4e1e9]">App Icon &amp; Favicon</div>
                  <div className="font-mono text-[11px] text-[#958ea0]">512px / 192px / 32px</div>
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <a href="/assets/branding/favicon.svg" download className="text-[#4cd7f6] hover:underline">
                  ICO
                </a>
                <a href="/assets/branding/nexora-app-icon-512.png" download className="text-[#d0bcff] hover:underline">
                  PNG
                </a>
              </div>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
};
