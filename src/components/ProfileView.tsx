import React, { useEffect, useState } from 'react';
import { Check, Download, FolderKanban, Save, ShieldCheck, User } from 'lucide-react';
import { AIProviderConfig, NexoraProject, UserProfile } from '../types/nexora';
import { NexoraLogo } from './NexoraLogo';

interface ProfileViewProps {
  profile: UserProfile;
  projects: NexoraProject[];
  providers: AIProviderConfig[];
  onSaveProfile: (
    patch: Partial<Pick<UserProfile, 'displayName' | 'handle' | 'email' | 'role' | 'bio'>>
  ) => Promise<void>;
  onOpenProjects: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  projects,
  providers,
  onSaveProfile,
  onOpenProjects,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState(profile.role);
  const [bio, setBio] = useState(profile.bio);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile.displayName);
    setHandle(profile.handle);
    setEmail(profile.email);
    setRole(profile.role);
    setBio(profile.bio);
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSaveProfile({ displayName, handle, email, role, bio });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleExportAccountSnapshot = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      projectSummary: projects.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        generationStatus: p.generationStatus,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexora-profile-${profile.handle || 'creator'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = projects.filter((p) => p.generationStatus === 'completed').length;
  const connectedProvidersCount = providers.filter((p) => p.status === 'connected').length;

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#06b6d4] flex items-center justify-center font-display text-lg font-bold text-white shrink-0">
              {profile.avatarInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
                  {profile.displayName}
                </h1>
                <NexoraLogo variant="symbol" size="xs" />
              </div>
              <p className="text-xs font-mono text-[#4cd7f6]">
                @{profile.handle} · {profile.role}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenProjects}
            className="btn-kinetic inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium text-[#e4e1e9] cursor-pointer w-fit"
          >
            <FolderKanban className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>View My Projects ({projects.length})</span>
          </button>
        </div>

        {/* Workspace Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-layer-2 rounded-xl p-4 space-y-1">
            <div className="text-xs text-[#958ea0]">Total Saved Projects</div>
            <div className="font-display text-2xl font-bold text-[#e4e1e9] tabular-nums">
              {projects.length}
            </div>
          </div>
          <div className="glass-layer-2 rounded-xl p-4 space-y-1">
            <div className="text-xs text-[#958ea0]">Generated Workspaces</div>
            <div className="font-display text-2xl font-bold text-[#4cd7f6] tabular-nums">
              {completedCount}
            </div>
          </div>
          <div className="glass-layer-2 rounded-xl p-4 space-y-1">
            <div className="text-xs text-[#958ea0]">Connected AI Providers</div>
            <div className="font-display text-2xl font-bold text-[#d0bcff] tabular-nums">
              {connectedProvidersCount}
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="glass-layer-2 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#4cd7f6]" />
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Creator Identity
              </h2>
            </div>
            <span className="font-mono text-[11px] text-[#958ea0]">
              Session ID: {profile.id}
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-[#ffb4ab]/35 bg-[#93000a]/25 px-3 py-2 text-xs text-[#ffdad6]">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7]">Display Name</span>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7]">Handle</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-md px-3 py-2 font-mono text-[#e4e1e9] focus:outline-none"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[#cbc3d7]">Studio Role</span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none"
              />
            </label>
          </div>

          <label className="space-y-1.5 block text-xs">
            <span className="text-[#cbc3d7]">Bio</span>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-md px-3 py-2 text-[#e4e1e9] focus:outline-none resize-y"
            />
          </label>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="btn-synthetic inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer disabled:opacity-50"
            >
              {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving...' : savedNotice ? 'Profile Saved' : 'Save Profile'}</span>
            </button>
          </div>
        </form>

        {/* Privacy & Account Data Controls */}
        <section className="glass-layer-2 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#4cd7f6]" />
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Privacy &amp; Data Controls
              </h2>
            </div>
            <p className="text-xs text-[#958ea0]">
              API keys are stored exclusively on the backend server and never exposed to browser
              storage. Export a snapshot of your profile and saved project metadata anytime.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportAccountSnapshot}
            className="btn-kinetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-[#e4e1e9] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Account Data</span>
          </button>
        </section>
      </div>
    </div>
  );
};
