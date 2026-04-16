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

interface TabConfig {
  id: SettingsTab;
  label: string;
}

function getTabs(t: (key: TranslationKey, params?: Record<string, string | number>) => string): TabConfig[] {
  return [
    { id: 'interface', label: t('settings_tab_interface') },
    { id: 'editor', label: t('settings_tab_editor') },
    { id: 'ai', label: t('settings_tab_ai') },
    { id: 'metadata', label: t('settings_tab_metadata') },
    { id: 'shortcuts', label: t('settings_tab_shortcuts') },
    { id: 'imageHosting', label: t('settings_tab_imageHosting') },
    { id: 'general', label: t('settings_tab_publishing') },
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
                className={`rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                }`}
              >
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
