import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import type { AppSettings, MetadataField } from '../types';

/**
 * Hook for settings management
 */
export function useSettings() {
  const { settings, setSettings, updateSettings, isSettingsOpen, setSettingsOpen } = useAppStore();

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  const toggleTheme = useCallback(() => {
    updateSettings((state) => {
      const current = state.settings.themeMode;
      return {
        themeMode: current === 'dark' ? 'light' : 'dark'
      };
    });
  }, [updateSettings]);

  const updateFontSize = useCallback((fontSize: number) => {
    updateSettings({ fontSize });
  }, [updateSettings]);

  const toggleWordWrap = useCallback(() => {
    updateSettings((state) => ({ wordWrap: !state.settings.wordWrap }));
  }, [updateSettings]);

  const updateFontFamily = useCallback((fontFamily: string) => {
    updateSettings({ fontFamily });
  }, [updateSettings]);

  const updateGithubRepo = useCallback((githubRepo: string) => {
    updateSettings({ githubRepo });
  }, [updateSettings]);

  const updateShortcuts = useCallback((shortcuts: AppSettings['shortcuts']) => {
    updateSettings({ shortcuts });
  }, [updateSettings]);

  const updateMetadataFields = useCallback((metadataFields: MetadataField[]) => {
    updateSettings({ metadataFields });
  }, [updateSettings]);

  const addMetadataField = useCallback((key: string, defaultValue: string) => {
    updateSettings((state) => ({
      metadataFields: [...state.settings.metadataFields, { key, defaultValue }]
    }));
  }, [updateSettings]);

  const removeMetadataField = useCallback((index: number) => {
    updateSettings((state) => {
      if (index < 0 || index >= state.settings.metadataFields.length) return {};
      const newFields = state.settings.metadataFields.filter((_, i) => i !== index);
      return { metadataFields: newFields };
    });
  }, [updateSettings]);

  const updateMetadataField = useCallback((index: number, updates: Partial<MetadataField>) => {
    updateSettings((state) => {
      if (index < 0 || index >= state.settings.metadataFields.length) return {};
      const newFields = state.settings.metadataFields.map((field, i) =>
        i === index ? { ...field, ...updates } : field
      );
      return { metadataFields: newFields };
    });
  }, [updateSettings]);

  return {
    settings,
    setSettings,
    updateSettings,
    isSettingsOpen,
    openSettings,
    closeSettings,
    toggleTheme,
    updateFontSize,
    toggleWordWrap,
    updateFontFamily,
    updateGithubRepo,
    updateShortcuts,
    updateMetadataFields,
    addMetadataField,
    removeMetadataField,
    updateMetadataField,
  };
}
