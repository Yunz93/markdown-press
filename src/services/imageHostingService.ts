import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, ImageHostingProvider } from '../types';
import { isTauriEnvironment, waitForTauri } from '../types/filesystem';
import { hydrateSensitiveSettingsIntoStore } from './secureSettingsService';

export interface ImageUploadResult {
  url: string;
}

function buildProviderConfigJson(settings: AppSettings): string {
  const { imageHosting } = settings;
  const provider = imageHosting.provider;

  switch (provider) {
    case 'github':
      return JSON.stringify({
        repo: imageHosting.github.repo,
        branch: imageHosting.github.branch,
        path: imageHosting.github.path,
        token: settings.imageHostingGithubToken ?? '',
        customDomain: imageHosting.github.customDomain,
      });
    case 's3':
      return JSON.stringify({
        endpoint: imageHosting.s3.endpoint,
        region: imageHosting.s3.region,
        bucket: imageHosting.s3.bucket,
        pathPrefix: imageHosting.s3.pathPrefix,
        accessKeyId: imageHosting.s3.accessKeyId,
        secretAccessKey: settings.imageHostingS3SecretAccessKey ?? '',
        customDomain: imageHosting.s3.customDomain,
      });
    case 'aliyun_oss':
      return JSON.stringify({
        endpoint: imageHosting.aliyunOss.endpoint,
        bucket: imageHosting.aliyunOss.bucket,
        pathPrefix: imageHosting.aliyunOss.pathPrefix,
        accessKeyId: imageHosting.aliyunOss.accessKeyId,
        accessKeySecret: settings.imageHostingOssAccessKeySecret ?? '',
        customDomain: imageHosting.aliyunOss.customDomain,
      });
    case 'qiniu':
      return JSON.stringify({
        bucket: imageHosting.qiniu.bucket,
        zone: imageHosting.qiniu.zone,
        accessKey: imageHosting.qiniu.accessKey,
        secretKey: settings.imageHostingQiniuSecretKey ?? '',
        pathPrefix: imageHosting.qiniu.pathPrefix,
        domain: imageHosting.qiniu.domain,
      });
    case 'custom':
      return JSON.stringify({
        uploadUrl: imageHosting.custom.uploadUrl,
        method: imageHosting.custom.method,
        headers: imageHosting.custom.headers,
        fileFieldName: imageHosting.custom.fileFieldName,
        responseUrlJsonPath: imageHosting.custom.responseUrlJsonPath,
      });
    default:
      return '{}';
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function isImageHostingEnabled(settings: AppSettings): boolean {
  return settings.imageHosting.provider !== 'none'
    && settings.imageHosting.pasteAction === 'upload';
}

export function getActiveProvider(settings: AppSettings): ImageHostingProvider {
  return settings.imageHosting.provider;
}

export async function uploadImageToHosting(
  imageData: ArrayBuffer,
  filename: string,
  settings: AppSettings,
): Promise<ImageUploadResult> {
  const provider = settings.imageHosting.provider;
  if (provider === 'none') {
    throw new Error('No image hosting provider configured.');
  }

  if (!isTauriEnvironment()) {
    await waitForTauri(5000);
  }

  const freshSettings = await hydrateSensitiveSettingsIntoStore(settings);
  const configJson = buildProviderConfigJson(freshSettings);
  const imageBase64 = arrayBufferToBase64(imageData);

  const result = await invoke<{ url: string }>('upload_image_to_hosting', {
    provider,
    configJson,
    imageBase64,
    filename,
  });

  return { url: result.url };
}

export async function testImageHostingConnection(
  settings: AppSettings,
): Promise<boolean> {
  const pixel = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);

  const testFilename = `_mp-test-${Date.now()}.png`;
  await uploadImageToHosting(pixel.buffer as ArrayBuffer, testFilename, settings);
  return true;
}
