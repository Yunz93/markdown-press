import React, { useState } from 'react';
import type {
  ImageHostingProvider,
  ImageHostingConfig,
  ImageHostingGitHubConfig,
  ImageHostingS3Config,
  ImageHostingAliyunOssConfig,
  ImageHostingQiniuConfig,
  ImageHostingCustomConfig,
} from '../../../types';
import { useI18n } from '../../../hooks/useI18n';
import type { SettingsTabProps } from '../types';
import { useSecureSettings } from '../useSecureSettings';
import { testImageHostingConnection } from '../../../services/imageHostingService';

const PROVIDER_OPTIONS: { value: ImageHostingProvider; label: string; labelEn: string }[] = [
  { value: 'none', label: '无（本地保存）', labelEn: 'None (local)' },
  { value: 'github', label: 'GitHub', labelEn: 'GitHub' },
  { value: 's3', label: 'S3 兼容（AWS / R2 / MinIO）', labelEn: 'S3 Compatible (AWS / R2 / MinIO)' },
  { value: 'aliyun_oss', label: '阿里云 OSS', labelEn: 'Aliyun OSS' },
  { value: 'qiniu', label: '七牛云', labelEn: 'Qiniu' },
  { value: 'custom', label: '自定义 API', labelEn: 'Custom API' },
];

const QINIU_ZONES = [
  { value: 'z0', label: '华东' },
  { value: 'z1', label: '华北' },
  { value: 'z2', label: '华南' },
  { value: 'na0', label: '北美' },
  { value: 'as0', label: '东南亚' },
  { value: 'cn-east-2', label: '华东-浙江2' },
];

const inputClass = 'w-full px-3 py-2 border border-gray-200 dark:border-white/10 text-sm bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/20 focus:border-accent-DEFAULT transition-all rounded-xl';
const selectClass = `${inputClass} appearance-none`;
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
const descClass = 'mt-1 text-[11px] text-gray-400 dark:text-gray-500';

export const ImageHostingTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t, language } = useI18n();
  const { handleSecureSettingChange, renderSecureSaveState } = useSecureSettings(onUpdateSettings);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const isZh = language === 'zh-CN';
  const ih = settings.imageHosting;

  const updateIH = (updates: Partial<ImageHostingConfig>) => {
    onUpdateSettings({ imageHosting: { ...ih, ...updates } });
  };

  const updateGitHub = (updates: Partial<ImageHostingGitHubConfig>) => {
    updateIH({ github: { ...ih.github, ...updates } });
  };

  const updateS3 = (updates: Partial<ImageHostingS3Config>) => {
    updateIH({ s3: { ...ih.s3, ...updates } });
  };

  const updateAliyunOss = (updates: Partial<ImageHostingAliyunOssConfig>) => {
    updateIH({ aliyunOss: { ...ih.aliyunOss, ...updates } });
  };

  const updateQiniu = (updates: Partial<ImageHostingQiniuConfig>) => {
    updateIH({ qiniu: { ...ih.qiniu, ...updates } });
  };

  const updateCustom = (updates: Partial<ImageHostingCustomConfig>) => {
    updateIH({ custom: { ...ih.custom, ...updates } });
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      await testImageHostingConnection(settings);
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderSecretInput = (
    secureKey: 'imageHostingGithubToken' | 'imageHostingS3SecretAccessKey' | 'imageHostingOssAccessKeySecret' | 'imageHostingQiniuSecretKey',
    label: string,
    placeholder: string,
  ) => (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type={showSecrets[secureKey] ? 'text' : 'password'}
          value={(settings[secureKey] as string) ?? ''}
          onChange={(e) => handleSecureSettingChange(secureKey, e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} pr-10 font-mono`}
        />
        <button
          type="button"
          onClick={() => toggleSecret(secureKey)}
          className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          {showSecrets[secureKey] ? (
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
      {renderSecureSaveState(secureKey)}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-02s">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          {isZh ? '图床设置' : 'Image Hosting'}
        </h3>

        <div className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className={labelClass}>{isZh ? '图床服务' : 'Provider'}</label>
            <select
              value={ih.provider}
              onChange={(e) => updateIH({ provider: e.target.value as ImageHostingProvider })}
              className={selectClass}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {isZh ? opt.label : opt.labelEn}
                </option>
              ))}
            </select>
          </div>

          {ih.provider !== 'none' && (
            <>
              {/* Paste Action */}
              <div>
                <label className={labelClass}>{isZh ? '粘贴图片时' : 'On Paste'}</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="pasteAction"
                      checked={ih.pasteAction === 'upload'}
                      onChange={() => updateIH({ pasteAction: 'upload' })}
                      className="accent-accent-DEFAULT"
                    />
                    {isZh ? '自动上传到图床' : 'Upload to hosting'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="pasteAction"
                      checked={ih.pasteAction === 'local'}
                      onChange={() => updateIH({ pasteAction: 'local' })}
                      className="accent-accent-DEFAULT"
                    />
                    {isZh ? '保存到本地' : 'Save locally'}
                  </label>
                </div>
              </div>

              {/* Keep Local Copy */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isZh ? '上传后保留本地副本' : 'Keep local copy after upload'}
                  </label>
                  <p className={descClass}>
                    {isZh ? '上传图床的同时在本地 resources 保留一份' : 'Also save to local resources folder'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ih.keepLocalCopy}
                  onClick={() => updateIH({ keepLocalCopy: !ih.keepLocalCopy })}
                  className={`w-10 h-6 rounded-full transition-colors duration-200 relative shrink-0 cursor-pointer ${
                    ih.keepLocalCopy ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm pointer-events-none ${
                      ih.keepLocalCopy ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Provider-specific config */}
      {ih.provider === 'github' && (
        <div className="space-y-4 pt-2 border-t border-gray-200/50 dark:border-white/5">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">GitHub</h4>
          <div>
            <label className={labelClass}>{isZh ? '仓库' : 'Repository'}</label>
            <input
              type="text"
              value={ih.github.repo}
              onChange={(e) => updateGitHub({ repo: e.target.value })}
              placeholder="owner/repo"
              className={inputClass}
            />
            <p className={descClass}>
              {isZh
                ? '格式：owner/repo，或粘贴 https://github.com/owner/repo'
                : 'Use owner/repo or paste https://github.com/owner/repo'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isZh ? '分支' : 'Branch'}</label>
              <input type="text" value={ih.github.branch} onChange={(e) => updateGitHub({ branch: e.target.value })} placeholder="main" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isZh ? '上传路径' : 'Path'}</label>
              <input type="text" value={ih.github.path} onChange={(e) => updateGitHub({ path: e.target.value })} placeholder="images/" className={inputClass} />
            </div>
          </div>
          {renderSecretInput('imageHostingGithubToken', 'Token', 'github_pat_xxx...')}
          <div>
            <label className={labelClass}>{isZh ? '自定义域名（可选）' : 'Custom domain (optional)'}</label>
            <input type="text" value={ih.github.customDomain} onChange={(e) => updateGitHub({ customDomain: e.target.value })} placeholder="https://cdn.example.com" className={inputClass} />
            <p className={descClass}>{isZh ? '替代 raw.githubusercontent.com 的 CDN 域名' : 'CDN domain to replace raw.githubusercontent.com'}</p>
          </div>
        </div>
      )}

      {ih.provider === 's3' && (
        <div className="space-y-4 pt-2 border-t border-gray-200/50 dark:border-white/5">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">S3 {isZh ? '兼容存储' : 'Compatible'}</h4>
          <div>
            <label className={labelClass}>Endpoint</label>
            <input type="text" value={ih.s3.endpoint} onChange={(e) => updateS3({ endpoint: e.target.value })} placeholder="s3.us-east-1.amazonaws.com" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Region</label>
              <input type="text" value={ih.s3.region} onChange={(e) => updateS3({ region: e.target.value })} placeholder="us-east-1" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Bucket</label>
              <input type="text" value={ih.s3.bucket} onChange={(e) => updateS3({ bucket: e.target.value })} placeholder="my-bucket" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>{isZh ? '路径前缀' : 'Path prefix'}</label>
            <input type="text" value={ih.s3.pathPrefix} onChange={(e) => updateS3({ pathPrefix: e.target.value })} placeholder="images/" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Access Key ID</label>
            <input type="text" value={ih.s3.accessKeyId} onChange={(e) => updateS3({ accessKeyId: e.target.value })} placeholder="AKIAIOSFODNN7EXAMPLE" className={`${inputClass} font-mono`} />
          </div>
          {renderSecretInput('imageHostingS3SecretAccessKey', 'Secret Access Key', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')}
          <div>
            <label className={labelClass}>{isZh ? '自定义域名（可选）' : 'Custom domain (optional)'}</label>
            <input type="text" value={ih.s3.customDomain} onChange={(e) => updateS3({ customDomain: e.target.value })} placeholder="https://cdn.example.com" className={inputClass} />
          </div>
        </div>
      )}

      {ih.provider === 'aliyun_oss' && (
        <div className="space-y-4 pt-2 border-t border-gray-200/50 dark:border-white/5">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{isZh ? '阿里云 OSS' : 'Aliyun OSS'}</h4>
          <div>
            <label className={labelClass}>Endpoint</label>
            <input type="text" value={ih.aliyunOss.endpoint} onChange={(e) => updateAliyunOss({ endpoint: e.target.value })} placeholder="oss-cn-hangzhou.aliyuncs.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Bucket</label>
            <input type="text" value={ih.aliyunOss.bucket} onChange={(e) => updateAliyunOss({ bucket: e.target.value })} placeholder="my-bucket" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isZh ? '路径前缀' : 'Path prefix'}</label>
            <input type="text" value={ih.aliyunOss.pathPrefix} onChange={(e) => updateAliyunOss({ pathPrefix: e.target.value })} placeholder="images/" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Access Key ID</label>
            <input type="text" value={ih.aliyunOss.accessKeyId} onChange={(e) => updateAliyunOss({ accessKeyId: e.target.value })} className={`${inputClass} font-mono`} />
          </div>
          {renderSecretInput('imageHostingOssAccessKeySecret', 'Access Key Secret', '')}
          <div>
            <label className={labelClass}>{isZh ? '自定义域名（可选）' : 'Custom domain (optional)'}</label>
            <input type="text" value={ih.aliyunOss.customDomain} onChange={(e) => updateAliyunOss({ customDomain: e.target.value })} placeholder="https://cdn.example.com" className={inputClass} />
          </div>
        </div>
      )}

      {ih.provider === 'qiniu' && (
        <div className="space-y-4 pt-2 border-t border-gray-200/50 dark:border-white/5">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{isZh ? '七牛云' : 'Qiniu'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Bucket</label>
              <input type="text" value={ih.qiniu.bucket} onChange={(e) => updateQiniu({ bucket: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isZh ? '区域' : 'Zone'}</label>
              <select value={ih.qiniu.zone} onChange={(e) => updateQiniu({ zone: e.target.value })} className={selectClass}>
                {QINIU_ZONES.map((z) => (
                  <option key={z.value} value={z.value}>{z.label} ({z.value})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>{isZh ? '外链域名' : 'Domain'}</label>
            <input type="text" value={ih.qiniu.domain} onChange={(e) => updateQiniu({ domain: e.target.value })} placeholder="cdn.example.com" className={inputClass} />
            <p className={descClass}>{isZh ? '七牛云要求绑定外链域名才能访问文件' : 'Qiniu requires a bound domain to access files'}</p>
          </div>
          <div>
            <label className={labelClass}>{isZh ? '路径前缀' : 'Path prefix'}</label>
            <input type="text" value={ih.qiniu.pathPrefix} onChange={(e) => updateQiniu({ pathPrefix: e.target.value })} placeholder="images/" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Access Key</label>
            <input type="text" value={ih.qiniu.accessKey} onChange={(e) => updateQiniu({ accessKey: e.target.value })} className={`${inputClass} font-mono`} />
          </div>
          {renderSecretInput('imageHostingQiniuSecretKey', 'Secret Key', '')}
        </div>
      )}

      {ih.provider === 'custom' && (
        <div className="space-y-4 pt-2 border-t border-gray-200/50 dark:border-white/5">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{isZh ? '自定义 API' : 'Custom API'}</h4>
          <div>
            <label className={labelClass}>{isZh ? '上传地址' : 'Upload URL'}</label>
            <input type="text" value={ih.custom.uploadUrl} onChange={(e) => updateCustom({ uploadUrl: e.target.value })} placeholder="https://api.example.com/upload" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isZh ? '请求方法' : 'Method'}</label>
              <select value={ih.custom.method} onChange={(e) => updateCustom({ method: e.target.value as 'POST' | 'PUT' })} className={selectClass}>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{isZh ? '文件字段名' : 'File field name'}</label>
              <input type="text" value={ih.custom.fileFieldName} onChange={(e) => updateCustom({ fileFieldName: e.target.value })} placeholder="file" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>{isZh ? '请求头（JSON）' : 'Headers (JSON)'}</label>
            <textarea
              value={ih.custom.headers}
              onChange={(e) => updateCustom({ headers: e.target.value })}
              placeholder='{"Authorization": "Bearer xxx"}'
              rows={3}
              className={`${inputClass} font-mono resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>{isZh ? '响应 URL 路径' : 'Response URL JSON path'}</label>
            <input type="text" value={ih.custom.responseUrlJsonPath} onChange={(e) => updateCustom({ responseUrlJsonPath: e.target.value })} placeholder="data.url" className={inputClass} />
            <p className={descClass}>{isZh ? '从 JSON 响应中提取图片 URL 的路径，如 data.url' : 'JSON path to extract URL, e.g. data.url'}</p>
          </div>
        </div>
      )}

      {/* Test Connection */}
      {ih.provider !== 'none' && (
        <div className="pt-2 border-t border-gray-200/50 dark:border-white/5">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all active:scale-95 ${
              testStatus === 'success'
                ? 'bg-green-500 text-white'
                : testStatus === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/20'
            }`}
          >
            {testStatus === 'testing' && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
              </svg>
            )}
            {testStatus === 'success' && (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {testStatus === 'error' && (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            {testStatus === 'testing'
              ? (isZh ? '测试中...' : 'Testing...')
              : testStatus === 'success'
                ? (isZh ? '连接成功' : 'Success')
                : testStatus === 'error'
                  ? (isZh ? '连接失败' : 'Failed')
                  : (isZh ? '测试连接' : 'Test Connection')}
          </button>
          {testStatus === 'error' && testError && (
            <p className="mt-2 text-xs text-red-500 break-all">{testError}</p>
          )}
        </div>
      )}
    </div>
  );
};
