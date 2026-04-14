import React from 'react';
import type { AppSettings } from '../../../types';
import {
  DEFAULT_UI_FONT_FAMILY,
  getResolvedUiFontFamily,
} from '../../../utils/fontSettings';
import { useI18n } from '../../../hooks/useI18n';
import type { SettingsTabProps } from '../types';
import { useFontOptions } from '../useFontOptions';

interface InterfaceTabProps extends SettingsTabProps {
  isOpen: boolean;
}

export const InterfaceTab: React.FC<InterfaceTabProps> = ({
  settings,
  onUpdateSettings,
  isOpen,
}) => {
  const { t, language } = useI18n();
  const { buildFontOptions, isLoadingSystemFonts } = useFontOptions(isOpen);

  const currentUiFontValue = settings.uiFontFamily?.trim() || DEFAULT_UI_FONT_FAMILY;
  const uiFontOptions = buildFontOptions(currentUiFontValue);

  return (
    <div className="space-y-6 animate-fade-in-02s">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings_interface')}</h3>
        <div className="space-y-5">
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_uiFont')}</label>
              {isLoadingSystemFonts && (
                <span className="text-[11px] text-gray-400">{t('common_loading')}</span>
              )}
            </div>
            <select
              value={currentUiFontValue}
              onChange={(e) => onUpdateSettings({ uiFontFamily: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
            >
              {uiFontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings_uiFontDesc')}</p>
            <div
              className="rounded-2xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200"
              style={{ fontFamily: getResolvedUiFontFamily(settings) }}
            >
              {t('settings_uiFontPreview')}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_uiFontSize')}</label>
              <span className="text-xs font-mono bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-md">{settings.uiFontSize}px</span>
            </div>
            <input
              type="range"
              min="12"
              max="22"
              step="1"
              value={settings.uiFontSize}
              onChange={(e) => onUpdateSettings({ uiFontSize: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('settings_uiFontSizeDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
