import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { t as translate, type TranslationKey } from '../utils/i18n';

export function useI18n() {
  const language = useAppStore((state) => state.settings.language);

  const t = useMemo(
    () => (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params),
    [language]
  );

  return { language, t };
}
