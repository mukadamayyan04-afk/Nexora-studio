import React, { useState } from 'react';
import { ChevronRight, RotateCcw, Sliders, Sparkles, Sun } from 'lucide-react';
import {
  PipelineNode,
  SceneLighting,
  SceneMaterial,
  SceneTransform,
  StudioAsset,
  StudioScreen,
} from '../types/studio';

interface ContextualInspectorProps {
  activeScreen: StudioScreen;
  activeAsset: StudioAsset;
  transform: SceneTransform;
  onChangeTransform: (next: SceneTransform) => void;
  onResetTransform: () => void;
  material: SceneMaterial;
  onChangeMaterial: (next: SceneMaterial) => void;
  lighting: SceneLighting;
  onChangeLighting: (next: SceneLighting) => void;
  selectedNode: PipelineNode | null;
  onUpdateNodeParam: (nodeId: string, paramKey: string, value: number) => void;
  onToggleNodeEnabled: (nodeId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type InspectorTab = 'transform' | 'material' | 'lighting';

export const ContextualInspector: React.FC<ContextualInspectorProps> = ({
  activeScreen,
  activeAsset,
  transform,
  onChangeTransform,
  onResetTransform,
  material,
  onChangeMaterial,
  lighting,
  onChangeLighting,
  selectedNode,
  onUpdateNodeParam,
  onToggleNodeEnabled,
  collapsed,
  onToggleCollapse,
}) => {
  const [tab, setTab] = useState<InspectorTab>('transform');

  if (collapsed) {
    return (
      <aside className="hidden xl:flex flex-col items-center w-12 glass-layer-1 border-l border-white/[0.06] py-3 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand property inspector"
          className="p-2 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer rotate-180"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-full xl:w-[340px] glass-layer-1 border-t xl:border-t-0 xl:border-l border-white/[0.06] flex flex-col shrink-0">
      {/* Header */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-white/[0.06]">
        <span className="font-display text-xs font-semibold tracking-[0.04em] text-[#cbc3d7]">
          {activeScreen === 'pipeline' ? 'Node Inspector' : 'Object Inspector'}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse inspector"
          className="hidden xl:inline-flex p-1.5 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pipeline Node Inspector Mode */}
      {activeScreen === 'pipeline' ? (
        <div className="p-4 flex-1 overflow-y-auto space-y-5">
          {selectedNode ? (
            <>
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/[0.06]">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#4cd7f6] capitalize">
                    {selectedNode.category} Node
                  </div>
                  <h2 className="font-display text-base font-semibold text-[#e4e1e9] truncate mt-0.5">
                    {selectedNode.title}
                  </h2>
                </div>

                {/* Recessed Cavity Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={selectedNode.enabled}
                  aria-label={`Toggle ${selectedNode.title}`}
                  onClick={() => onToggleNodeEnabled(selectedNode.id)}
                  className="relative w-11 h-6 rounded-full bg-[#07070a] border border-white/[0.1] p-0.5 transition-colors cursor-pointer shrink-0"
                >
                  <span
                    className={`block w-4.5 h-4.5 rounded-full transition-transform duration-150 ${
                      selectedNode.enabled
                        ? 'translate-x-5 bg-[#06b6d4] shadow-[0_0_10px_#06b6d4]'
                        : 'translate-x-0 bg-[#e4e1e9]'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-4">
                <div className="text-xs font-medium text-[#cbc3d7]">Kernel Parameters</div>
                {selectedNode.params.map((param) => (
                  <div key={param.key} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={`node-${param.key}`} className="text-[#958ea0]">
                        {param.label}
                      </label>
                      <span className="font-mono tabular-nums text-[#e4e1e9]">
                        {param.value}
                        {param.unit ?? ''}
                      </span>
                    </div>
                    <input
                      id={`node-${param.key}`}
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={param.value}
                      onChange={(e) =>
                        onUpdateNodeParam(selectedNode.id, param.key, parseFloat(e.target.value))
                      }
                      className="studio-slider w-full"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-white/[0.06] space-y-2.5">
                <div className="text-xs font-medium text-[#cbc3d7]">Port Bindings</div>
                {selectedNode.inputs.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-[#958ea0]">Inputs</div>
                    {selectedNode.inputs.map((port) => (
                      <div
                        key={port.id}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded-md bg-white/[0.03]"
                      >
                        <span className="text-[#e4e1e9]">{port.label}</span>
                        <span
                          className={`font-mono text-[11px] ${
                            port.type === 'stream' ? 'text-[#4cd7f6]' : 'text-[#d0bcff]'
                          }`}
                        >
                          {port.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedNode.outputs.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] text-[#958ea0]">Outputs</div>
                    {selectedNode.outputs.map((port) => (
                      <div
                        key={port.id}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded-md bg-white/[0.03]"
                      >
                        <span className="text-[#e4e1e9]">{port.label}</span>
                        <span
                          className={`font-mono text-[11px] ${
                            port.type === 'stream' ? 'text-[#4cd7f6]' : 'text-[#d0bcff]'
                          }`}
                        >
                          {port.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-[#958ea0] py-8 text-center">
              Select a pipeline node to inspect parameters and socket bindings.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Multi-tab Switcher */}
          <div className="p-2 border-b border-white/[0.06] grid grid-cols-3 gap-1">
            {(
              [
                { id: 'transform', label: 'Transform', icon: Sliders },
                { id: 'material', label: 'Material', icon: Sparkles },
                { id: 'lighting', label: 'Lighting', icon: Sun },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#8b5cf6]/20 text-[#e4e1e9] border border-[#8b5cf6]/45'
                      : 'text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-5">
            {/* Active Asset Summary */}
            <div className="pb-4 border-b border-white/[0.06]">
              <div className="text-[11px] text-[#958ea0]">Selected Assembly</div>
              <div className="font-display text-sm font-semibold text-[#e4e1e9] mt-0.5 truncate">
                {activeAsset.title}
              </div>
              <div className="mt-1 text-xs text-[#cbc3d7] font-mono tabular-nums">
                {activeAsset.polyCount} · {activeAsset.resolution}
              </div>
            </div>

            {tab === 'transform' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#cbc3d7]">Spatial Coordinates</span>
                  <button
                    type="button"
                    onClick={onResetTransform}
                    className="inline-flex items-center gap-1 text-[11px] text-[#4cd7f6] hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Position X / Y / Z */}
                <div className="space-y-2">
                  <div className="text-[11px] text-[#958ea0]">Translation Offset (px)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { key: 'posX', label: 'X' },
                        { key: 'posY', label: 'Y' },
                        { key: 'posZ', label: 'Z' },
                      ] as const
                    ).map((axis) => (
                      <label
                        key={axis.key}
                        className="flex items-center gap-1.5 bg-[#0a0a0f]/80 border border-white/[0.08] focus-within:border-[#06b6d4]/60 rounded-md px-2 py-1.5"
                      >
                        <span className="font-mono text-[11px] text-[#958ea0]">{axis.label}</span>
                        <input
                          type="number"
                          value={transform[axis.key]}
                          onChange={(e) =>
                            onChangeTransform({
                              ...transform,
                              [axis.key]: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full bg-transparent font-mono text-xs text-[#e4e1e9] tabular-nums focus:outline-none text-right"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Rotation sliders */}
                <div className="space-y-3 pt-1">
                  {(
                    [
                      { key: 'rotX', label: 'Pitch (Rot X)', min: -35, max: 35 },
                      { key: 'rotY', label: 'Yaw (Rot Y)', min: -45, max: 45 },
                      { key: 'rotZ', label: 'Roll (Rot Z)', min: -45, max: 45 },
                    ] as const
                  ).map((rot) => (
                    <div key={rot.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#958ea0]">{rot.label}</span>
                        <span className="font-mono tabular-nums text-[#e4e1e9]">
                          {transform[rot.key]}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min={rot.min}
                        max={rot.max}
                        step={1}
                        value={transform[rot.key]}
                        onChange={(e) =>
                          onChangeTransform({
                            ...transform,
                            [rot.key]: Number(e.target.value),
                          })
                        }
                        className="studio-slider w-full"
                      />
                    </div>
                  ))}
                </div>

                {/* Uniform Scale */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Viewport Scale</span>
                    <span className="font-mono tabular-nums text-[#4cd7f6]">
                      {transform.scale.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.02}
                    value={transform.scale}
                    onChange={(e) =>
                      onChangeTransform({
                        ...transform,
                        scale: parseFloat(e.target.value),
                      })
                    }
                    className="studio-slider w-full"
                  />
                </div>
              </div>
            )}

            {tab === 'material' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Surface Roughness</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {material.roughness.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    value={material.roughness}
                    onChange={(e) =>
                      onChangeMaterial({ ...material, roughness: parseFloat(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Metallic Response</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {material.metallic.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={material.metallic}
                    onChange={(e) =>
                      onChangeMaterial({ ...material, metallic: parseFloat(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Spectral Rim Intensity</span>
                    <span className="font-mono tabular-nums text-[#d0bcff]">
                      {Math.round(material.emissiveIntensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={material.emissiveIntensity}
                    onChange={(e) =>
                      onChangeMaterial({
                        ...material,
                        emissiveIntensity: parseFloat(e.target.value),
                      })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <div className="text-xs text-[#958ea0]">Rim Backlight Channel</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['violet', 'cyan', 'dual'] as const).map((tint) => (
                      <button
                        key={tint}
                        type="button"
                        onClick={() => onChangeMaterial({ ...material, rimTint: tint })}
                        className={`py-1.5 px-2 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                          material.rimTint === tint
                            ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/60'
                            : 'bg-white/[0.04] text-[#958ea0] hover:text-[#e4e1e9] border border-white/[0.06]'
                        }`}
                      >
                        {tint}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'lighting' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Key Exposure</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {lighting.keyIntensity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={140}
                    step={1}
                    value={lighting.keyIntensity}
                    onChange={(e) =>
                      onChangeLighting({ ...lighting, keyIntensity: Number(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Volumetric Haze</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {lighting.fogDensity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={1}
                    value={lighting.fogDensity}
                    onChange={(e) =>
                      onChangeLighting({ ...lighting, fogDensity: Number(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">Contrast Curve</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {lighting.ambientContrast}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={120}
                    step={1}
                    value={lighting.ambientContrast}
                    onChange={(e) =>
                      onChangeLighting({ ...lighting, ambientContrast: Number(e.target.value) })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
                  <div className="text-xs font-medium text-[#cbc3d7]">Viewport Overlays</div>
                  {(
                    [
                      { key: 'showGrid', label: 'Spatial Reference Grid' },
                      { key: 'showBounds', label: 'Bounding Cage' },
                      { key: 'showWireframe', label: 'Topology Mesh Overlay' },
                    ] as const
                  ).map((toggle) => (
                    <div key={toggle.key} className="flex items-center justify-between text-xs">
                      <span className="text-[#958ea0]">{toggle.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={lighting[toggle.key]}
                        onClick={() =>
                          onChangeLighting({ ...lighting, [toggle.key]: !lighting[toggle.key] })
                        }
                        className="relative w-10 h-5.5 rounded-full bg-[#07070a] border border-white/[0.1] p-0.5 transition-colors cursor-pointer"
                      >
                        <span
                          className={`block w-4 h-4 rounded-full transition-transform duration-150 ${
                            lighting[toggle.key]
                              ? 'translate-x-4.5 bg-[#06b6d4] shadow-[0_0_8px_#06b6d4]'
                              : 'translate-x-0 bg-[#e4e1e9]'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
};
