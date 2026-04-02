export function getPlatformIdentifier(): string {
  if (typeof navigator === 'undefined') return '';

  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  return [
    nav.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function isWindowsPlatform(): boolean {
  return getPlatformIdentifier().includes('win');
}
