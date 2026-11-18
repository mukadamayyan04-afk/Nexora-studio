import React from 'react';
import { Download, Menu, Plus } from 'lucide-react';
import { TopNavSection } from '../types/nexora';
import { NexoraLogo } from './NexoraLogo';

interface TopBarProps {
  activeSection: TopNavSection;
  onSelectSection: (section: TopNavSection) => void;
  onPrimaryAction: () => void;
  onToggleSidebar: () => void;
  showSidebarToggle: boolean;
  userInitials?: string;
}

const NAV_ITEMS: { id: TopNavSection; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'models', label: 'AI Models' },
  { id: 'templates', label: 'Templates' },
  { id: 'projects', label: 'My Projects' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'Profile' },
  { id: 'studio', label: '3D Studio' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSelectSection,
  onPrimaryAction,
  onToggleSidebar,
  showSidebarToggle,
  userInitials,
}) => {
  const isStudio = activeSection === 'studio';

  return (
    <header className="glass-layer-1 sticky top-0 z-40 h-14 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3 border-b border-white/[0.06] shrink-0">
      {/* Zone 1: Official Nexora Studio horizontal logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        {showSidebarToggle && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle workspace panel"
            className="lg:hidden p-2 rounded-md text-[#cbc3d7] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelectSection('home')}
          aria-label="Nexora Studio Home"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] rounded cursor-pointer flex items-center"
        >
          <NexoraLogo variant="horizontal" size="sm" />
        </button>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav
        aria-label="Primary studio navigation"
        className="hidden md:flex items-center gap-2.5 lg:gap-4 overflow-x-auto min-w-0"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-1.5 text-xs lg:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] rounded ${
                isActive ? 'text-[#e4e1e9]' : 'text-[#958ea0] hover:text-[#e4e1e9]'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#06b6d4]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary action + compact profile access */}
      <div className="flex items-center gap-2.5 shrink-0">
        {userInitials && (
          <button
            type="button"
            onClick={() => onSelectSection('profile')}
            title="Open Profile"
            aria-label="Open user profile"
            className="hidden sm:inline-flex items-center justify-center w-8 h-8 rounded-md bg-white/[0.06] border border-white/[0.1] text-xs font-display font-semibold text-[#d0bcff] hover:border-[#8b5cf6]/60 transition-colors cursor-pointer shrink-0"
          >
            {userInitials}
          </button>
        )}

        <button
          type="button"
          onClick={onPrimaryAction}
          className="btn-synthetic inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4cd7f6]"
        >
          {isStudio ? (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Export Scene</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>New Project</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
