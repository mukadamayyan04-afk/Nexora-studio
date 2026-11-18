import React, { useRef, useState } from 'react';
import {
  Box,
  Compass,
  Grid,
  Maximize2,
  RotateCcw,
  Send,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import {
  CameraMode,
  SceneLayer,
  SceneLighting,
  SceneMaterial,
  SceneTransform,
  StudioAsset,
} from '../types/studio';

interface SpatialViewportProps {
  activeAsset: StudioAsset;
  transform: SceneTransform;
  onChangeTransform: (next: SceneTransform) => void;
  onResetTransform: () => void;
  material: SceneMaterial;
  lighting: SceneLighting;
  onChangeLighting: (next: SceneLighting) => void;
  layers: SceneLayer[];
  onSynthesizePrompt: (prompt: string, model: string) => void;
  isSynthesizing: boolean;
}

const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'isometric', label: 'Isometric' },
  { id: 'ortho-top', label: 'Top Ortho' },
];

const SYNTH_MODELS = ['Flux-3D Mesh', 'Shader-Core', 'Terrain-Gen'] as const;

export const SpatialViewport: React.FC<SpatialViewportProps> = ({
  activeAsset,
  transform,
  onChangeTransform,
  onResetTransform,
  material,
  lighting,
  onChangeLighting,
  layers,
  onSynthesizePrompt,
  isSynthesizing,
}) => {
  const [cameraMode, setCameraMode] = useState<CameraMode>('perspective');
  const [prompt, setPrompt] = useState(activeAsset.promptUsed);
  const [selectedModel, setSelectedModel] = useState<string>(SYNTH_MODELS[0]);
  const [imgError, setImgError] = useState(false);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseRotY: number; baseRotX: number }>({
    active: false,
    startX: 0,
    startY: 0,
    baseRotY: 0,
    baseRotX: 0,
  });

  const primaryMeshLayer = layers.find((l) => l.type === 'mesh');
  const isMeshVisible = primaryMeshLayer ? primaryMeshLayer.visible : true;
  const isMeshLocked = primaryMeshLayer ? primaryMeshLayer.locked : false;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMeshLocked) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseRotY: transform.rotY,
      baseRotX: transform.rotX,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || isMeshLocked) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onChangeTransform({
      ...transform,
      rotY: Math.max(-45, Math.min(45, Math.round(dragRef.current.baseRotY + dx * 0.25))),
      rotX: Math.max(-35, Math.min(35, Math.round(dragRef.current.baseRotX - dy * 0.25))),
    });
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleCameraSwitch = (mode: CameraMode) => {
    setCameraMode(mode);
    if (mode === 'perspective') {
      onChangeTransform({ ...transform, rotX: 4, rotY: -8, rotZ: 0 });
    } else if (mode === 'isometric') {
      onChangeTransform({ ...transform, rotX: 22, rotY: -28, rotZ: 0 });
    } else {
      onChangeTransform({ ...transform, rotX: 35, rotY: 0, rotZ: 0 });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSynthesizing) return;
    onSynthesizePrompt(prompt.trim(), selectedModel);
  };

  const rimGlowColor =
    material.rimTint === 'cyan'
      ? `rgba(6, 182, 212, ${material.emissiveIntensity * 0.55})`
      : material.rimTint === 'violet'
      ? `rgba(139, 92, 246, ${material.emissiveIntensity * 0.55})`
      : `rgba(139, 92, 246, ${material.emissiveIntensity * 0.4})`;

  const secondaryGlowColor =
    material.rimTint === 'dual'
      ? `rgba(6, 182, 212, ${material.emissiveIntensity * 0.4})`
      : rimGlowColor;

  return (
    <section className="relative flex-1 min-h-[540px] flex flex-col overflow-hidden studio-grid-bg">
      {/* Top Floating Viewport Toolbar */}
      <div className="relative z-20 p-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Camera Projection Switcher */}
        <div className="glass-layer-2 rounded-lg p-1 flex items-center gap-1 pointer-events-auto">
          <div className="px-2 text-[#958ea0] flex items-center gap-1.5 text-xs">
            <Compass className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span className="hidden sm:inline font-display font-medium">Camera</span>
          </div>
          {CAMERA_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleCameraSwitch(mode.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                cameraMode === mode.id
                  ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/50'
                  : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Right: Viewport Render Toggles */}
        <div className="glass-layer-2 rounded-lg p-1 flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => onChangeLighting({ ...lighting, showGrid: !lighting.showGrid })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              lighting.showGrid
                ? 'bg-[#06b6d4]/15 text-[#4cd7f6] border border-[#06b6d4]/40'
                : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeLighting({ ...lighting, showBounds: !lighting.showBounds })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              lighting.showBounds
                ? 'bg-[#06b6d4]/15 text-[#4cd7f6] border border-[#06b6d4]/40'
                : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Bounds</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeLighting({ ...lighting, showWireframe: !lighting.showWireframe })
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              lighting.showWireframe
                ? 'bg-[#8b5cf6]/25 text-[#d0bcff] border border-[#8b5cf6]/50'
                : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
            }`}
          >
            <Waypoints className="w-3.5 h-3.5" />
            <span>Wireframe</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCameraMode('perspective');
              onResetTransform();
            }}
            aria-label="Reset camera and transform"
            className="p-1.5 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive 3D Stage Canvas */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative flex-1 flex items-center justify-center px-6 pb-28 pt-2 select-none ${
          isMeshLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ perspective: '1200px' }}
      >
        {/* Perspective Spatial Ground Plane */}
        {lighting.showGrid && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-16 h-64 opacity-45"
            style={{
              background:
                'radial-gradient(ellipse at 50% 40%, rgba(6, 182, 212, 0.14) 0%, rgba(139, 92, 246, 0.08) 40%, transparent 72%)',
              transform: 'rotateX(68deg) scale(1.2)',
            }}
          >
            <div
              className="w-full h-full"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(76, 215, 246, 0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(139, 92, 246, 0.22) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
          </div>
        )}

        {/* Volumetric Haze Backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute w-[540px] h-[380px] rounded-full blur-[90px] transition-all duration-300"
          style={{
            opacity: lighting.fogDensity / 100 + 0.25,
            background: `radial-gradient(circle at 35% 45%, ${rimGlowColor}, transparent 60%), radial-gradient(circle at 70% 55%, ${secondaryGlowColor}, transparent 60%)`,
          }}
        />

        {/* Transformed 3D Viewport Subject Container */}
        {isMeshVisible ? (
          <div
            className="relative max-w-[780px] w-full aspect-video rounded-2xl transition-transform duration-75"
            style={{
              transform: `translate3d(${transform.posX}px, ${transform.posY}px, ${transform.posZ}px) rotateX(${transform.rotX}deg) rotateY(${transform.rotY}deg) rotateZ(${transform.rotZ}deg) scale(${transform.scale})`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Bounding Cage Overlay */}
            {lighting.showBounds && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-3 rounded-2xl border border-[#4cd7f6]/25"
              >
                <span className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#4cd7f6]" />
                <span className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#8b5cf6]" />
                <span className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#8b5cf6]" />
                <span className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#4cd7f6]" />
              </div>
            )}

            {/* Main Render Frame */}
            <div
              className="relative w-full h-full rounded-xl overflow-hidden border border-white/[0.1] bg-[#0e0e13]"
              style={{
                boxShadow: `0 24px 60px -12px rgba(0,0,0,0.85), 0 0 36px -8px ${rimGlowColor}`,
              }}
            >
              {!imgError ? (
                <img
                  key={activeAsset.id}
                  src={activeAsset.imageUrl}
                  alt={activeAsset.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  draggable={false}
                  className="w-full h-full object-cover transition-all duration-200"
                  style={{
                    filter: `brightness(${lighting.keyIntensity}%) contrast(${lighting.ambientContrast}%) saturate(${
                      0.85 + material.metallic * 0.35
                    })`,
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#131318] via-[#1b1b20] to-[#0a0a0f] text-[#cbc3d7]">
                  <Box className="w-10 h-10 text-[#8b5cf6] mb-2" />
                  <span className="font-display text-sm font-medium">{activeAsset.title}</span>
                </div>
              )}

              {/* Topology Wireframe Overlay */}
              {lighting.showWireframe && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 mix-blend-screen opacity-55"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(76, 215, 246, 0.28) 0, rgba(76, 215, 246, 0.28) 1px, transparent 1px, transparent 18px), repeating-linear-gradient(-45deg, rgba(139, 92, 246, 0.28) 0, rgba(139, 92, 246, 0.28) 1px, transparent 1px, transparent 18px)',
                  }}
                />
              )}

              {/* Top-left Viewport Readout (unboxed clean typography) */}
              <div className="pointer-events-none absolute top-3.5 left-4 flex items-center gap-2 text-xs text-[#cbc3d7] drop-shadow">
                <span className="font-display font-medium text-[#e4e1e9]">
                  {activeAsset.title}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#4cd7f6]">
                  {activeAsset.polyCount}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Rot {transform.rotX}° / {transform.rotY}°
                </span>
              </div>

              {/* Synthesis overlay indicator when generating */}
              {isSynthesizing && (
                <div className="absolute inset-0 bg-[#0a0a0f]/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                  <Sparkles className="w-6 h-6 text-[#d0bcff] animate-spin" />
                  <div className="font-display text-sm font-semibold text-[#e4e1e9]">
                    Synthesizing Geometry Pass
                  </div>
                  <div className="font-mono text-xs text-[#4cd7f6]">
                    Evaluating {selectedModel}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-layer-2 rounded-xl px-6 py-8 text-center max-w-sm">
            <p className="font-display text-sm font-medium text-[#e4e1e9]">
              Primary Mesh Layer Hidden
            </p>
            <p className="mt-1 text-xs text-[#958ea0]">
              Enable visibility for Primary_Mesh_LOD0 in the Scene Hierarchy to inspect geometry.
            </p>
          </div>
        )}

        {/* Bottom-Center Floating Prompt-to-Engine Command Deck */}
        <form
          onSubmit={handleSubmit}
          onPointerDown={(e) => e.stopPropagation()}
          className="glass-layer-3 spectral-top-edge absolute bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl rounded-2xl p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 z-30"
        >
          <select
            aria-label="Synthesis model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-[#0a0a0f]/90 border border-white/[0.1] rounded-md px-3 py-2 text-xs font-display font-medium text-[#d0bcff] focus:outline-none focus:border-[#8b5cf6] cursor-pointer shrink-0"
          >
            {SYNTH_MODELS.map((m) => (
              <option key={m} value={m} className="bg-[#131318] text-[#e4e1e9]">
                {m}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe mesh geometry, PBR material, or lighting pass..."
            aria-label="Prompt-to-Engine input"
            className="flex-1 min-w-0 bg-[#0a0a0f]/80 border border-white/[0.08] focus:border-[#06b6d4] rounded-md px-3.5 py-2 font-mono text-xs text-[#e4e1e9] placeholder:text-[#958ea0] focus:outline-none focus:shadow-[0_0_12px_rgba(6,182,212,0.18)]"
          />

          <button
            type="submit"
            disabled={isSynthesizing || !prompt.trim()}
            className="btn-synthetic inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSynthesizing ? 'Synthesizing...' : 'Generate'}</span>
          </button>
        </form>
      </div>
    </section>
  );
};
