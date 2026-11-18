import React from 'react';
import {
  Box,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Sparkles,
  Sun,
  Unlock,
} from 'lucide-react';
import { SceneLayer, StudioAsset, StudioScreen } from '../types/studio';
import { NexoraLogo } from './NexoraLogo';

interface SceneHierarchySidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  layers: SceneLayer[];
  selectedLayerId: string;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  activeAsset: StudioAsset;
  recentAssets: StudioAsset[];
  onLoadAsset: (asset: StudioAsset) => void;
  activeScreen: StudioScreen;
  onSelectScreen: (screen: StudioScreen) => void;
}

const LAYER_ICONS: Record<SceneLayer['type'], React.ReactNode> = {
  mesh: <Box className="w-3.5 h-3.5 text-[#4cd7f6]" />,
  shader: <Sparkles className="w-3.5 h-3.5 text-[#d0bcff]" />,
  light: <Sun className="w-3.5 h-3.5 text-[#adc6ff]" />,
  camera: <Camera className="w-3.5 h-3.5 text-[#958ea0]" />,
};

export const SceneHierarchySidebar: React.FC<SceneHierarchySidebarProps> = ({
  collapsed,
  onToggleCollapse,
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  activeAsset,
  recentAssets,
  onLoadAsset,
  activeScreen,
  onSelectScreen,
}) => {
  if (collapsed) {
    return (
      <aside className="hidden lg:flex flex-col items-center w-12 glass-layer-1 border-r border-white/[0.06] py-3 shrink-0">
        <NexoraLogo variant="symbol" size="xs" className="mb-3" />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand scene hierarchy sidebar"
          className="p-2 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Scene Layers"
            className="p-2 rounded-md text-[#d0bcff] bg-[#8b5cf6]/15"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[260px] glass-layer-1 border-r border-white/[0.06] flex flex-col h-full shrink-0 select-none">
      {/* Header */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <NexoraLogo variant="symbol" size="xs" />
          <span className="font-display text-xs font-semibold tracking-[0.04em] text-[#cbc3d7]">
            Scene Hierarchy
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse sidebar"
          className="p-1.5 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mobile navigation fallback inside drawer */}
      <div className="md:hidden px-3 py-2.5 border-b border-white/[0.06] grid grid-cols-2 gap-1.5">
        {(
          [
            { id: 'viewport', label: 'Viewport' },
            { id: 'pipeline', label: 'Node Graph' },
            { id: 'assets', label: 'Assets' },
            { id: 'compute', label: 'Compute' },
          ] as { id: StudioScreen; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectScreen(item.id)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-colors ${
              activeScreen === item.id
                ? 'bg-[#8b5cf6]/20 text-[#e4e1e9] border border-[#8b5cf6]/40'
                : 'text-[#958ea0] hover:text-[#e4e1e9] bg-white/[0.03]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Outliner layers */}
      <div className="p-3 space-y-1 border-b border-white/[0.06]">
        <div className="px-2 py-1 flex items-center justify-between text-[11px] font-medium text-[#958ea0]">
          <span>Active Stage Objects</span>
          <span className="font-mono tabular-nums">{layers.length}</span>
        </div>

        {layers.map((layer) => {
          const isSelected = layer.id === selectedLayerId;
          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectLayer(layer.id);
                }
              }}
              className={`group flex items-center justify-between px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#8b5cf6]/18 text-[#e4e1e9] border border-[#8b5cf6]/40'
                  : 'text-[#cbc3d7] hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {LAYER_ICONS[layer.type]}
                <span className="truncate font-mono text-[12px]">{layer.name}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  className="p-1 rounded text-[#958ea0] hover:text-[#4cd7f6] transition-colors"
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-[#958ea0]/50" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock(layer.id);
                  }}
                  aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                  className="p-1 rounded text-[#958ea0] hover:text-[#d0bcff] transition-colors"
                >
                  {layer.locked ? (
                    <Lock className="w-3 h-3 text-[#d0bcff]" />
                  ) : (
                    <Unlock className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stage Asset Switcher */}
      <div className="p-3 flex-1 overflow-y-auto space-y-2">
        <div className="px-2 py-1 flex items-center justify-between text-[11px] font-medium text-[#958ea0]">
          <span>Stage Assemblies</span>
          <button
            type="button"
            onClick={() => onSelectScreen('assets')}
            className="text-[#4cd7f6] hover:underline cursor-pointer"
          >
            Browse all
          </button>
        </div>

        <div className="space-y-1.5">
          {recentAssets.map((asset) => {
            const isActive = asset.id === activeAsset.id;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onLoadAsset(asset)}
                className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1f1f25]/90 border border-[#06b6d4]/45 shadow-[0_0_16px_-4px_rgba(6,182,212,0.3)]'
                    : 'bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05]'
                }`}
              >
                <img
                  src={asset.imageUrl}
                  alt={asset.title}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-md object-cover shrink-0 bg-[#0e0e13]"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-[#e4e1e9] truncate">{asset.title}</div>
                  <div className="text-[11px] text-[#958ea0] font-mono tabular-nums truncate">
                    {asset.polyCount} · {asset.resolution}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Scene Spec Footer */}
      <div className="p-3.5 border-t border-white/[0.06] bg-[#0e0e13]/60">
        <div className="text-[11px] text-[#958ea0]">Active Assembly</div>
        <div className="mt-0.5 text-xs font-medium text-[#e4e1e9] truncate">{activeAsset.title}</div>
        <div className="mt-1 text-[11px] font-mono text-[#cbc3d7] tabular-nums">
          {activeAsset.polyCount} · {activeAsset.sizeMb}
        </div>
      </div>
    </aside>
  );
};
