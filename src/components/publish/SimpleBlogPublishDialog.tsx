import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { useI18n } from "../../hooks/useI18n";
import {
  isValidBlogRepoUrl,
  isValidBlogSiteUrl,
  isValidOrEmptyBlogRepoUrl,
  isValidOrEmptyBlogSiteUrl,
} from "../../utils/blogRepo";
import type {
  SimpleBlogPublishDefaults,
  SimpleBlogPublishInput,
} from "../../utils/simpleBlogPublish";

interface SimpleBlogPublishDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  defaults: SimpleBlogPublishDefaults | null;
  onClose: () => void;
  onSubmit: (input: SimpleBlogPublishInput) => void;
}

export const SimpleBlogPublishDialog: React.FC<
  SimpleBlogPublishDialogProps
> = ({ isOpen, isSubmitting, defaults, onClose, onSubmit }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [aliases, setAliases] = useState("");
  const [blogRepoUrl, setBlogRepoUrl] = useState("");
  const [blogSiteUrl, setBlogSiteUrl] = useState("");
  const [blogGithubToken, setBlogGithubToken] = useState("");
  const [showGithubToken, setShowGithubToken] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !defaults) {
      return;
    }

    setTitle(defaults.title);
    setSlug(defaults.slug);
    setAliases(defaults.aliases);
    setBlogRepoUrl(defaults.blogRepoUrl);
    setBlogSiteUrl(defaults.blogSiteUrl);
    setBlogGithubToken(defaults.blogGithubToken);
    setShowGithubToken(false);

    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [defaults, isOpen]);

  const canSubmit = useMemo(() => {
    return (
      Boolean(title.trim()) &&
      isValidBlogRepoUrl(blogRepoUrl) &&
      isValidBlogSiteUrl(blogSiteUrl) &&
      Boolean(blogGithubToken.trim())
    );
  }, [blogGithubToken, blogRepoUrl, blogSiteUrl, title]);

  const handleSubmit = () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    onSubmit({
      title: title.trim(),
      slug: slug.trim(),
      aliases: aliases.trim(),
      blogRepoUrl: blogRepoUrl.trim(),
      blogSiteUrl: blogSiteUrl.trim(),
      blogGithubToken: blogGithubToken.trim(),
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("simpleBlogDialog_title")}
      className="max-w-2xl"
      contentClassName="py-3"
      contentScroll
    >
      <div className="publish-form-panel flex min-h-0 h-full flex-col">
        <div className="-mx-1 space-y-3 px-1">
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            {t("simpleBlogDialog_desc")}
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("settings_blogRepoUrl")}
            </label>
            <input
              type="text"
              value={blogRepoUrl}
              onChange={(event) => setBlogRepoUrl(event.target.value)}
              placeholder={t("settings_blogRepoUrlPlaceholder")}
              className={`w-full rounded-xl border px-3 py-2 text-sm transition-all focus:border-accent-DEFAULT focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 bg-white dark:bg-white/5 ${
                isValidOrEmptyBlogRepoUrl(blogRepoUrl)
                  ? "border-gray-200 dark:border-white/10"
                  : "border-red-500 dark:border-red-500"
              }`}
            />
            {blogRepoUrl && !isValidOrEmptyBlogRepoUrl(blogRepoUrl) && (
              <p className="mt-1.5 text-xs text-red-500">
                {t("settings_blogRepoUrlInvalid")}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("settings_githubToken")}
            </label>
            <div className="relative">
              <input
                type={showGithubToken ? "text" : "password"}
                value={blogGithubToken}
                onChange={(event) => setBlogGithubToken(event.target.value)}
                placeholder="github_pat_xxx..."
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-10 text-sm font-mono transition-all focus:border-accent-DEFAULT focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 dark:border-white/10 dark:bg-white/5"
              />
              <button
                type="button"
                onClick={() => setShowGithubToken((value) => !value)}
                className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title={
                  showGithubToken
                    ? t("settings_hideToken")
                    : t("settings_showToken")
                }
                aria-label={
                  showGithubToken
                    ? t("settings_hideToken")
                    : t("settings_showToken")
                }
              >
                {showGithubToken ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("settings_blogSiteUrl")}
            </label>
            <input
              type="text"
              value={blogSiteUrl}
              onChange={(event) => setBlogSiteUrl(event.target.value)}
              placeholder={t("settings_blogSiteUrlPlaceholder")}
              className={`w-full rounded-xl border px-3 py-2 text-sm transition-all focus:border-accent-DEFAULT focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 bg-white dark:bg-white/5 ${
                isValidOrEmptyBlogSiteUrl(blogSiteUrl)
                  ? "border-gray-200 dark:border-white/10"
                  : "border-red-500 dark:border-red-500"
              }`}
            />
            {blogSiteUrl && !isValidOrEmptyBlogSiteUrl(blogSiteUrl) && (
              <p className="mt-1.5 text-xs text-red-500">
                {t("settings_blogSiteUrlInvalid")}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("simpleBlogDialog_titleLabel")}
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("simpleBlogDialog_slugLabel")}
              </label>
              <input
                type="text"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t("simpleBlogDialog_slugDesc")}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("simpleBlogDialog_aliasesLabel")}
              </label>
              <input
                type="text"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2 text-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all"
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t("simpleBlogDialog_aliasesDesc")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 justify-end gap-3 border-t border-gray-200/50 pt-3 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-black transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
          >
            {isSubmitting
              ? t("toolbar_publishing")
              : t("simpleBlogDialog_submit")}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
