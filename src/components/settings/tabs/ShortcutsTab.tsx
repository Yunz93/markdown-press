import React, { useState } from 'react';
import type { AppSettings } from '../../../types';
import { useI18n } from '../../../hooks/useI18n';
import type { TranslationKey } from '../../../utils/i18n';
import {
  formatShortcutForDisplay,
  getPreferredShortcutModifierToken,
  normalizeShortcutForPlatform,
} from '../../../utils/shortcuts';
import type { SettingsTabProps } from '../types';

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
        { id: 'save', label: t('settings_saveFile'), description: t('settings_saveFileDesc'), editable: true, settingKey: 'save' },
        { id: 'toggleView', label: t('settings_toggleView'), description: t('settings_toggleViewDesc'), editable: true, settingKey: 'toggleView' },
        { id: 'toggleOutline', label: t('settings_toggleOutline'), description: t('settings_toggleOutlineDesc'), editable: true, settingKey: 'toggleOutline' },
        { id: 'toggleSidebar', label: t('settings_toggleSidebar'), description: t('settings_toggleSidebarDesc'), editable: true, settingKey: 'toggleSidebar' },
        { id: 'openKnowledgeBase', label: t('settings_openKnowledgeBase'), description: t('settings_openKnowledgeBaseDesc'), editable: true, settingKey: 'openKnowledgeBase' },
        { id: 'locateCurrentFile', label: t('settings_locateCurrentFile'), description: t('settings_locateCurrentFileDesc'), editable: true, settingKey: 'locateCurrentFile' },
        { id: 'openSettings', label: t('settings_openSettings'), description: t('settings_openSettingsDesc'), editable: true, settingKey: 'settings' },
      ],
    },
    {
      id: 'editing',
      label: t('settings_editing'),
      description: t('settings_editingDesc'),
      items: [
        { id: 'newNote', label: t('settings_newNote'), description: t('settings_newNoteDesc'), editable: true, settingKey: 'newNote' },
        { id: 'newFolder', label: t('settings_newFolder'), description: t('settings_newFolderDesc'), editable: true, settingKey: 'newFolder' },
        { id: 'closeTab', label: t('settings_closeTab'), description: t('settings_closeTabDesc'), editable: true, settingKey: 'closeTab' },
        { id: 'aiAnalyze', label: t('settings_aiEnhance'), description: t('settings_aiEnhanceDesc'), editable: true, settingKey: 'aiAnalyze' },
        { id: 'undo', label: t('settings_undo'), description: t('settings_undoDesc'), shortcuts: ['Ctrl+Z'] },
        { id: 'redo', label: t('settings_redo'), description: t('settings_redoDesc'), shortcuts: ['Ctrl+Shift+Z'] },
      ],
    },
    {
      id: 'search',
      label: t('settings_search'),
      description: t('settings_searchDesc'),
      items: [
        { id: 'search', label: t('settings_openSearch'), description: t('settings_openSearchDesc'), editable: true, settingKey: 'search' },
        { id: 'sidebarSearch', label: t('settings_sidebarSearch'), description: t('settings_sidebarSearchDesc'), editable: true, settingKey: 'sidebarSearch' },
        { id: 'nextMatch', label: t('settings_nextMatch'), description: t('settings_nextMatchDesc'), shortcuts: ['Enter'] },
        { id: 'previousMatch', label: t('settings_previousMatch'), description: t('settings_previousMatchDesc'), shortcuts: ['Shift+Enter'] },
      ],
    },
    {
      id: 'panels',
      label: t('settings_panelsAndDialogs'),
      description: t('settings_panelsAndDialogsDesc'),
      items: [
        { id: 'closePanel', label: t('settings_closeActivePanel'), description: t('settings_closeActivePanelDesc'), shortcuts: ['Escape'] },
        { id: 'exportPdf', label: t('settings_exportPdf'), description: t('settings_exportPdfDesc'), editable: true, settingKey: 'exportPdf' },
        { id: 'cleanupUnusedAttachments', label: t('settings_cleanupUnusedAttachments'), description: t('settings_cleanupUnusedAttachmentsDesc'), shortcuts: ['Cmd+Shift+-'] },
      ],
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
    exportPdf: t('settings_exportPdf'),
  };
}

export const ShortcutsTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const shortcutLabels = getShortcutLabels(t);
  const shortcutGroups = getShortcutGroups(t);
  const [expandedShortcutGroups, setExpandedShortcutGroups] = useState<Record<ShortcutGroupId, boolean>>({
    workspace: true,
    editing: true,
    search: true,
    panels: true,
  });

  const normalizeShortcut = (input: string): string => {
    const parts = input.toLowerCase().split('+').map(p => p.trim());
    const modifiers: string[] = [];
    let key = '';
    const preferredModifier = getPreferredShortcutModifierToken();

    for (const part of parts) {
      if (part === 'ctrl' || part === 'control') modifiers.push(preferredModifier);
      else if (part === 'meta' || part === 'cmd' || part === 'command') modifiers.push(preferredModifier);
      else if (part === 'shift') modifiers.push('Shift');
      else if (part === 'alt' || part === 'option') modifiers.push('Alt');
      else if (part) key = part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }

    if (!key) return '';
    return normalizeShortcutForPlatform([...modifiers, key].join('+'));
  };

  const handleShortcutChange = (shortcutKey: string, value: string) => {
    const normalized = normalizeShortcut(value);
    if (!normalized) return;
    onUpdateSettings({
      shortcuts: { ...settings.shortcuts, [shortcutKey]: normalized }
    });
  };

  const toggleShortcutGroup = (groupId: ShortcutGroupId) => {
    setExpandedShortcutGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <div className="space-y-6 animate-fade-in-02s">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{t('settings_shortcutsTitle')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t('settings_shortcutsIntro')}</p>

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
                  aria-expanded={isExpanded}
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
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
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
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.label}</span>
                                {item.editable && (
                                  <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {t('settings_shortcutsEditable')}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.description}</p>
                            </div>

                            {item.editable && item.settingKey ? (
                              <input
                                type="text"
                                value={formatShortcutForDisplay(editableValue)}
                                onChange={(e) => handleShortcutChange(item.settingKey!, e.target.value)}
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
  );
};
