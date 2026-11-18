import React, { useMemo, useState } from 'react';
import { Box, Copy, Eye, Search } from 'lucide-react';
import { AssetCategory, StudioAsset } from '../types/studio';

interface AssetLibraryViewProps {
  assets: StudioAsset[];
  activeAssetId: string;
  onLoadInViewport: (asset: StudioAsset) => void;
  onDuplicateAsset: (asset: StudioAsset) => void;
}

const CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'all', label: 'All Assemblies' },
  { id: 'hard-surface', label: 'Hard Surface' },
  { id: 'materials', label: 'Materials' },
  { id: 'terrains', label: 'Terrains' },
];

export const AssetLibraryView: React.FC<AssetLibraryViewProps> = ({
  assets,
  activeAssetId,
  onLoadInViewport,
  onDuplicateAsset,
}) => {
  const [category, setCategory] = useState<AssetCategory>('all');
  const [query, setQuery] = useState('');
  const [brokenIds, setBrokenIds] = useState<Record<string, boolean>>({});

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesCat = category === 'all' || asset.category === category;
      const matchesQuery =
        !q ||
        asset.title.toLowerCase().includes(q) ||
        asset.author.toLowerCase().includes(q) ||
        asset.promptUsed.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [assets, category, query]);

  return (
    <section className="flex-1 overflow-y-auto studio-grid-bg p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header & Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
              Asset Synthesis Library
            </h1>
            <p className="mt-1 text-sm text-[#958ea0]">
              Load calibrated 3D assemblies, procedural shaders, or heightfield tiles into the viewport.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#958ea0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assemblies or prompts..."
              aria-label="Search asset library"
              className="w-full bg-[#0a0a0f]/85 border border-white/[0.08] focus:border-[#06b6d4] rounded-md pl-9 pr-3 py-2 text-xs text-[#e4e1e9] placeholder:text-[#958ea0] focus:outline-none"
            />
          </div>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#131318]/90 border border-white/[0.06] rounded-lg w-fit">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/50'
                    : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Asset Grid */}
        {filteredAssets.length === 0 ? (
          <div className="glass-layer-2 rounded-2xl p-12 text-center space-y-3">
            <p className="font-display text-base font-medium text-[#e4e1e9]">
              No matching studio assemblies
            </p>
            <p className="text-xs text-[#958ea0]">
              Adjust your search filter or synthesize a new asset from the Spatial Viewport deck.
            </p>
            <button
              type="button"
              onClick={() => {
                setCategory('all');
                setQuery('');
              }}
              className="btn-kinetic px-4 py-2 rounded-md text-xs font-medium text-[#e4e1e9] cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredAssets.map((asset) => {
              const isLoaded = asset.id === activeAssetId;
              return (
                <article
                  key={asset.id}
                  className={`group glass-layer-2 rounded-2xl overflow-hidden transition-all ${
                    isLoaded
                      ? 'border-[#06b6d4]/55 shadow-[0_0_24px_-4px_rgba(6,182,212,0.28)]'
                      : 'hover:border-[#8b5cf6]/45'
                  }`}
                >
                  {/* Aspect-Locked 4:3 Preview */}
                  <div className="relative aspect-[4/3] bg-[#0e0e13] overflow-hidden">
                    {!brokenIds[asset.id] ? (
                      <img
                        src={asset.imageUrl}
                        alt={asset.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenIds((prev) => ({ ...prev, [asset.id]: true }))
                        }
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#131318] to-[#0a0a0f] text-[#cbc3d7]">
                        <Box className="w-8 h-8 text-[#8b5cf6] mb-2" />
                        <span className="text-xs">{asset.title}</span>
                      </div>
                    )}

                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0a0f]/95 via-[#0a0a0f]/45 to-transparent"
                    />

                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-display text-base font-semibold text-[#e4e1e9] truncate">
                          {asset.title}
                        </h2>
                        <div className="mt-0.5 text-xs text-[#cbc3d7] font-mono tabular-nums truncate">
                          {asset.polyCount} · {asset.resolution} · {asset.sizeMb}
                        </div>
                      </div>
                      {isLoaded && (
                        <span className="text-[11px] font-display font-medium text-[#4cd7f6] shrink-0">
                          Loaded
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Glass Footer Dock */}
                  <div className="p-4 flex items-center justify-between gap-3 border-t border-white/[0.06]">
                    <div className="text-xs text-[#958ea0] truncate">
                      <span>{asset.author}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{asset.updatedAt}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDuplicateAsset(asset)}
                        aria-label={`Duplicate ${asset.title}`}
                        className="btn-kinetic p-2 rounded-md text-[#cbc3d7] cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onLoadInViewport(asset)}
                        className="btn-synthetic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white whitespace-nowrap cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Load in Viewport</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
