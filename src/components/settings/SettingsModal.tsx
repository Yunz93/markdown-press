import React, { useState } from 'react';
import type { AppSettings, MetadataField } from '../../types';

function formatAutoSaveInterval(intervalMs: number): string {
  if (intervalMs < 60000) {
    return `${Math.round(intervalMs / 1000)}s`;
  }

  const minutes = intervalMs / 60000;
  return Number.isInteger(minutes) ? `${minutes}min` : `${minutes.toFixed(1)}min`;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

type SettingsTab = 'general' | 'editor' | 'metadata' | 'shortcuts' | 'ai';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: React.FC<{ size: number }>;
}

const tabs: TabConfig[] = [
  { id: 'editor', label: 'Editor', icon: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  )},
  { id: 'ai', label: 'AI Enhance', icon: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  )},
  { id: 'metadata', label: 'Metadata', icon: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )},
  { id: 'shortcuts', label: 'Shortcuts', icon: (props) => (
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
  )},
  { id: 'general', label: 'Publishing', icon: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )},
];

const shortcutLabels: Record<string, string> = {
  save: 'Save File',
  toggleView: 'Toggle View Mode',
  aiAnalyze: 'AI Enhance',
  search: 'Search',
  settings: 'Open Settings',
  toggleOutline: 'Toggle Outline',
  toggleSidebar: 'Toggle Sidebar',
  newNote: 'New Note',
  newFolder: 'New Folder',
  closeTab: 'Close Tab',
  openKnowledgeBase: 'Open Knowledge Base',
  exportHtml: 'Export HTML',
};

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

const shortcutGroups: ShortcutGroupConfig[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Core app actions and view switching.',
    items: [
      {
        id: 'save',
        label: 'Save File',
        description: 'Save the current note to disk.',
        editable: true,
        settingKey: 'save',
      },
      {
        id: 'toggleView',
        label: 'Toggle View Mode',
        description: 'Cycle through Editor, Split, and Preview modes.',
        editable: true,
        settingKey: 'toggleView',
      },
      {
        id: 'toggleOutline',
        label: 'Toggle Outline',
        description: 'Show or hide the document outline panel when available.',
        editable: true,
        settingKey: 'toggleOutline',
      },
      {
        id: 'toggleSidebar',
        label: 'Toggle Sidebar',
        description: 'Show or hide the file sidebar.',
        editable: true,
        settingKey: 'toggleSidebar',
      },
      {
        id: 'openKnowledgeBase',
        label: 'Open Knowledge Base',
        description: 'Switch to another local knowledge base folder.',
        editable: true,
        settingKey: 'openKnowledgeBase',
      },
      {
        id: 'openSettings',
        label: 'Open Settings',
        description: 'Open the settings dialog.',
        editable: true,
        settingKey: 'settings',
      },
    ],
  },
  {
    id: 'editing',
    label: 'Editing',
    description: 'Writing and content-editing shortcuts.',
    items: [
      {
        id: 'newNote',
        label: 'New Note',
        description: 'Create a new note at the vault root.',
        editable: true,
        settingKey: 'newNote',
      },
      {
        id: 'newFolder',
        label: 'New Folder',
        description: 'Create a new folder at the vault root.',
        editable: true,
        settingKey: 'newFolder',
      },
      {
        id: 'closeTab',
        label: 'Close Tab',
        description: 'Close the current open tab.',
        editable: true,
        settingKey: 'closeTab',
      },
      {
        id: 'aiAnalyze',
        label: 'AI Enhance',
        description: 'Run AI enhancement on the current note.',
        editable: true,
        settingKey: 'aiAnalyze',
      },
      {
        id: 'undo',
        label: 'Undo',
        description: 'Revert the most recent content change.',
        shortcuts: ['Ctrl+Z'],
      },
      {
        id: 'redo',
        label: 'Redo',
        description: 'Reapply the last undone change.',
        shortcuts: ['Ctrl+Shift+Z'],
      },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Open search and navigate between matches.',
    items: [
      {
        id: 'search',
        label: 'Open Search',
        description: 'Open the in-note search panel.',
        editable: true,
        settingKey: 'search',
      },
      {
        id: 'nextMatch',
        label: 'Next Match',
        description: 'Jump to the next search result in the search panel.',
        shortcuts: ['Enter'],
      },
      {
        id: 'previousMatch',
        label: 'Previous Match',
        description: 'Jump to the previous search result in the search panel.',
        shortcuts: ['Shift+Enter'],
      },
    ],
  },
  {
    id: 'panels',
    label: 'Panels & Dialogs',
    description: 'Dismiss transient UI such as search, dialogs, and menus.',
    items: [
      {
        id: 'closePanel',
        label: 'Close Active Panel',
        description: 'Close the active search panel, dialog, or context menu.',
        shortcuts: ['Escape'],
      },
      {
        id: 'exportHtml',
        label: 'Export HTML',
        description: 'Export the current preview as a standalone HTML document.',
        editable: true,
        settingKey: 'exportHtml',
      },
    ],
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('editor');
  const [showApiKey, setShowApiKey] = useState(false);
  const [expandedShortcutGroups, setExpandedShortcutGroups] = useState<Record<ShortcutGroupId, boolean>>({
    workspace: true,
    editing: true,
    search: true,
    panels: true,
  });

  // Normalize shortcut input to standard format (e.g., "Ctrl+S")
  const normalizeShortcut = (input: string): string => {
    const parts = input.toLowerCase().split('+').map(p => p.trim());
    const modifiers: string[] = [];
    let key = '';

    for (const part of parts) {
      if (part === 'ctrl' || part === 'meta' || part === 'command') {
        modifiers.push('Ctrl');
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
    return [...modifiers, key].join('+');
  };

  const handleShortcutChange = (key: string, value: string) => {
    const normalized = normalizeShortcut(value);
    if (!normalized) return;
    onUpdateSettings({
      shortcuts: { ...settings.shortcuts, [key]: normalized }
    });
  };

  const toggleShortcutGroup = (groupId: ShortcutGroupId) => {
    setExpandedShortcutGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const isValidGithubRepo = (repo: string): boolean => {
    if (!repo.trim()) return true; // Allow empty
    return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(repo.trim());
  };

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in-02s">
      <div
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-scale-in flex h-[600px] max-h-[90vh] border border-gray-200/50 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-56 bg-gray-50/50 dark:bg-black/20 border-r border-gray-200/50 dark:border-white/5 flex flex-col p-3 gap-1 shrink-0">
          <div className="px-3 py-4 mb-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h2>
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
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">AI Content Enhancement</h3>
                  <p className="text-sm text-gray-500 mb-6">Use the configured Gemini model to optimize markdown formatting, fix spelling, and refresh SEO metadata.</p>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gemini API Key</label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={settings.geminiApiKey || ''}
                          onChange={(e) => onUpdateSettings({ ...settings, geminiApiKey: e.target.value })}
                          placeholder="Paste your API key here..."
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
                      <p className="text-[10px] text-gray-400">Your API key is stored locally and never shared. Get one from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-accent-DEFAULT hover:underline">Google AI Studio</a>.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gemini Model</label>
                      <input
                        type="text"
                        value={settings.geminiModel || 'gemini-2.0-flash-exp'}
                        onChange={(e) => onUpdateSettings({ ...settings, geminiModel: e.target.value })}
                        placeholder="gemini-2.0-flash-exp"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                      />
                      <p className="text-[10px] text-gray-400">Example: <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">gemini-2.0-flash-exp</code></p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Typography</h3>

                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Font Size</label>
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
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Word Wrap</label>
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
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">English Font</label>
                        <input
                          type="text"
                          value={settings.englishFontFamily}
                          onChange={(e) => onUpdateSettings({ ...settings, englishFontFamily: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-sans"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used primarily for Latin letters, numbers, and symbols.</p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Chinese Font</label>
                        <input
                          type="text"
                          value={settings.chineseFontFamily}
                          onChange={(e) => onUpdateSettings({ ...settings, chineseFontFamily: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-sans"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Default is the bundled LXGW WenKai font, shipped with the app for consistent Chinese rendering.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Attachments</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Resource Folder</label>
                      <input
                        type="text"
                        value={settings.resourceFolder}
                        onChange={(e) => onUpdateSettings({ ...settings, resourceFolder: e.target.value })}
                        placeholder="resources"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all font-mono"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Clipboard images are saved into this folder inside the current knowledge base.
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Attachment Paste Format</label>
                      <select
                        value={settings.attachmentPasteFormat}
                        onChange={(e) => onUpdateSettings({ ...settings, attachmentPasteFormat: e.target.value as AppSettings['attachmentPasteFormat'] })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
                      >
                        <option value="obsidian">Obsidian: ![[path/to/image.png]]</option>
                        <option value="markdown">Markdown: ![](&lt;path/to/image.png&gt;)</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Choose whether pasted image attachments use Obsidian embeds or standard Markdown image syntax.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Auto-Save</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Save Interval</label>
                        <span className="text-xs font-mono bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-md">{formatAutoSaveInterval(settings.autoSaveInterval)}</span>
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
                        <span>5s</span>
                        <span>30min</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Changes are automatically saved to disk after the specified delay.
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
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">Metadata Templates</h3>
                      <p className="text-xs text-gray-500 mt-1">Properties added to frontmatter when creating new files.</p>
                    </div>
                    <button
                      onClick={handleAddMetadata}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Field
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {settings.metadataFields.map((field, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-gray-50 dark:bg-white/5 p-2 rounded-xl border border-gray-100 dark:border-white/5 group">
                        <input
                          type="text"
                          value={field.key}
                          onChange={(e) => handleUpdateMetadata(idx, { key: e.target.value })}
                          placeholder="Key (e.g., tags)"
                          className="flex-1 bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
                        />
                        <span className="text-gray-400">:</span>
                        <input
                          type="text"
                          value={field.defaultValue}
                          onChange={(e) => handleUpdateMetadata(idx, { defaultValue: e.target.value })}
                          placeholder="Value (e.g., draft)"
                          className="flex-1 bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
                          title="Use {now} for current date"
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
                    <span>Tip: Use <code className="bg-gray-100 dark:bg-white/10 px-1 rounded text-gray-600 dark:text-gray-300">{'{now}'}</code> for the current date.</span>
                  </div>
                </div>
              </div>
            )}

            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6 animate-fade-in-02s">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">GitHub Pages</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Repository</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                      </svg>
                      <input
                        type="text"
                        value={settings.githubRepo}
                        onChange={(e) => {
                          const repo = e.target.value;
                          if (isValidGithubRepo(repo)) {
                            onUpdateSettings({ githubRepo: repo });
                          }
                        }}
                        placeholder="username/repo"
                        className={`w-full pl-9 pr-3 py-2 border text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all rounded-xl ${
                          isValidGithubRepo(settings.githubRepo)
                            ? 'border-gray-200 dark:border-white/10'
                            : 'border-red-500 dark:border-red-500'
                        }`}
                      />
                    </div>
                    {settings.githubRepo && !isValidGithubRepo(settings.githubRepo) && (
                      <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        Please use the format "username/repo"
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
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Key Bindings</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                    Shortcuts are grouped by workflow. Editable shortcuts can be changed here; built-in shortcuts are shown for reference.
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
                                              Custom
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
                                          value={editableValue}
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
                                              {shortcut}
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
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
