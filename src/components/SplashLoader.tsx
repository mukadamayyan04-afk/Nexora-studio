import React from 'react';
import { NexoraLogo } from './NexoraLogo';

interface SplashLoaderProps {
  message?: string;
}

export const SplashLoader: React.FC<SplashLoaderProps> = ({
  message = 'Initializing Nexora Studio...',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f] studio-grid-bg p-6"
    >
      <div className="glass-layer-2 spectral-top-edge rounded-2xl px-8 py-9 max-w-sm w-full flex flex-col items-center gap-6 text-center">
        <NexoraLogo variant="splash" showTagline />
        <div className="w-full space-y-2.5">
          <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#d0bcff] to-[#4cd7f6] animate-pulse" />
          </div>
          <p className="font-mono text-[11px] text-[#958ea0]">{message}</p>
        </div>
      </div>
    </div>
  );
};
