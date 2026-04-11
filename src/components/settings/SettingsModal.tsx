import React, { useState } from 'react';
import type { AppSettings, MetadataField } from '../../types';
import { isTauriEnvironment } from '../../types/filesystem';
import { DEFAULT_AI_SYSTEM_PROMPT } from '../../services/aiPrompts';
import { fetchAvailableModels, type ModelOption } from '../../services/modelCatalogService';
import { persistSecureSetting, type SensitiveSettingKey } from '../../services/secureSettingsService';
import {
  isValidOrEmptyBlogRepoUrl,
  isValidOrEmptyBlogSiteUrl,
  normalizeBlogRepoUrl,
  normalizeBlogSiteUrl,
} from '../../utils/blogRepo';
import { useI18n } from '../../hooks/useI18n';
import { type TranslationKey } from '../../utils/i18n';
import { useAppStore } from '../../store/appStore';
import {
  formatShortcutForDisplay,
  getPreferredShortcutModifierToken,
  normalizeShortcutForPlatform,
} from '../../utils/shortcuts';

function formatAutoSaveInterval(intervalMs: number, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (intervalMs < 60000) {
    return t('settings_seconds', { count: Math.round(intervalMs / 1000) });
  }

  const minutes = intervalMs / 60000;
  return t('settings_minutes', { count: Number.isInteger(minutes) ? minutes : minutes.toFixed(1) });
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

type SettingsTab = 'general' | 'editor' | 'metadata' | 'shortcuts' | 'ai' | 'interface';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.FC<{ size: number }>;
}

function getTabs(t: (key: TranslationKey, params?: Record<string, string | number>) => string): TabConfig[] {
  return [
    {
      id: 'interface',
      label: t('settings_tab_interface'),
      icon: (props) => (
        <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      id: 'editor',
      label: t('settings_tab_editor'),
      icon: (props) => (
        <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      ),
    },
    {
      id: 'ai',
      label: t('settings_tab_ai'),
      icon: (props) => (
        <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
        </svg>
      ),
    },
    {
      id: 'metadata',
      label: t('settings_tab_metadata'),
      icon: (props) => (
        <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
    },
    {
      id: 'shortcuts',
      label: t('settings_tab_shortcuts'),
      icon: (props) => (
        <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="6" y1="8" x2="6" y2="8" />
          <line x1="10" y1="8" x2="10" y2="8" />
          <line x1="14" y1="8" x2="14" y2="8" />
          <line x1="18" y1="8" x2="18" y2="8" />
          <line x1="6" y1="12" x2="6" y2="12" />
          <line x1="10" y1="12" x2="10" y2="12" />
          <line x1="14" y1="12" x2="14" y2="12" />
          <line x1="18" y1="12" x2="18" y2="12" />
          <line x1="6" y1="16" x2="10" y2="16" />
        </svg>
      ),
    },
    {
      id: 'general',
      label: t('settings_tab_publishing'),
      icon: (props) => (
        <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18" />
          <path d="M5 8l7-5 7 5" />
          <path d="M5 16l7 5 7-5" />
        </svg>
      ),
    },
  ];
}

function getShortcutLabels(t: (key: TranslationKey, params?: Record<string, string | number>) => string): Record<string, string> {
  return {
    save: t('settings_saveFile'),
    toggleView: t('settings_toggleView'),
    aiAnalyze: t('settings_aiEnhance'),
    search: t('settings_search'),
    sidebarSearch: t('settings_sidebarSearch'),
    locateCurrentFile: t('settings_locateCurrentFile'),
    settings: t('settings_openSettings'),
    toggleOutline: t('settings_toggleOutline'),
    toggleSidebar: t('settings_toggleSidebar'),
    newNote: t('settings_newNote'),
    newFolder: t('settings_newFolder'),
    closeTab: t('settings_closeTab'),
    openKnowledgeBase: t('settings_openKnowledgeBase'),
    exportHtml: t('settings_exportHtml'),
  };
}

type ShortcutGroupId = 'workspace' | 'editing' | 'search' | 'panels';

interface ShortcutItemConfig {
  id: string;
  label: string;
  description: string;
  editable?: boolean;
  settingKey?: keyof AppSettings['shortcuts'];
  shortcuts?: string[];
}

interface ShortcutGroupConfig {
  id: ShortcutGroupId;
  label: string;
  description: string;
  items: ShortcutItemConfig[];
}

function getShortcutGroups(t: (key: TranslationKey, params?: Record<string, string | number>) => string): ShortcutGroupConfig[] {
  return [
  {
    id: 'workspace',
    label: t('settings_workspace'),
    description: t('settings_workspaceDesc'),
    items: [
      {
        id: 'save',
        label: t('settings_saveFile'),
        description: t('settings_saveFileDesc'),
        editable: true,
        settingKey: 'save',
      },
      {
        id: 'toggleView',
        label: t('settings_toggleView'),
        description: t('settings_toggleViewDesc'),
        editable: true,
        settingKey: 'toggleView',
      },
      {
        id: 'toggleOutline',
        label: t('settings_toggleOutline'),
        description: t('settings_toggleOutlineDesc'),
        editable: true,
        settingKey: 'toggleOutline',
      },
      {
        id: 'toggleSidebar',
        label: t('settings_toggleSidebar'),
        description: t('settings_toggleSidebarDesc'),
        editable: true,
        settingKey: 'toggleSidebar',
      },
      {
        id: 'openKnowledgeBase',
        label: t('settings_openKnowledgeBase'),
        description: t('settings_openKnowledgeBaseDesc'),
        editable: true,
        settingKey: 'openKnowledgeBase',
      },
      {
        id: 'locateCurrentFile',
        label: t('settings_locateCurrentFile'),
        description: t('settings_locateCurrentFileDesc'),
        editable: true,
        settingKey: 'locateCurrentFile',
      },
      {
        id: 'openSettings',
        label: t('settings_openSettings'),
        description: t('settings_openSettingsDesc'),
        editable: true,
        settingKey: 'settings',
      },
    ],
  },
  {
    id: 'editing',
    label: t('settings_editing'),
    description: t('settings_editingDesc'),
    items: [
      {
        id: 'newNote',
        label: t('settings_newNote'),
        description: t('settings_newNoteDesc'),
        editable: true,
        settingKey: 'newNote',
      },
      {
        id: 'newFolder',
        label: t('settings_newFolder'),
        description: t('settings_newFolderDesc'),
        editable: true,
        settingKey: 'newFolder',
      },
      {
        id: 'closeTab',
        label: t('settings_closeTab'),
        description: t('settings_closeTabDesc'),
        editable: true,
        settingKey: 'closeTab',
      },
      {
        id: 'aiAnalyze',
        label: t('settings_aiEnhance'),
        description: t('settings_aiEnhanceDesc'),
        editable: true,
        settingKey: 'aiAnalyze',
      },
      {
        id: 'undo',
        label: t('settings_undo'),
        description: t('settings_undoDesc'),
        shortcuts: ['Ctrl+Z'],
      },
      {
        id: 'redo',
        label: t('settings_redo'),
        description: t('settings_redoDesc'),
        shortcuts: ['Ctrl+Shift+Z'],
      },
    ],
  },
  {
    id: 'search',
    label: t('settings_search'),
    description: t('settings_searchDesc'),
    items: [
      {
        id: 'search',
        label: t('settings_openSearch'),
        description: t('settings_openSearchDesc'),
        editable: true,
        settingKey: 'search',
      },
      {
        id: 'sidebarSearch',
        label: t('settings_sidebarSearch'),
        description: t('settings_sidebarSearchDesc'),
        editable: true,
        settingKey: 'sidebarSearch',
      },
      {
        id: 'nextMatch',
        label: t('settings_nextMatch'),
        description: t('settings_nextMatchDesc'),
        shortcuts: ['Enter'],
      },
      {
        id: 'previousMatch',
        label: t('settings_previousMatch'),
        description: t('settings_previousMatchDesc'),
        shortcuts: ['Shift+Enter'],
      },
    ],
  },
  {
    id: 'panels',
    label: t('settings_panelsAndDialogs'),
    description: t('settings_panelsAndDialogsDesc'),
    items: [
      {
        id: 'closePanel',
        label: t('settings_closeActivePanel'),
        description: t('settings_closeActivePanelDesc'),
        shortcuts: ['Escape'],
      },
      {
        id: 'exportHtml',
        label: t('settings_exportHtml'),
        description: t('settings_exportHtmlDesc'),
        editable: true,
        settingKey: 'exportHtml',
      },
      {
        id: 'cleanupUnusedAttachments',
        label: t('settings_cleanupUnusedAttachments'),
        description: t('settings_cleanupUnusedAttachmentsDesc'),
        shortcuts: ['Cmd+Shift+-'],
      },
    ],
  },
];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const { t, language } = useI18n();
  const showNotification = useAppStore((state) => state.showNotification);
  const [activeTab, setActiveTab] = useState<SettingsTab>('editor');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOpenAIApiKey, setShowOpenAIApiKey] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [draggingMetadataIndex, setDraggingMetadataIndex] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<'gemini' | 'codex', ModelOption[]>>({
    gemini: [],
    codex: [],
  });
  const [isLoadingModels, setIsLoadingModels] = useState<Record<'gemini' | 'codex', boolean>>({
    gemini: false,
    codex: false,
  });
  const [modelLoadMessage, setModelLoadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedShortcutGroups, setExpandedShortcutGroups] = useState<Record<ShortcutGroupId, boolean>>({
    workspace: true,
    editing: true,
    search: true,
    panels: true,
  });
  const tabs = getTabs(t);
  const shortcutLabels = getShortcutLabels(t);
  const shortcutGroups = getShortcutGroups(t);

  // Normalize shortcut input to standard format (e.g., "Ctrl+S")
  const normalizeShortcut = (input: string): string => {
    const parts = input.toLowerCase().split('+').map(p => p.trim());
    const modifiers: string[] = [];
    let key = '';
    const preferredModifier = getPreferredShortcutModifierToken();

    for (const part of parts) {
      if (part === 'ctrl' || part === 'control') {
        modifiers.push(preferredModifier);
      } else if (part === 'meta' || part === 'cmd' || part === 'command') {
        modifiers.push(preferredModifier);
      } else if (part === 'shift') {
        modifiers.push('Shift');
      } else if (part === 'alt' || part === 'option') {
        modifiers.push('Alt');
      } else if (part) {
        // Capitalize key
        key = part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
    }

    if (!key) return '';
    return normalizeShortcutForPlatform([...modifiers, key].join('+'));
  };

  const handleShortcutChange = (key: string, value: string) => {
    const normalized = normalizeShortcut(value);
    if (!normalized) return;
    onUpdateSettings({
      shortcuts: { ...settings.shortcuts, [key]: normalized }
    });
  };

  const handleSecureSettingChange = (key: SensitiveSettingKey, value: string) => {
    onUpdateSettings({ [key]: value } as Partial<AppSettings>);
    void persistSecureSetting(key, value).catch((error) => {
      console.error(`Failed to persist secure setting ${key}:`, error);
      showNotification(
        language === 'zh-CN' ? '安全保存密钥失败。' : 'Failed to securely save the secret.',
        'error'
      );
    });
  };

  const toggleShortcutGroup = (groupId: ShortcutGroupId) => {
    setExpandedShortcutGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  if (!isOpen) return null;

  const loadModels = async (provider: 'gemini' | 'codex') => {
    try {
      setModelLoadMessage(null);
      setIsLoadingModels((prev) => ({ ...prev, [provider]: true }));
      const models = await fetchAvailableModels(provider, settings);
      setAvailableModels((prev) => ({ ...prev, [provider]: models }));
      setModelLoadMessage({
        type: 'success',
        text: models.length > 0
          ? t('settings_modelsLoaded', { count: models.length, provider: provider === 'gemini' ? 'Gemini ' : 'OpenAI ' })
          : t('settings_noAvailableModels'),
      });
    } catch (error) {
      setModelLoadMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('settings_modelLoadFailed'),
      });
    } finally {
      setIsLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleUpdateMetadata = (idx: number, field: Partial<MetadataField>) => {
    if (idx < 0 || idx >= settings.metadataFields.length) return;
    const newFields = settings.metadataFields.map((f, i) =>
      i === idx ? { ...f, ...field } : f
    );
    onUpdateSettings({ metadataFields: newFields });
  };

  const handleAddMetadata = () => {
    onUpdateSettings({
      metadataFields: [...settings.metadataFields, { key: 'new_prop', defaultValue: '' }]
    });
  };

  const handleRemoveMetadata = (idx: number) => {
    if (idx < 0 || idx >= settings.metadataFields.length) return;
    const newFields = settings.metadataFields.filter((_, i) => i !== idx);
    onUpdateSettings({ metadataFields: newFields });
  };

  const handleMoveMetadata = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0
      || toIndex < 0
      || fromIndex >= settings.metadataFields.length
      || toIndex >= settings.metadataFields.length
      || fromIndex === toIndex
    ) {
      return;
    }

    const newFields = [...settings.metadataFields];
    const [movedField] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, movedField);
    onUpdateSettings({ metadataFields: newFields });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in-02s">
      <div
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-scale-in flex h-[600px] max-h-[90vh] border border-gray-200/50 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-56 bg-gray-50/50 dark:bg-black/20 border-r border-gray-200/50 dark:border-white/5 flex flex-col p-3 gap-1 shrink-0">
          <div className="px-3 py-4 mb-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('settings_title')}</h2>
          </div>

          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent">
          <div className="flex-1 overflow-y-auto p-8">
            {/* AI Tab */}
            {activeTab === 'ai' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{t('settings_aiContentEnhance')}</h3>
                  <p className="text-sm text-gray-500 mb-6">{t('settings_aiContentEnhanceDesc')}</p>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_aiProvider')}</label>
                      <select
                        value={settings.aiProvider}
                        onChange={(e) => onUpdateSettings({ aiProvider: e.target.value as AppSettings['aiProvider'] })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                      >
                        <option value="gemini">Gemini</option>
                        <option value="codex">OpenAI</option>
                      </select>
                    </div>

                    {settings.aiProvider === 'gemini' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_geminiApiKey')}</label>
                          <div className="relative">
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={settings.geminiApiKey || ''}
                              onChange={(e) => handleSecureSettingChange('geminiApiKey', e.target.value)}
                              placeholder={t('settings_apiKeyPaste')}
                              className="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                            />
                            <button
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                              {showApiKey ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400">{t('settings_localOnlyGoogle')} <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-accent-DEFAULT hover:underline">Google AI Studio</a>。</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_geminiModel')}</label>
                            <button
                              type="button"
                              onClick={() => {
                                void loadModels('gemini');
                              }}
                              disabled={isLoadingModels.gemini}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200 disabled:opacity-60"
                            >
                              {isLoadingModels.gemini ? t('settings_loadingModels') : t('settings_loadModelList')}
                            </button>
                          </div>
                          <select
                            value={settings.geminiModel || 'gemini-2.0-flash-exp'}
                            onChange={(e) => onUpdateSettings({ geminiModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                          >
                            {[settings.geminiModel || 'gemini-2.0-flash-exp', ...availableModels.gemini.map((model) => model.id)]
                              .filter((value, index, array) => value && array.indexOf(value) === index)
                              .map((modelId) => {
                                const option = availableModels.gemini.find((item) => item.id === modelId);
                                return (
                                  <option key={modelId} value={modelId}>
                                    {option?.label || modelId}
                                  </option>
                                );
                              })}
                          </select>
                          <p className="text-[10px] text-gray-400">{t('settings_pickGeminiModel')}</p>
                        </div>
                      </>
                    )}

                    {settings.aiProvider === 'codex' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_openaiBaseUrl')}</label>
                          <input
                            type="text"
                            value={settings.codexApiBaseUrl || 'https://api.openai.com/v1'}
                            onChange={(e) => onUpdateSettings({ codexApiBaseUrl: e.target.value })}
                            placeholder={t('settings_openaiBaseUrlExample')}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_openaiModel')}</label>
                            <button
                              type="button"
                              onClick={() => {
                                void loadModels('codex');
                              }}
                              disabled={isLoadingModels.codex}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200 disabled:opacity-60"
                            >
                              {isLoadingModels.codex ? t('settings_loadingModels') : t('settings_loadModelList')}
                            </button>
                          </div>
                          <select
                            value={settings.codexModel || 'gpt-5.2-codex'}
                            onChange={(e) => onUpdateSettings({ codexModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                          >
                            {[settings.codexModel || 'gpt-5.2-codex', ...availableModels.codex.map((model) => model.id)]
                              .filter((value, index, array) => value && array.indexOf(value) === index)
                              .map((modelId) => {
                                const option = availableModels.codex.find((item) => item.id === modelId);
                                return (
                                  <option key={modelId} value={modelId}>
                                    {option?.label || modelId}
                                  </option>
                                );
                              })}
                          </select>
                          <p className="text-[10px] text-gray-400">{t('settings_pickOpenAIModel')}</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_openaiApiKey')}</label>
                          <div className="relative">
                            <input
                              type={showOpenAIApiKey ? 'text' : 'password'}
                              value={settings.codexApiKey || ''}
                              onChange={(e) => handleSecureSettingChange('codexApiKey', e.target.value)}
                              placeholder={t('settings_openaiApiKeyPaste')}
                              className="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                            />
                            <button
                              onClick={() => setShowOpenAIApiKey(!showOpenAIApiKey)}
                              className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                              {showOpenAIApiKey ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400">{t('settings_openaiApiKeyLocalOnly')}</p>
                        </div>
                      </>
                    )}

                    {modelLoadMessage && (
                      <p className={`text-xs ${modelLoadMessage.type === 'error' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        {modelLoadMessage.text}
                      </p>
                    )}

                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_systemPrompt')}</label>
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT })}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200"
                        >
                          {t('settings_resetDefaultPrompt')}
                        </button>
                      </div>
                      <textarea
                        value={settings.aiSystemPrompt || DEFAULT_AI_SYSTEM_PROMPT}
                        onChange={(e) => onUpdateSettings({ aiSystemPrompt: e.target.value })}
                        placeholder={t('settings_systemPromptPlaceholder')}
                        rows={10}
                        spellCheck={false}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono resize-y min-h-[220px]"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings_systemPromptDesc')}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_typography')}</h3>

                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_fontSize')}</label>
                        <span className="text-xs font-mono bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-md">{settings.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="32"
                        step="1"
                        value={settings.fontSize}
                        onChange={(e) => onUpdateSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_wordWrap')}</label>
                      <button
                        onClick={() => onUpdateSettings({ ...settings, wordWrap: !settings.wordWrap })}
                        className={`w-10 h-6 rounded-full transition-colors duration-200 relative ${
                          settings.wordWrap ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${
                          settings.wordWrap ? 'translate-x-4' : 'translate-x-0'
                        }`}>
                          <svg className="w-2.5 h-2.5 text-gray-500 m-[3px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 7h10a3 3 0 1 1 0 6H8" />
                            <polyline points="8 10 5 13 8 16" />
                          </svg>
                        </span>
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('settings_englishFont')}</label>
                        <input
                          type="text"
                          value={settings.englishFontFamily}
                          onChange={(e) => onUpdateSettings({ ...settings, englishFontFamily: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-sans"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('settings_englishFontDesc')}</p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('settings_chineseFont')}</label>
                        <input
                          type="text"
                          value={settings.chineseFontFamily}
                          onChange={(e) => onUpdateSettings({ ...settings, chineseFontFamily: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-sans"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('settings_chineseFontDesc')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_attachments')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('settings_resourceFolder')}</label>
                      <input
                        type="text"
                        value={settings.resourceFolder}
                        onChange={(e) => onUpdateSettings({ ...settings, resourceFolder: e.target.value })}
                        placeholder={t('settings_resourceFolderPlaceholder')}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_resourceFolderDesc')}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('settings_trashFolder')}</label>
                      <input
                        type="text"
                        value={settings.trashFolder}
                        onChange={(e) => onUpdateSettings({ ...settings, trashFolder: e.target.value })}
                        placeholder={t('settings_trashFolderPlaceholder')}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_trashFolderDesc')}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('settings_attachmentPasteFormat')}</label>
                      <select
                        value={settings.attachmentPasteFormat}
                        onChange={(e) => onUpdateSettings({ ...settings, attachmentPasteFormat: e.target.value as AppSettings['attachmentPasteFormat'] })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                      >
                        <option value="obsidian">{t('settings_attachmentFormatObsidian')}</option>
                        <option value="markdown">{t('settings_attachmentFormatMarkdown')}</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_attachmentPasteFormatDesc')}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_lists')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">{t('settings_orderedListMode')}</label>
                      <select
                        value={settings.orderedListMode}
                        onChange={(e) => onUpdateSettings({ ...settings, orderedListMode: e.target.value as AppSettings['orderedListMode'] })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                      >
                        <option value="strict">{t('settings_orderedListStrict')}</option>
                        <option value="loose">{t('settings_orderedListLoose')}</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_orderedListModeDesc')}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_saveFormatting')}</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="pr-4">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_formatOnManualSave')}</label>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t('settings_formatOnManualSaveDesc')}
                        </p>
                      </div>
                      <button
                        onClick={() => onUpdateSettings({ ...settings, formatMarkdownOnManualSave: !settings.formatMarkdownOnManualSave })}
                        className={`w-10 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                          settings.formatMarkdownOnManualSave ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${
                          settings.formatMarkdownOnManualSave ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_autoSave')}</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_autoSaveInterval')}</label>
                        <span className="text-xs font-mono bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-md">{formatAutoSaveInterval(settings.autoSaveInterval, t)}</span>
                      </div>
                      <input
                        type="range"
                        min="5000"
                        max="1800000"
                        step="5000"
                        value={settings.autoSaveInterval}
                        onChange={(e) => onUpdateSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
                      />
                      <div className="flex justify-between mt-1 text-xs text-gray-400">
                        <span>{t('settings_seconds', { count: 5 })}</span>
                        <span>{t('settings_minutes', { count: 30 })}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings_autoSaveDesc')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Metadata Tab */}
            {activeTab === 'metadata' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('settings_metadataTemplate')}</h3>
                      <p className="text-xs text-gray-500 mt-1">{t('settings_metadataTemplateDesc')}</p>
                    </div>
                    <button
                      onClick={handleAddMetadata}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      {t('settings_addField')}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {settings.metadataFields.map((field, idx) => (
                      <div
                        key={`${field.key}-${idx}`}
                        draggable
                        onDragStart={() => setDraggingMetadataIndex(idx)}
                        onDragEnd={() => setDraggingMetadataIndex(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggingMetadataIndex === null) return;
                          handleMoveMetadata(draggingMetadataIndex, idx);
                          setDraggingMetadataIndex(null);
                        }}
                        className={`flex gap-2 items-center bg-gray-50 dark:bg-white/5 p-2 rounded-xl border transition-colors group ${
                          draggingMetadataIndex === idx
                            ? 'border-accent-DEFAULT/50 bg-accent-DEFAULT/5'
                            : 'border-gray-100 dark:border-white/5'
                        }`}
                      >
                        <button
                          type="button"
                          title={t('settings_dragToReorder')}
                          className="p-2 text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="6" r="1" />
                            <circle cx="15" cy="6" r="1" />
                            <circle cx="9" cy="12" r="1" />
                            <circle cx="15" cy="12" r="1" />
                            <circle cx="9" cy="18" r="1" />
                            <circle cx="15" cy="18" r="1" />
                          </svg>
                        </button>
                        <input
                          type="text"
                          value={field.key}
                          onChange={(e) => handleUpdateMetadata(idx, { key: e.target.value })}
                          placeholder={t('settings_metadataKeyPlaceholder')}
                          className="w-28 shrink-0 bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
                        />
                        <span className="text-gray-400">:</span>
                        <input
                          type="text"
                          value={field.defaultValue}
                          onChange={(e) => handleUpdateMetadata(idx, { defaultValue: e.target.value })}
                          placeholder={t('settings_metadataValuePlaceholder')}
                          className="flex-1 min-w-0 bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
                          title={t('settings_metadataNowHint')}
                        />
                        <button
                          onClick={() => handleRemoveMetadata(idx)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-xs text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                    <span>{t('settings_metadataTip', { now: '{now}', nowDatetime: '{now:datetime}' })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Interface Tab */}
            {activeTab === 'interface' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_interface')}</h3>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_languageLabel')}</label>
                    <select
                      value={language}
                      onChange={(e) => {
                        const nextLanguage = e.target.value as AppSettings['language'];
                        onUpdateSettings({ language: nextLanguage });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                    >
                      <option value="zh-CN">{t('common_simplifiedChinese')}</option>
                      <option value="en">{t('common_english')}</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings_interfaceDesc')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_publishingTitle')}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings_blogRepoUrl')}
                      </label>
                      <input
                        type="text"
                        value={settings.blogRepoUrl}
                        onChange={(e) => onUpdateSettings({ blogRepoUrl: e.target.value })}
                        onBlur={() => {
                          const normalized = normalizeBlogRepoUrl(settings.blogRepoUrl);
                          if (normalized && normalized !== settings.blogRepoUrl) {
                            onUpdateSettings({ blogRepoUrl: normalized });
                          }
                        }}
                        placeholder={t('settings_blogRepoUrlPlaceholder')}
                        className={`w-full px-3 py-2 border text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all rounded-xl ${
                          isValidOrEmptyBlogRepoUrl(settings.blogRepoUrl)
                            ? 'border-gray-200 dark:border-white/10'
                            : 'border-red-500 dark:border-red-500'
                        }`}
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_blogRepoUrlDesc')}
                      </p>
                      {settings.blogRepoUrl && !isValidOrEmptyBlogRepoUrl(settings.blogRepoUrl) && (
                        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          {t('settings_blogRepoUrlInvalid')}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings_githubToken')}
                      </label>
                      <div className="relative">
                        <input
                          type={showGithubToken ? 'text' : 'password'}
                          value={settings.blogGithubToken ?? ''}
                          onChange={(e) => handleSecureSettingChange('blogGithubToken', e.target.value)}
                          placeholder="github_pat_xxx..."
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-white/10 text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all rounded-xl font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGithubToken((value) => !value)}
                          className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          title={showGithubToken ? t('settings_hideToken') : t('settings_showToken')}
                        >
                          {showGithubToken ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_githubTokenDesc')}
                      </p>
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_githubTokenPermission')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings_blogSiteUrl')}
                      </label>
                      <input
                        type="text"
                        value={settings.blogSiteUrl}
                        onChange={(e) => onUpdateSettings({ blogSiteUrl: e.target.value })}
                        onBlur={() => {
                          const normalized = normalizeBlogSiteUrl(settings.blogSiteUrl);
                          if (normalized && normalized !== settings.blogSiteUrl) {
                            onUpdateSettings({ blogSiteUrl: normalized });
                          }
                        }}
                        placeholder={t('settings_blogSiteUrlPlaceholder')}
                        className={`w-full px-3 py-2 border text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all rounded-xl ${
                          isValidOrEmptyBlogSiteUrl(settings.blogSiteUrl)
                            ? 'border-gray-200 dark:border-white/10'
                            : 'border-red-500 dark:border-red-500'
                        }`}
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t('settings_blogSiteUrlDesc')}
                      </p>
                      {settings.blogSiteUrl && !isValidOrEmptyBlogSiteUrl(settings.blogSiteUrl) && (
                        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          {t('settings_blogSiteUrlInvalid')}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 text-xs leading-6 text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                      <p>
                        {t('settings_publishGuide1').split('simple-blog')[0]}
                        <a
                          href="https://github.com/Yunz93/simple-blog"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-accent-DEFAULT hover:underline"
                        >
                          simple-blog
                        </a>
                        {t('settings_publishGuide1').split('simple-blog')[1]}
                      </p>
                      <p className="mt-2">
                        {t('settings_publishGuide2')}
                      </p>
                      <p className="mt-2">
                        {t('settings_publishGuide3')}
                      </p>
                      <p className="mt-2">
                        {t('settings_publishGuide4')}
                      </p>
                      <p className="mt-2">
                        {t('settings_publishGuide5')}
                      </p>
                    </div>

                    {!isTauriEnvironment() && (
                      <p className="rounded-xl border border-yellow-200/70 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
                        {t('settings_desktopPublishOnly')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Shortcuts Tab */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{t('settings_shortcutsTitle')}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                    {t('settings_shortcutsIntro')}
                  </p>

                  <div className="space-y-3">
                    {shortcutGroups.map((group) => {
                      const isExpanded = expandedShortcutGroups[group.id];

                      return (
                        <section
                          key={group.id}
                          className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-gray-50/70 dark:bg-white/[0.04] overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => toggleShortcutGroup(group.id)}
                            className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{group.label}</h4>
                                <span className="inline-flex items-center rounded-full bg-white/80 dark:bg-white/10 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                  {group.items.length}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.description}</p>
                            </div>
                            <svg
                              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>

                          {isExpanded && (
                            <div className="border-t border-gray-200/70 dark:border-white/10 px-4 py-3">
                              <div className="space-y-2.5">
                                {group.items.map((item) => {
                                  const editableValue = item.settingKey ? settings.shortcuts[item.settingKey] : '';
                                  const itemShortcuts = item.editable ? [editableValue] : (item.shortcuts ?? []);

                                  return (
                                    <div
                                      key={item.id}
                                      className="flex items-start justify-between gap-4 rounded-xl bg-white/85 dark:bg-black/20 px-3 py-3 border border-gray-100 dark:border-white/5"
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                                            {item.label}
                                          </span>
                                          {item.editable && (
                                            <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                              {t('settings_shortcutsEditable')}
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                          {item.description}
                                        </p>
                                      </div>

                                      {item.editable && item.settingKey ? (
                                        <input
                                          type="text"
                                          value={formatShortcutForDisplay(editableValue)}
                                          onChange={(e) => handleShortcutChange(item.settingKey, e.target.value)}
                                          aria-label={shortcutLabels[item.settingKey] || item.label}
                                          className="w-28 shrink-0 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-2.5 py-1.5 text-center font-mono text-xs uppercase tracking-wide text-gray-700 dark:text-gray-200 outline-none focus:border-accent-DEFAULT"
                                        />
                                      ) : (
                                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 max-w-[180px]">
                                          {itemShortcuts.map((shortcut) => (
                                            <span
                                              key={shortcut}
                                              className="inline-flex items-center rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 text-[11px] font-mono text-gray-600 dark:text-gray-300"
                                            >
                                              {formatShortcutForDisplay(shortcut)}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
