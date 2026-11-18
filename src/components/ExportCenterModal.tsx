import React from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  FileText,
  Gamepad2,
  PackageCheck,
  Smartphone,
  X,
} from 'lucide-react';
import type { NexoraProject } from '../types/nexora';

interface ExportCenterModalProps {
  project: NexoraProject;
  onClose: () => void;
  onGenerateDocs: () => Promise<void>;
}

export const ExportCenterModal: React.FC<ExportCenterModalProps> = ({
  project,
  onClose,
  onGenerateDocs,
}) => {
  const readmeFile = project.files.find((f) => f.path === 'README.md');
  const approxSourceBytes = project.files.reduce((sum, f) => sum + f.content.length, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-center-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div className="glass-layer-3 spectral-top-edge w-full max-w-xl rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 id="export-center-title" className="font-display text-base font-semibold text-[#e4e1e9]">
              Verified Export Center — {project.name}
            </h2>
            <p className="text-xs text-[#958ea0] mt-0.5">
              Download verified project source bundles, game executables, assets, or compiled APKs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Export Center"
            className="p-1.5 rounded-md text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs">
          {/* 1. Full Project Source ZIP */}
          <div className="p-3.5 rounded-xl bg-[#0a0a0f]/80 border border-white/[0.08] flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Archive className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-semibold text-[#e4e1e9]">
                  Complete Source Project (.zip)
                </div>
                <div className="text-[#958ea0] font-mono text-[11px]">
                  {project.files.length} files · ~{Math.max(1, Math.round(approxSourceBytes / 1024))} KB uncompressed · Verified
                </div>
              </div>
            </div>
            <a
              href={`/api/projects/${project.id}/export`}
              className="btn-synthetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-white shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download ZIP</span>
            </a>
          </div>

          {/* 2. Verified Compiled APK (strictly real-artifact gated) */}
          {(project.type === 'android-apk' || project.type === 'game-2d' || project.type === 'game-3d') && (
            <div className="p-3.5 rounded-xl bg-[#0a0a0f]/80 border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 text-[#d0bcff] shrink-0 mt-0.5" />
                <div>
                  <div className="font-display font-semibold text-[#e4e1e9]">
                    Compiled Android APK Binary
                  </div>
                  <div className="text-[#958ea0] font-mono text-[11px]">
                    {project.build.apkAvailable
                      ? `Verified artifact (${project.build.apkSizeBytes || 0} bytes)`
                      : `Android Build Service: ${
                          project.build.toolchain.remoteRunner ? 'Configured' : 'Not Configured'
                        } — export Complete Source ZIP to build locally in Android Studio.`}
                  </div>
                </div>
              </div>
              {project.build.apkAvailable ? (
                <a
                  href={`/api/projects/${project.id}/apk`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium bg-[#06b6d4] text-[#001f26] shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download APK</span>
                </a>
              ) : (
                <span className="px-2.5 py-1 rounded bg-white/[0.04] text-[#958ea0] font-mono text-[11px] shrink-0">
                  Unavailable
                </span>
              )}
            </div>
          )}

          {/* 3. Playable Standalone Web Game HTML */}
          {(project.type === 'game-2d' || project.type === 'game-3d') && (
            <div className="p-3.5 rounded-xl bg-[#0a0a0f]/80 border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Gamepad2 className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
                <div>
                  <div className="font-display font-semibold text-[#e4e1e9]">
                    Playable Web Game Bundle (.html)
                  </div>
                  <div className="text-[#958ea0] font-mono text-[11px]">
                    Offline single-file HTML5 Canvas bundle ({Math.max(1, Math.round(project.previewHtml.length / 1024))} KB)
                  </div>
                </div>
              </div>
              <a
                href={`/api/projects/${project.id}/export/game-html`}
                className="btn-kinetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs text-[#e4e1e9] shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download HTML</span>
              </a>
            </div>
          )}

          {/* 4. Project Assets Archive */}
          <div className="p-3.5 rounded-xl bg-[#0a0a0f]/80 border border-white/[0.08] flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <PackageCheck className="w-4 h-4 text-[#d0bcff] shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-semibold text-[#e4e1e9]">
                  Approved Project Assets (.zip)
                </div>
                <div className="text-[#958ea0] font-mono text-[11px]">
                  Sprites, SVG icons, textures, and workspace media
                </div>
              </div>
            </div>
            <a
              href={`/api/projects/${project.id}/export/assets`}
              className="btn-kinetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs text-[#e4e1e9] shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Assets</span>
            </a>
          </div>

          {/* 5. Generate / Refresh Documentation */}
          <div className="p-3.5 rounded-xl bg-[#0a0a0f]/80 border border-white/[0.08] flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <FileText className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-semibold text-[#e4e1e9] flex items-center gap-1.5">
                  <span>Project Documentation (README.md)</span>
                  {readmeFile && <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6]" />}
                </div>
                <div className="text-[#958ea0] font-mono text-[11px]">
                  Inspects actual files, routes, dependencies &amp; setup steps
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onGenerateDocs}
              className="btn-kinetic px-3.5 py-2 rounded-md text-xs text-[#4cd7f6] cursor-pointer shrink-0"
            >
              {readmeFile ? 'Regenerate README' : 'Generate README'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
