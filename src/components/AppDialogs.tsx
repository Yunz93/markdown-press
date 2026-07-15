import React from "react";
import { SettingsModal } from "./settings/SettingsModal";
import { PromptDialog } from "./ui/Dialog";
import { PublishTargetDialog } from "./publish/PublishTargetDialog";
import { WechatDraftDialog } from "./publish/WechatDraftDialog";
import { ShareLongImageDialog } from "./share/ShareLongImageDialog";
import type { AppSettings, FileNode, Notification } from "../types";
import type {
  WechatDraftDefaults,
  WechatDraftPublishInput,
} from "../utils/wechatPublish";
import type { LongImageSharePayload } from "./share/longImageSharePayload";

interface AppDialogsProps {
  isSettingsOpen: boolean;
  isNewNoteDialogOpen: boolean;
  isPublishTargetDialogOpen: boolean;
  isWechatDraftDialogOpen: boolean;
  isShareLongImageDialogOpen: boolean;
  isPublishing: boolean;
  settings: AppSettings;
  wechatDraftDefaults: WechatDraftDefaults | null;
  notification: Notification | null;
  attachmentContext: { files: FileNode[]; rootFolderPath: string | null };
  t: (key: string) => string;
  uiScaleStyle: React.CSSProperties;
  buildPayload: () => Promise<LongImageSharePayload | null>;
  onCloseSettings: () => void;
  onUpdateSettings: (s: Partial<AppSettings>) => void;
  onCloseNewNote: () => void;
  onSubmitNewNote: (value: string) => void;
  onClosePublishTarget: () => void;
  onSelectSimpleBlog: () => void;
  onSelectWechatDraft: () => void;
  onCloseWechatDraft: () => void;
  onSubmitWechatDraft: (input: WechatDraftPublishInput) => void;
  onCloseShareLongImage: () => void;
}

export const AppDialogs: React.FC<AppDialogsProps> = ({
  isSettingsOpen,
  isNewNoteDialogOpen,
  isPublishTargetDialogOpen,
  isWechatDraftDialogOpen,
  isShareLongImageDialogOpen,
  isPublishing,
  settings,
  wechatDraftDefaults,
  notification,
  attachmentContext,
  t,
  uiScaleStyle,
  buildPayload,
  onCloseSettings,
  onUpdateSettings,
  onCloseNewNote,
  onSubmitNewNote,
  onClosePublishTarget,
  onSelectSimpleBlog,
  onSelectWechatDraft,
  onCloseWechatDraft,
  onSubmitWechatDraft,
  onCloseShareLongImage,
}) => {
  return (
    <>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={onCloseSettings}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        uiScaleStyle={uiScaleStyle}
      />

      <PromptDialog
        isOpen={isNewNoteDialogOpen}
        onClose={onCloseNewNote}
        onSubmit={onSubmitNewNote}
        title={t("app_newFile")}
        label={t("app_fileName")}
        defaultValue={t("app_untitled")}
        submitText={t("common_create")}
      />

      <PublishTargetDialog
        isOpen={isPublishTargetDialogOpen}
        onClose={onClosePublishTarget}
        onSelectSimpleBlog={onSelectSimpleBlog}
        onSelectWechatDraft={onSelectWechatDraft}
      />

      <WechatDraftDialog
        isOpen={isWechatDraftDialogOpen}
        isSubmitting={isPublishing}
        defaults={wechatDraftDefaults}
        onClose={onCloseWechatDraft}
        onSubmit={(input) => {
          void onSubmitWechatDraft(input);
        }}
      />

      <ShareLongImageDialog
        isOpen={isShareLongImageDialogOpen}
        onClose={onCloseShareLongImage}
        buildPayload={buildPayload}
        attachmentContext={attachmentContext}
      />

      {notification && (
        <div
          className={`ui-scaled fixed top-6 right-6 px-4 py-3 rounded-xl shadow-xl z-[250] animate-fade-in border glass ${
            notification.type === "success"
              ? "text-green-600 border-green-100 dark:border-green-900"
              : notification.type === "info"
                ? "text-blue-600 border-blue-100 dark:text-blue-400 dark:border-blue-900"
                : notification.type === "warning"
                  ? "text-amber-600 border-amber-100 dark:text-amber-400 dark:border-amber-900"
                  : "text-red-500 border-red-100 dark:border-red-900"
          }`}
          role="status"
          aria-live="polite"
        >
          {notification.msg}
        </div>
      )}
    </>
  );
};
