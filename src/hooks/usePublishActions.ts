import { useCallback, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { hydrateSensitiveSettingsIntoStore } from "../services/secureSettingsService";
import {
  generateFrontmatter,
  parseFrontmatter,
  updateFrontmatter,
} from "../utils/frontmatter";
import { type Frontmatter } from "../types";
import {
  buildSimpleBlogPostUrl,
  prepareSimpleBlogPublish,
} from "../utils/simpleBlogPublish";
import {
  prepareWechatDraftPublish,
  type WechatDraftPublishInput,
} from "../utils/wechatPublish";
import { replaceLocalImagesWithHostingForPublish } from "../utils/publishLocalImagesToHosting";
import { getFileSystem, isTauriEnvironment } from "../types/filesystem";
import {
  isValidBlogRepoUrl,
  isValidBlogSiteUrl,
  normalizeBlogRepoUrl,
  normalizeBlogSiteUrl,
} from "../utils/blogRepo";
import { refreshDocumentUpdateTime } from "../utils/metadataFields";
import { localizeKnownError, t, type TranslationKey } from "../utils/i18n";
import { findFileInTree } from "../utils/fileTree";
import { isMarkdownFile } from "../utils/fileTypes";

// Publishing can legitimately take a while (image uploads, GitHub tree
// writes). Keep the timeout generous - a premature timeout is worse than a
// slow publish because the backend command keeps running either way.
const PUBLISH_TIMEOUT_MS = 120000;

/**
 * Thrown when the UI stops waiting for a publish command. The backend
 * invocation is NOT cancelled and may still succeed remotely, so callers
 * must not roll back local publish state on this error.
 */
class PublishTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishTimeoutError";
  }
}

/**
 * Encapsulates blog and WeChat publish actions.
 * Split out of useExportActions to keep export and publish concerns separate.
 */
export function usePublishActions(
  forceSave: (
    contentOverride?: string,
    options?: {
      formatBeforeSave?: boolean;
      trigger?: "auto" | "manual" | "system";
    },
  ) => Promise<boolean>,
) {
  const {
    files,
    activeTabId,
    settings,
    setContentForFile,
    setPublishing,
    showNotification,
  } = useAppStore();
  const publishInFlightRef = useRef<Promise<unknown> | null>(null);

  const invokePublishWithTimeout = useCallback(
    async <T>(
      command: string,
      payload: Record<string, unknown>,
      timeoutTranslationKey: TranslationKey = "notifications_publishTimeout",
    ): Promise<T> => {
      if (publishInFlightRef.current) {
        const lang = useAppStore.getState().settings.language;
        throw new Error(t(lang, "notifications_publishInProgress"));
      }

      const { invoke } = await import("@tauri-apps/api/core");

      let timeoutId: number | null = null;
      const publishPromise = invoke<T>(command, payload);
      publishInFlightRef.current = publishPromise;
      void publishPromise.finally(() => {
        if (publishInFlightRef.current === publishPromise) {
          publishInFlightRef.current = null;
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          const lang = useAppStore.getState().settings.language;
          reject(new PublishTimeoutError(t(lang, timeoutTranslationKey)));
        }, PUBLISH_TIMEOUT_MS);
      });

      try {
        return await Promise.race([publishPromise, timeoutPromise]);
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }
    },
    [],
  );

  const backfillFrontmatter = useCallback(
    async (
      fileId: string,
      filePath: string,
      updates: Frontmatter,
      backfillFailedKey: TranslationKey,
    ) => {
      const stateBeforeWrite = useAppStore.getState();
      const latestContent = stateBeforeWrite.fileContents[fileId];
      if (!latestContent) {
        return false;
      }

      const linkedContent = refreshDocumentUpdateTime(
        updateFrontmatter(latestContent, updates),
      );
      if (linkedContent === latestContent) {
        return true;
      }

      try {
        const fs = await getFileSystem();
        await fs.writeFile(filePath, linkedContent);

        const stateAfterWrite = useAppStore.getState();
        if (!stateAfterWrite.openTabs.includes(fileId)) {
          return true;
        }

        stateAfterWrite.updateTabContent(fileId, linkedContent);
        stateAfterWrite.markAsSaved(fileId, linkedContent);
        return true;
      } catch (error) {
        console.error("Failed to backfill publish metadata:", error);
        useAppStore
          .getState()
          .showNotification(t(settings.language, backfillFailedKey), "error");
        return false;
      }
    },
    [settings.language],
  );

  const handlePublishSimpleBlog = useCallback(async () => {
    const hydratedSettings = await hydrateSensitiveSettingsIntoStore();
    const targetTabId = activeTabId;

    if (!targetTabId) {
      showNotification(
        t(hydratedSettings.language, "notifications_noFileToPublish"),
        "error",
      );
      return;
    }

    if (!isTauriEnvironment()) {
      showNotification(
        t(hydratedSettings.language, "notifications_desktopPublishOnly"),
        "error",
      );
      return;
    }

    if (!hydratedSettings.blogRepoUrl.trim()) {
      showNotification(
        t(hydratedSettings.language, "notifications_setBlogRepoFirst"),
        "error",
      );
      return;
    }

    if (!isValidBlogRepoUrl(hydratedSettings.blogRepoUrl)) {
      showNotification(
        t(hydratedSettings.language, "notifications_setValidBlogRepoFirst"),
        "error",
      );
      return;
    }

    if (!hydratedSettings.blogSiteUrl.trim()) {
      showNotification(
        t(hydratedSettings.language, "notifications_setBlogSiteFirst"),
        "error",
      );
      return;
    }

    if (!isValidBlogSiteUrl(hydratedSettings.blogSiteUrl)) {
      showNotification(
        t(hydratedSettings.language, "notifications_setValidBlogSiteFirst"),
        "error",
      );
      return;
    }

    if (!hydratedSettings.blogGithubToken?.trim()) {
      showNotification(
        t(hydratedSettings.language, "notifications_setGithubTokenFirst"),
        "error",
      );
      return;
    }

    const currentContent = useAppStore.getState().fileContents[targetTabId];
    if (!currentContent) {
      showNotification(
        t(hydratedSettings.language, "notifications_noContentToPublish"),
        "error",
      );
      return;
    }

    const activeFile = findFileInTree(files, targetTabId);
    if (!activeFile) {
      showNotification(
        t(hydratedSettings.language, "notifications_noFileToPublish"),
        "error",
      );
      return;
    }

    if (!isMarkdownFile(activeFile.name)) {
      showNotification(
        t(hydratedSettings.language, "notifications_exportMarkdownOnly"),
        "error",
      );
      return;
    }

    setPublishing(true);
    let publishCheckpointContent: string | null = null;
    const rollbackPublishCheckpoint = async () => {
      if (publishCheckpointContent === null) return;
      setContentForFile(targetTabId, publishCheckpointContent);
      await forceSave(publishCheckpointContent, { trigger: "system" });
    };

    try {
      const { frontmatter, body } = parseFrontmatter(currentContent);
      const merged: Frontmatter = {
        ...(frontmatter || {}),
        is_publish: true,
      };
      const nextContent = `${generateFrontmatter(merged)}${body}`;
      const previousContent = currentContent;
      publishCheckpointContent = previousContent;

      setContentForFile(targetTabId, nextContent);
      const saved = await forceSave(nextContent, { trigger: "system" });
      if (!saved) {
        setContentForFile(targetTabId, previousContent);
        showNotification(
          t(hydratedSettings.language, "notifications_saveBeforePublishFailed"),
          "error",
        );
        return;
      }

      const storeState = useAppStore.getState();
      const contentToPublish =
        storeState.fileContents[targetTabId] ?? nextContent;
      const latestFiles = storeState.files;
      const latestRootFolderPath = storeState.rootFolderPath;

      const hostingResult = await replaceLocalImagesWithHostingForPublish(
        contentToPublish,
        {
          files: latestFiles,
          rootFolderPath: latestRootFolderPath,
          currentFilePath: activeFile.path,
          settings: hydratedSettings,
        },
      );

      if (!hostingResult.ok) {
        await rollbackPublishCheckpoint();
        if (hostingResult.reason === "hosting_not_configured") {
          showNotification(
            t(
              hydratedSettings.language,
              "notifications_imageHostingNotConfigured",
            ),
            "error",
          );
        } else {
          showNotification(
            t(hydratedSettings.language, "notifications_imageUploadFailed", {
              error: hostingResult.message,
            }),
            "error",
          );
        }
        return;
      }

      let markdownForPublish = hostingResult.markdown;
      if (markdownForPublish !== contentToPublish) {
        const beforeHostingContent =
          useAppStore.getState().fileContents[targetTabId] ?? contentToPublish;

        setContentForFile(targetTabId, markdownForPublish);
        const savedHosting = await forceSave(markdownForPublish, {
          trigger: "system",
        });
        if (!savedHosting) {
          await rollbackPublishCheckpoint();
          setContentForFile(targetTabId, beforeHostingContent);
          showNotification(
            t(
              hydratedSettings.language,
              "notifications_saveBeforePublishFailed",
            ),
            "error",
          );
          return;
        }
        markdownForPublish =
          useAppStore.getState().fileContents[targetTabId] ??
          markdownForPublish;
      }

      const prepared = await prepareSimpleBlogPublish({
        files: latestFiles,
        blogSiteUrl: normalizeBlogSiteUrl(hydratedSettings.blogSiteUrl),
        rootFolderPath: latestRootFolderPath,
        currentFilePath: activeFile.path,
        markdownContent: markdownForPublish,
        markdownStylePreset: storeState.settings.markdownStylePreset,
      });

      if (prepared.unresolvedImages.length > 0) {
        console.warn(
          "[publish] unresolved local images:",
          prepared.unresolvedImages,
        );
      }

      await invokePublishWithTimeout<{ deploymentUrl?: string | null }>(
        "publish_simple_blog",
        {
          request: {
            blogRepoUrl: normalizeBlogRepoUrl(hydratedSettings.blogRepoUrl),
            blogGithubToken: hydratedSettings.blogGithubToken?.trim() || null,
            postRelativePath: prepared.postRelativePath,
            assetDirectoryRelativePath: prepared.assetDirectoryRelativePath,
            markdownContent: prepared.markdownContent,
            assets: prepared.assets,
          },
        },
      );

      const publishedUrl = buildSimpleBlogPostUrl(
        normalizeBlogSiteUrl(hydratedSettings.blogSiteUrl),
        prepared.markdownContent,
        prepared.postRelativePath,
      );

      // From this point on the remote publish has succeeded. Never roll the
      // local note back to "unpublished": that would contradict reality and
      // hide the published state from the user.
      if (!publishedUrl) {
        showNotification(
          t(hydratedSettings.language, "notifications_publishUrlBuildFailed"),
          "warning",
        );
        return;
      }

      await backfillFrontmatter(
        targetTabId,
        activeFile.path,
        { link: publishedUrl },
        "notifications_publishBackfillFailed",
      );

      if (prepared.unresolvedImages.length > 0) {
        // The publish itself succeeded; missing images are a warning, not an error.
        showNotification(
          t(
            hydratedSettings.language,
            "notifications_publishSuccessWithMissingImages",
            {
              count: String(prepared.unresolvedImages.length),
            },
          ),
          "warning",
        );
      } else {
        showNotification(
          t(hydratedSettings.language, "notifications_publishSuccess"),
          "success",
        );
      }
    } catch (error) {
      console.error("Failed to publish blog:", error);
      if (error instanceof PublishTimeoutError) {
        // The backend command was not cancelled and may still finish
        // successfully, so keep the local publish state as-is.
        showNotification(
          t(hydratedSettings.language, "notifications_publishResultUnknown"),
          "warning",
        );
        return;
      }
      if (publishCheckpointContent !== null && targetTabId) {
        setContentForFile(targetTabId, publishCheckpointContent);
        await forceSave(publishCheckpointContent, { trigger: "system" });
      }
      const message =
        error instanceof Error
          ? localizeKnownError(hydratedSettings.language, error.message)
          : t(hydratedSettings.language, "notifications_publishFailed");
      showNotification(message, "error");
    } finally {
      setPublishing(false);
    }
  }, [
    activeTabId,
    backfillFrontmatter,
    files,
    forceSave,
    invokePublishWithTimeout,
    setContentForFile,
    setPublishing,
    showNotification,
  ]);

  const handlePublishWechatDraft = useCallback(
    async (input: WechatDraftPublishInput) => {
      const hydratedSettings = await hydrateSensitiveSettingsIntoStore();
      const targetTabId = activeTabId;

      if (!targetTabId) {
        showNotification(
          t(hydratedSettings.language, "notifications_noFileToPublish"),
          "error",
        );
        return false;
      }

      if (!isTauriEnvironment()) {
        showNotification(
          t(hydratedSettings.language, "notifications_desktopPublishOnly"),
          "error",
        );
        return false;
      }

      if (!hydratedSettings.wechatAppId.trim()) {
        showNotification(
          t(hydratedSettings.language, "notifications_setWechatAppIdFirst"),
          "error",
        );
        return false;
      }

      if (!hydratedSettings.wechatAppSecret?.trim()) {
        showNotification(
          t(hydratedSettings.language, "notifications_setWechatAppSecretFirst"),
          "error",
        );
        return false;
      }

      if (!input.coverImagePath.trim()) {
        showNotification(
          t(hydratedSettings.language, "notifications_setWechatCoverFirst"),
          "error",
        );
        return false;
      }

      const currentContent = useAppStore.getState().fileContents[targetTabId];
      if (!currentContent) {
        showNotification(
          t(hydratedSettings.language, "notifications_noContentToPublish"),
          "error",
        );
        return false;
      }

      const activeFile = findFileInTree(files, targetTabId);
      if (!activeFile) {
        showNotification(
          t(hydratedSettings.language, "notifications_noFileToPublish"),
          "error",
        );
        return false;
      }

      if (!isMarkdownFile(activeFile.name)) {
        showNotification(
          t(hydratedSettings.language, "notifications_exportMarkdownOnly"),
          "error",
        );
        return false;
      }

      setPublishing(true);
      try {
        const saved = await forceSave(undefined, { trigger: "system" });
        if (!saved) {
          showNotification(
            t(
              hydratedSettings.language,
              "notifications_saveBeforePublishFailed",
            ),
            "error",
          );
          return false;
        }

        const storeState = useAppStore.getState();
        const latestContent =
          storeState.fileContents[targetTabId] ?? currentContent;
        const prepared = await prepareWechatDraftPublish({
          files: storeState.files,
          rootFolderPath: storeState.rootFolderPath,
          currentFilePath: activeFile.path,
          markdownContent: latestContent,
          settings: storeState.settings,
        });

        if (prepared.unresolvedImages.length > 0) {
          showNotification(
            t(hydratedSettings.language, "notifications_unresolvedImages", {
              count: String(prepared.unresolvedImages.length),
            }),
            "error",
          );
          return false;
        }

        const result = await invokePublishWithTimeout<{ mediaId: string }>(
          "publish_wechat_draft",
          {
            request: {
              wechatAppId: hydratedSettings.wechatAppId.trim(),
              wechatAppSecret: hydratedSettings.wechatAppSecret?.trim() || null,
              draftMediaId: input.existingDraftMediaId?.trim() || null,
              title: input.title.trim(),
              author: input.author.trim() || null,
              digest: input.digest.trim() || null,
              contentSourceUrl: input.contentSourceUrl.trim() || null,
              showCoverPic: input.showCoverPic,
              coverImagePath: input.coverImagePath.trim(),
              contentHtml: prepared.contentHtml,
              imageAssets: prepared.imageAssets,
            },
          },
        );

        const backfilled = await backfillFrontmatter(
          targetTabId,
          activeFile.path,
          {
            wechat_draft_media_id: result.mediaId,
            wechat_draft_updated_at: new Date().toISOString(),
          },
          "notifications_wechatDraftBackfillFailed",
        );
        if (!backfilled) {
          return false;
        }

        showNotification(
          t(hydratedSettings.language, "notifications_wechatDraftSuccess"),
          "success",
        );
        return true;
      } catch (error) {
        console.error("Failed to publish WeChat draft:", error);
        if (error instanceof PublishTimeoutError) {
          showNotification(
            t(hydratedSettings.language, "notifications_publishResultUnknown"),
            "warning",
          );
          return false;
        }
        const message =
          error instanceof Error
            ? localizeKnownError(hydratedSettings.language, error.message)
            : t(hydratedSettings.language, "notifications_wechatPublishFailed");
        showNotification(message, "error");
        return false;
      } finally {
        setPublishing(false);
      }
    },
    [
      activeTabId,
      backfillFrontmatter,
      files,
      forceSave,
      invokePublishWithTimeout,
      setPublishing,
      showNotification,
    ],
  );

  return {
    handlePublishSimpleBlog,
    handlePublishWechatDraft,
  };
}
