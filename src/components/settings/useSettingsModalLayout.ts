import { useCallback, useState } from "react";
import {
  LAYOUT,
  clamp,
  getStoredPanelWidth,
} from "../../config/layout";

function persistNumber(key: string, value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(Math.round(value)));
}

function readStoredSize(
  widthKey: string,
  heightKey: string,
  fallbackWidth: number,
  fallbackHeight: number,
  minWidth: number,
  maxWidth: number,
  minHeight: number,
  maxHeight: number,
): { width: number; height: number } {
  return {
    width: getStoredPanelWidth(widthKey, fallbackWidth, minWidth, maxWidth),
    height: getStoredPanelWidth(
      heightKey,
      fallbackHeight,
      minHeight,
      maxHeight,
    ),
  };
}

export function useSettingsModalLayout() {
  const config = LAYOUT.SETTINGS_MODAL;
  const keys = LAYOUT.STORAGE_KEYS;

  const [{ width, height }, setSize] = useState(() =>
    readStoredSize(
      keys.SETTINGS_MODAL_WIDTH,
      keys.SETTINGS_MODAL_HEIGHT,
      config.DEFAULT_WIDTH,
      config.DEFAULT_HEIGHT,
      config.MIN_WIDTH,
      config.MAX_WIDTH,
      config.MIN_HEIGHT,
      config.MAX_HEIGHT,
    ),
  );

  const [navWidth, setNavWidth] = useState(() =>
    getStoredPanelWidth(
      keys.SETTINGS_NAV_WIDTH,
      config.NAV_DEFAULT_WIDTH,
      config.NAV_MIN_WIDTH,
      config.NAV_MAX_WIDTH,
    ),
  );

  const [metadataKeyWidth, setMetadataKeyWidth] = useState(() =>
    getStoredPanelWidth(
      keys.SETTINGS_METADATA_KEY_WIDTH,
      config.METADATA_KEY_DEFAULT_WIDTH,
      config.METADATA_KEY_MIN_WIDTH,
      config.METADATA_KEY_MAX_WIDTH,
    ),
  );

  const [metadataValueWidth, setMetadataValueWidth] = useState(() =>
    getStoredPanelWidth(
      keys.SETTINGS_METADATA_VALUE_WIDTH,
      config.METADATA_VALUE_DEFAULT_WIDTH,
      config.METADATA_VALUE_MIN_WIDTH,
      config.METADATA_VALUE_MAX_WIDTH,
    ),
  );

  const updateSize = useCallback(
    (nextWidth: number, nextHeight: number) => {
      const maxWidth = Math.min(
        config.MAX_WIDTH,
        typeof window !== "undefined" ? window.innerWidth - 32 : config.MAX_WIDTH,
      );
      const maxHeight = Math.min(
        config.MAX_HEIGHT,
        typeof window !== "undefined"
          ? window.innerHeight - 32
          : config.MAX_HEIGHT,
      );
      const widthValue = clamp(nextWidth, config.MIN_WIDTH, maxWidth);
      const heightValue = clamp(nextHeight, config.MIN_HEIGHT, maxHeight);
      setSize({ width: widthValue, height: heightValue });
      persistNumber(keys.SETTINGS_MODAL_WIDTH, widthValue);
      persistNumber(keys.SETTINGS_MODAL_HEIGHT, heightValue);
    },
    [config, keys],
  );

  const updateNavWidth = useCallback(
    (nextWidth: number) => {
      const widthValue = clamp(
        nextWidth,
        config.NAV_MIN_WIDTH,
        config.NAV_MAX_WIDTH,
      );
      setNavWidth(widthValue);
      persistNumber(keys.SETTINGS_NAV_WIDTH, widthValue);
    },
    [config, keys],
  );

  const updateMetadataKeyWidth = useCallback(
    (nextWidth: number) => {
      const widthValue = clamp(
        nextWidth,
        config.METADATA_KEY_MIN_WIDTH,
        config.METADATA_KEY_MAX_WIDTH,
      );
      setMetadataKeyWidth(widthValue);
      persistNumber(keys.SETTINGS_METADATA_KEY_WIDTH, widthValue);
    },
    [config, keys],
  );

  const updateMetadataValueWidth = useCallback(
    (nextWidth: number) => {
      const widthValue = clamp(
        nextWidth,
        config.METADATA_VALUE_MIN_WIDTH,
        config.METADATA_VALUE_MAX_WIDTH,
      );
      setMetadataValueWidth(widthValue);
      persistNumber(keys.SETTINGS_METADATA_VALUE_WIDTH, widthValue);
    },
    [config, keys],
  );

  return {
    width,
    height,
    navWidth,
    metadataKeyWidth,
    metadataValueWidth,
    updateSize,
    updateNavWidth,
    updateMetadataKeyWidth,
    updateMetadataValueWidth,
  };
}
