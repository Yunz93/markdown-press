import React, { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Dialog } from '../ui/Dialog';
import { useI18n } from '../../hooks/useI18n';
import { isTauriEnvironment } from '../../types/filesystem';
import type { WechatDraftDefaults, WechatDraftPublishInput } from '../../utils/wechatPublish';

interface WechatDraftDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  defaults: WechatDraftDefaults | null;
  onClose: () => void;
  onSubmit: (input: WechatDraftPublishInput) => void;
}

export const WechatDraftDialog: React.FC<WechatDraftDialogProps> = ({
  isOpen,
  isSubmitting,
  defaults,
  onClose,
  onSubmit,
}) => {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [digest, setDigest] = useState('');
  const [contentSourceUrl, setContentSourceUrl] = useState('');
  const [showCoverPic, setShowCoverPic] = useState(true);
  const [coverImagePath, setCoverImagePath] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !defaults) {
      return;
    }

    setTitle(defaults.title);
    setAuthor(defaults.author);
    setDigest(defaults.digest);
    setContentSourceUrl(defaults.contentSourceUrl);
    setShowCoverPic(defaults.showCoverPic);
    setCoverImagePath('');

    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [defaults, isOpen]);

  const handlePickCover = async () => {
    if (!isTauriEnvironment()) {
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    });

    const path = typeof selected === 'string' ? selected : null;
    if (!path) {
      return;
    }

    await invoke('register_allowed_path', { path, recursive: false });
    setCoverImagePath(path);
  };

  const handleSubmit = () => {
    onSubmit({
      title: title.trim(),
      author: author.trim(),
      digest: digest.trim(),
      contentSourceUrl: contentSourceUrl.trim(),
      showCoverPic,
      coverImagePath: coverImagePath.trim(),
      existingDraftMediaId: defaults?.existingDraftMediaId || '',
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('wechatDraftDialog_title')}
      className="max-w-2xl"
    >
      <div className="flex min-h-0 h-full flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-4">
          <p className="text-sm leading-7 text-gray-500 dark:text-gray-400">{t('wechatDraftDialog_desc')}</p>

          {defaults?.existingDraftMediaId && (
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              {t('wechatDraftDialog_updateHint')}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('wechatDraftDialog_titleLabel')}
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('wechatDraftDialog_authorLabel')}
              </label>
              <input
                type="text"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('wechatDraftDialog_sourceUrlLabel')}
              </label>
              <input
                type="text"
                value={contentSourceUrl}
                onChange={(event) => setContentSourceUrl(event.target.value)}
                placeholder="https://"
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('wechatDraftDialog_digestLabel')}
            </label>
            <textarea
              value={digest}
              onChange={(event) => setDigest(event.target.value)}
              rows={5}
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all resize-y min-h-32"
            />
          </div>

          <div className="rounded-2xl border border-gray-200/70 bg-gray-50/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-56">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{t('wechatDraftDialog_coverLabel')}</div>
                <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">{t('wechatDraftDialog_coverDesc')}</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showCoverPic}
                  onChange={(event) => setShowCoverPic(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-accent-DEFAULT focus:ring-accent-DEFAULT/30"
                />
                {t('wechatDraftDialog_showCover')}
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => { void handlePickCover(); }}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-white/[0.03] px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t('wechatDraftDialog_pickCover')}
              </button>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {coverImagePath || t('wechatDraftDialog_coverEmpty')}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-3 border-t border-gray-200/50 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('common_cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !coverImagePath.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-black transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
          >
            {isSubmitting ? t('toolbar_publishing') : t('wechatDraftDialog_submit')}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
