import React, { useState } from 'react';
import type { AppSettings } from '../../../types';
import { DEFAULT_AI_SYSTEM_PROMPT } from '../../../services/aiPrompts';
import { fetchAvailableModels, type ModelOption } from '../../../services/modelCatalogService';
import { hydrateSensitiveSettingsIntoStore } from '../../../services/secureSettingsService';
import { useI18n } from '../../../hooks/useI18n';
import { useAppStore } from '../../../store/appStore';
import type { SettingsTabProps } from '../types';
import { useSecureSettings } from '../useSecureSettings';

export const AITab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const { handleSecureSettingChange, renderSecureSaveState } = useSecureSettings(onUpdateSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOpenAIApiKey, setShowOpenAIApiKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<Record<'gemini' | 'codex', ModelOption[]>>({
    gemini: [],
    codex: [],
  });
  const [isLoadingModels, setIsLoadingModels] = useState<Record<'gemini' | 'codex', boolean>>({
    gemini: false,
    codex: false,
  });
  const [modelLoadMessage, setModelLoadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadModels = async (provider: 'gemini' | 'codex') => {
    try {
      setModelLoadMessage(null);
      setIsLoadingModels((prev) => ({ ...prev, [provider]: true }));
      await hydrateSensitiveSettingsIntoStore();
      const latestSettings = useAppStore.getState().settings;
      const models = await fetchAvailableModels(provider, latestSettings);
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

  const EyeIcon = ({ visible }: { visible: boolean }) => (
    visible ? (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ) : (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    )
  );

  return (
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
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    <EyeIcon visible={showApiKey} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">{t('settings_localOnlyGoogle')} <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-accent-DEFAULT hover:underline">Google AI Studio</a>。</p>
                {renderSecureSaveState('geminiApiKey')}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings_geminiModel')}</label>
                  <button
                    type="button"
                    onClick={() => { void loadModels('gemini'); }}
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
                      return <option key={modelId} value={modelId}>{option?.label || modelId}</option>;
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
                    onClick={() => { void loadModels('codex'); }}
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
                      return <option key={modelId} value={modelId}>{option?.label || modelId}</option>;
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
                    aria-label={showOpenAIApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    <EyeIcon visible={showOpenAIApiKey} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">{t('settings_openaiApiKeyLocalOnly')}</p>
                {renderSecureSaveState('codexApiKey')}
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
  );
};
