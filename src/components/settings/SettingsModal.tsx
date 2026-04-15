import React, { useEffect, useState } from 'react';
import type { AppSettings } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import type { TranslationKey } from '../../utils/i18n';
import { InterfaceTab } from './tabs/InterfaceTab';
import { EditorTab } from './tabs/EditorTab';
import { AITab } from './tabs/AITab';
import { MetadataTab } from './tabs/MetadataTab';
import { ShortcutsTab } from './tabs/ShortcutsTab';
import { PublishingTab } from './tabs/PublishingTab';
import { ImageHostingTab } from './tabs/ImageHostingTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

type SettingsTab = 'general' | 'editor' | 'metadata' | 'shortcuts' | 'ai' | 'interface' | 'imageHosting';

type TabIconProps = { size: number; className?: string };

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.FC<TabIconProps>;
}

function getTabs(t: (key: TranslationKey, params?: Record<string, string | number>) => string): TabConfig[] {
  return [
    {
      id: 'interface',
      label: t('settings_tab_interface'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      id: 'editor',
      label: t('settings_tab_editor'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      ),
    },
    {
      id: 'ai',
      label: t('settings_tab_ai'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
        </svg>
      ),
    },
    {
      id: 'metadata',
      label: t('settings_tab_metadata'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
    },
    {
      id: 'shortcuts',
      label: t('settings_tab_shortcuts'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="6" y1="8" x2="6" y2="8" /><line x1="10" y1="8" x2="10" y2="8" />
          <line x1="14" y1="8" x2="14" y2="8" /><line x1="18" y1="8" x2="18" y2="8" />
          <line x1="6" y1="12" x2="6" y2="12" /><line x1="10" y1="12" x2="10" y2="12" />
          <line x1="14" y1="12" x2="14" y2="12" /><line x1="18" y1="12" x2="18" y2="12" />
          <line x1="6" y1="16" x2="10" y2="16" />
        </svg>
      ),
    },
    {
      id: 'imageHosting',
      label: t('settings_tab_imageHosting'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    },
    {
      id: 'general',
      label: t('settings_tab_publishing'),
      icon: ({ size, className }) => (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18" />
          <path d="M5 8l7-5 7 5" />
          <path d="M5 16l7 5 7-5" />
        </svg>
      ),
    },
  ];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('editor');
  const tabs = getTabs(t);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'interface':
        return <InterfaceTab settings={settings} onUpdateSettings={onUpdateSettings} isOpen={isOpen} />;
      case 'editor':
        return <EditorTab settings={settings} onUpdateSettings={onUpdateSettings} isOpen={isOpen} />;
      case 'ai':
        return <AITab settings={settings} onUpdateSettings={onUpdateSettings} />;
      case 'metadata':
        return <MetadataTab settings={settings} onUpdateSettings={onUpdateSettings} />;
      case 'shortcuts':
        return <ShortcutsTab settings={settings} onUpdateSettings={onUpdateSettings} />;
      case 'imageHosting':
        return <ImageHostingTab settings={settings} onUpdateSettings={onUpdateSettings} />;
      case 'general':
        return <PublishingTab settings={settings} onUpdateSettings={onUpdateSettings} />;
    }
  };

  return (
    <div className="ui-scaled fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in-02s">
      <div
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-scale-in flex h-[600px] max-h-[90vh] border border-gray-200/50 dark:border-white/10"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings_title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-56 bg-gray-50/50 dark:bg-black/20 border-r border-gray-200/50 dark:border-white/5 flex min-h-0 flex-col shrink-0 p-3">
          <div className="mb-2 shrink-0 px-3 py-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('settings_title')}</h2>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                }`}
              >
                <tab.icon className="shrink-0" size={18} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-transparent">
          <div className="flex-1 overflow-y-auto p-8">
            {renderActiveTab()}
          </div>

          <div className="p-4 border-t border-gray-200/50 dark:border-white/10 flex justify-end">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t('common_done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
