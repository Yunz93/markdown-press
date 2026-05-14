import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../store/appStore';
import { generateDeepSeekJson } from './deepseekService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateDeepSeekJson', () => {
  it('calls the DeepSeek chat completions endpoint with JSON output enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"ok":true}',
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateDeepSeekJson<{ ok: boolean }>('Return a status object.', {
      ...defaultSettings,
      aiProvider: 'deepseek',
      deepseekApiKey: 'sk-test',
      deepseekApiBaseUrl: 'https://api.deepseek.com/',
      deepseekModel: 'deepseek-v4-flash',
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
        body: expect.any(String),
      })
    );

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit & { body: string };
    const body = JSON.parse(requestInit.body);
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content).toContain('Return JSON only.');
  });
});
