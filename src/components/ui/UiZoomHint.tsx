import React from "react";
import { useAppStore } from "../../store/appStore";

export const UiZoomHint: React.FC = () => {
  const percent = useAppStore((state) => state.uiZoomHintPercent);

  if (percent === null) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[300] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={`${percent}%`}
    >
      <div className="rounded-2xl bg-black/70 px-8 py-5 text-4xl font-semibold tracking-tight text-white shadow-2xl backdrop-blur-sm animate-fade-in">
        {percent}%
      </div>
    </div>
  );
};
