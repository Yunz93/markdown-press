export const SENSITIVE_SETTING_KEYS = [
  "blogGithubToken",
  "wechatAppSecret",
  "geminiApiKey",
  "codexApiKey",
  "deepseekApiKey",
  "imageHostingGithubToken",
  "imageHostingS3SecretAccessKey",
  "imageHostingOssAccessKeySecret",
  "imageHostingQiniuSecretKey",
] as const;

export type SensitiveSettingKey = (typeof SENSITIVE_SETTING_KEYS)[number];
