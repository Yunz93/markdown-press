import React, { useState } from 'react';
import { isTauriEnvironment } from '../../../types/filesystem';
import {
  isValidOrEmptyBlogRepoUrl,
  isValidOrEmptyBlogSiteUrl,
  normalizeBlogRepoUrl,
  normalizeBlogSiteUrl,
} from '../../../utils/blogRepo';
import { useI18n } from '../../../hooks/useI18n';
import type { SettingsTabProps } from '../types';
import { useSecureSettings } from '../useSecureSettings';

export const PublishingTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const { handleSecureSettingChange, renderSecureSaveState } = useSecureSettings(onUpdateSettings);
  const [showGithubToken, setShowGithubToken] = useState(false);

  return (
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
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('settings_blogRepoUrlDesc')}</p>
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
                aria-label={showGithubToken ? t('settings_hideToken') : t('settings_showToken')}
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
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('settings_githubTokenDesc')}</p>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{t('settings_githubTokenPermission')}</p>
            {renderSecureSaveState('blogGithubToken')}
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
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('settings_blogSiteUrlDesc')}</p>
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
            <p className="mt-2">{t('settings_publishGuide2')}</p>
            <p className="mt-2">{t('settings_publishGuide3')}</p>
            <p className="mt-2">{t('settings_publishGuide4')}</p>
            <p className="mt-2">{t('settings_publishGuide5')}</p>
          </div>

          {!isTauriEnvironment() && (
            <p className="rounded-xl border border-yellow-200/70 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
              {t('settings_desktopPublishOnly')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
