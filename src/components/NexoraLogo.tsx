import React from 'react';

export interface NexoraLogoProps {
  variant?: 'horizontal' | 'symbol' | 'app-icon' | 'splash';
  theme?: 'dark' | 'light';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
}

const SYMBOL_SIZES: Record<NonNullable<NexoraLogoProps['size']>, string> = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

const TEXT_SIZES: Record<NonNullable<NexoraLogoProps['size']>, string> = {
  xs: 'text-sm',
  sm: 'text-base sm:text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
};

export const NexoraLogo: React.FC<NexoraLogoProps> = ({
  variant = 'horizontal',
  theme = 'dark',
  size = 'sm',
  showTagline = false,
  className = '',
}) => {
  const symbolSrc =
    variant === 'app-icon'
      ? '/assets/branding/nexora-app-icon-512.png'
      : theme === 'light'
      ? '/assets/branding/nexora-symbol-light.svg'
      : '/assets/branding/nexora-symbol.svg';

  if (variant === 'symbol' || variant === 'app-icon') {
    return (
      <img
        src={symbolSrc}
        alt="Nexora Studio emblem"
        className={`${SYMBOL_SIZES[size]} object-contain shrink-0 select-none ${className}`}
      />
    );
  }

  if (variant === 'splash') {
    return (
      <div className={`inline-flex flex-col items-center gap-4 select-none ${className}`}>
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-full bg-gradient-to-tr from-[#8b5cf6]/30 via-[#06b6d4]/20 to-transparent blur-xl"
          />
          <img
            src="/assets/branding/nexora-symbol.svg"
            alt="Nexora Studio logo"
            className="relative w-16 h-16 sm:w-20 sm:h-20 object-contain"
          />
        </div>
        <div className="text-center space-y-1">
          <div className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-[#e4e1e9] whitespace-nowrap">
            Nexora <span className="font-medium text-[#4cd7f6]">Studio</span>
          </div>
          {showTagline && (
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#958ea0]">
              AI Creation Platform
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 select-none ${className}`}>
      <img
        src={symbolSrc}
        alt="Nexora Studio symbol"
        className={`${SYMBOL_SIZES[size]} object-contain shrink-0`}
      />
      <span className="flex flex-col leading-none text-left">
        <span
          className={`font-display ${TEXT_SIZES[size]} font-bold tracking-[-0.02em] whitespace-nowrap ${
            theme === 'light' ? 'text-[#0f172a]' : 'text-[#e4e1e9]'
          }`}
        >
          Nexora{' '}
          <span
            className={`font-medium ${theme === 'light' ? 'text-[#0891b2]' : 'text-[#4cd7f6]'}`}
          >
            Studio
          </span>
        </span>
        {showTagline && (
          <span
            className={`font-mono text-[9px] tracking-[0.18em] uppercase mt-1 ${
              theme === 'light' ? 'text-[#475569]' : 'text-[#958ea0]'
            }`}
          >
            AI Creation Platform
          </span>
        )}
      </span>
    </span>
  );
};
