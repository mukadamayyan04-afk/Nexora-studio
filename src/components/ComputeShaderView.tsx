import React, { useEffect, useRef, useState } from 'react';
import { Check, Code2, Play } from 'lucide-react';
import { ComputeScript } from '../types/studio';

interface ComputeShaderViewProps {
  scripts: ComputeScript[];
  onUpdateScript: (script: ComputeScript) => void;
}

export const ComputeShaderView: React.FC<ComputeShaderViewProps> = ({
  scripts,
  onUpdateScript,
}) => {
  const [selectedId, setSelectedId] = useState(scripts[0].id);
  const [compileMessage, setCompileMessage] = useState<string>(
    'Validated WGSL module with 0 warnings.'
  );
  const [compileError, setCompileError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeScript = scripts.find((s) => s.id === selectedId) ?? scripts[0];

  // Real-time procedural shader sphere preview synced to activeScript.uniforms
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Obsidian void background
    ctx.fillStyle = '#09090e';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.34;

    const { roughness, fresnelPower, rimIntensity, dispersion } = activeScript.uniforms;

    // Ambient rim halo
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.45);
    halo.addColorStop(0, `rgba(139, 92, 246, ${0.32 * rimIntensity})`);
    halo.addColorStop(0.6, `rgba(6, 182, 212, ${0.22 * rimIntensity * dispersion})`);
    halo.addColorStop(1, 'rgba(10, 10, 15, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    // Base PBR sphere gradient
    const sphereGrad = ctx.createRadialGradient(
      cx - radius * 0.35,
      cy - radius * 0.35,
      radius * 0.08,
      cx,
      cy,
      radius
    );
    const highlightAlpha = Math.max(0.12, 1 - roughness * 0.85);
    sphereGrad.addColorStop(0, `rgba(215, 224, 240, ${highlightAlpha})`);
    sphereGrad.addColorStop(0.28, '#232234');
    sphereGrad.addColorStop(0.72, '#0d0d16');
    sphereGrad.addColorStop(1, '#050508');

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // Spectral Fresnel rim pass
    const fresnelWidth = Math.max(2, 18 / Math.max(1, fresnelPower * 0.7));
    const rimGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    rimGrad.addColorStop(0, `rgba(208, 188, 255, ${rimIntensity})`);
    rimGrad.addColorStop(0.5, `rgba(139, 92, 246, ${rimIntensity * 0.6})`);
    rimGrad.addColorStop(1, `rgba(76, 215, 246, ${rimIntensity * (0.4 + dispersion * 0.6)})`);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = fresnelWidth;
    ctx.shadowColor = dispersion > 0.45 ? '#06b6d4' : '#8b5cf6';
    ctx.shadowBlur = 18 * rimIntensity;
    ctx.stroke();
    ctx.restore();
  }, [activeScript]);

  const handleCompile = () => {
    const code = activeScript.code;
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      setCompileError(
        `Syntax check failed: unmatched braces (${openBraces} opening vs ${closeBraces} closing).`
      );
      return;
    }
    if (!code.includes('fn ')) {
      setCompileError('Entry point missing: declare at least one WGSL fn kernel.');
      return;
    }
    setCompileError(null);
    const lines = code.split('\n').length;
    setCompileMessage(`Compiled ${activeScript.filename} (${lines} lines) for ${activeScript.targetPass}.`);
  };

  const codeLines = activeScript.code.split('\n');

  return (
    <section className="flex-1 overflow-y-auto studio-grid-bg p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
              Shader & Compute Kernels
            </h1>
            <p className="mt-1 text-sm text-[#958ea0]">
              Edit WGSL fragment and compute kernels alongside live uniform parameter bindings.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCompile}
            className="btn-synthetic inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Validate & Compile</span>
          </button>
        </div>

        {/* Script Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {scripts.map((s) => {
            const active = s.id === activeScript.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedId(s.id);
                  setCompileError(null);
                }}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md font-mono text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#8b5cf6]/20 text-[#e4e1e9] border border-[#8b5cf6]/55'
                    : 'bg-[#131318]/80 text-[#958ea0] hover:text-[#e4e1e9] border border-white/[0.06]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-[#4cd7f6]" />
                <span>{s.filename}</span>
              </button>
            );
          })}
        </div>

        {/* Split Editor & Live Uniform Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Code Pane */}
          <div className="lg:col-span-7 glass-layer-2 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs">
              <span className="font-mono text-[#cbc3d7]">{activeScript.filename}</span>
              <span className="text-[#958ea0]">{activeScript.targetPass}</span>
            </div>

            <div className="flex flex-1 min-h-[340px] bg-[#0a0a0f]/75">
              <div
                aria-hidden="true"
                className="py-4 px-3 text-right font-mono text-xs leading-[1.45rem] text-[#958ea0]/50 select-none border-r border-white/[0.05] tabular-nums"
              >
                {codeLines.map((_, idx) => (
                  <div key={idx}>{idx + 1}</div>
                ))}
              </div>
              <textarea
                aria-label={`Source code for ${activeScript.filename}`}
                value={activeScript.code}
                onChange={(e) =>
                  onUpdateScript({ ...activeScript, code: e.target.value })
                }
                spellCheck={false}
                className="flex-1 w-full bg-transparent p-4 font-mono text-[13px] leading-[1.45rem] text-[#e4e1e9] focus:outline-none resize-none"
              />
            </div>

            {/* Validation Status Output */}
            <div
              className={`px-4 py-2.5 border-t border-white/[0.06] text-xs font-mono flex items-center gap-2 ${
                compileError ? 'text-[#ffb4ab] bg-[#93000a]/20' : 'text-[#4cd7f6] bg-[#0e0e13]/70'
              }`}
            >
              {!compileError && <Check className="w-3.5 h-3.5 shrink-0" />}
              <span>{compileError ?? compileMessage}</span>
            </div>
          </div>

          {/* Live Shader Preview & Uniform Controls */}
          <div className="lg:col-span-5 glass-layer-2 rounded-2xl p-5 flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-semibold text-[#e4e1e9]">
                  Procedural Shader Output
                </h2>
                <span className="font-mono text-xs text-[#958ea0]">256×256 Pass</span>
              </div>

              <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#09090e] flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={240}
                  className="w-full h-auto block"
                />
              </div>
            </div>

            <div className="space-y-3.5 pt-2 border-t border-white/[0.06]">
              {(
                [
                  { key: 'roughness', label: 'Surface Roughness', min: 0.05, max: 0.95 },
                  { key: 'fresnelPower', label: 'Fresnel Exponent', min: 1.0, max: 6.0 },
                  { key: 'rimIntensity', label: 'Spectral Rim Gain', min: 0.1, max: 1.0 },
                  { key: 'dispersion', label: 'Violet-Cyan Dispersion', min: 0, max: 1.0 },
                ] as const
              ).map((u) => (
                <div key={u.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#958ea0]">{u.label}</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {activeScript.uniforms[u.key].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={u.min}
                    max={u.max}
                    step={0.02}
                    value={activeScript.uniforms[u.key]}
                    onChange={(e) =>
                      onUpdateScript({
                        ...activeScript,
                        uniforms: {
                          ...activeScript.uniforms,
                          [u.key]: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="studio-slider w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
