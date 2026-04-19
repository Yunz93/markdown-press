import { describe, expect, it } from 'vitest';
import { localizeKnownError } from './i18n';

describe('localizeKnownError', () => {
  it('maps OpenAI quota errors to a clearer localized message', () => {
    const message = localizeKnownError(
      'zh-CN',
      'Error: You exceeded your current quota, please check your plan and billing details.'
    );

    expect(message).toContain('OpenAI API 配额不足');
  });

  it('maps HTTP status based auth failures', () => {
    const message = localizeKnownError('en', 'OpenAI request failed with status 401.');
    expect(message).toContain('authentication failed');
  });

  it('falls back to the original message when no mapping exists', () => {
    expect(localizeKnownError('en', 'Custom backend failure')).toBe('Custom backend failure');
  });
});
