import { useEffect, useState } from 'react';
import {
  getCachedSystemFontFamilies,
  hasCachedSystemFontFamilies,
  listAvailableSystemFontFamilies,
} from '../../services/systemFontService';
import {
  BUNDLED_FONT_PRESETS,
  buildSystemFontFamily,
} from '../../utils/fontSettings';
import { useI18n } from '../../hooks/useI18n';

export interface FontOption {
  label: string;
  value: string;
}

export function useFontOptions(isOpen: boolean) {
  const { t } = useI18n();
  const [availableSystemFonts, setAvailableSystemFonts] = useState<string[]>(
    () => getCachedSystemFontFamilies() ?? []
  );
  const [isLoadingSystemFonts, setIsLoadingSystemFonts] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const cachedFonts = getCachedSystemFontFamilies();
    if (cachedFonts) {
      setAvailableSystemFonts(cachedFonts);
    }

    if (hasCachedSystemFontFamilies()) {
      setIsLoadingSystemFonts(false);
      return;
    }

    let cancelled = false;
    setIsLoadingSystemFonts(true);

    void listAvailableSystemFontFamilies()
      .then((fontFamilies) => {
        if (cancelled) return;
        setAvailableSystemFonts(fontFamilies);
      })
      .catch((error) => {
        console.error('Failed to load available system fonts:', error);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingSystemFonts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const bundledFontOptions = BUNDLED_FONT_PRESETS.map((preset) => ({
    label: preset.label,
    value: preset.id,
  }));

  const systemFontOptions = availableSystemFonts.map((fontFamily) => ({
    label: fontFamily,
    value: buildSystemFontFamily(fontFamily),
  }));

  const buildFontOptions = (currentValue: string): FontOption[] => {
    const options = [...bundledFontOptions, ...systemFontOptions]
      .filter((option, index, array) => array.findIndex((item) => item.value === option.value) === index);

    if (!options.some((option) => option.value === currentValue)) {
      options.unshift({
        label: t('settings_uiFontCurrentOption'),
        value: currentValue,
      });
    }

    return options;
  };

  return { buildFontOptions, isLoadingSystemFonts };
}
