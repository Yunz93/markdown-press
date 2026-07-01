export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 22;
export const UI_FONT_SIZE_STEP = 1;

export function clampUiFontSize(size: number): number {
  if (!Number.isFinite(size)) {
    return UI_FONT_SIZE_MIN;
  }

  return Math.min(
    UI_FONT_SIZE_MAX,
    Math.max(UI_FONT_SIZE_MIN, Math.round(size)),
  );
}

export function stepUiFontSize(current: number, delta: number): number {
  return clampUiFontSize(current + delta * UI_FONT_SIZE_STEP);
}

function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

function isZoomOutKey(event: KeyboardEvent): boolean {
  const code = event.code.toLowerCase();
  const key = event.key;

  return code === "minus" || code === "numpadsubtract" || key === "-";
}

function isZoomInKey(event: KeyboardEvent): boolean {
  const code = event.code.toLowerCase();
  const key = event.key;

  return code === "equal" || code === "numpadadd" || key === "+" || key === "=";
}

export function getUiFontSizeZoomDelta(event: KeyboardEvent): -1 | 0 | 1 {
  if (event.repeat || !hasPrimaryModifier(event)) {
    return 0;
  }

  if (isZoomOutKey(event)) {
    return -1;
  }

  if (isZoomInKey(event)) {
    return 1;
  }

  return 0;
}
