import { useEffect, type RefObject } from "react";
import { useAppStore } from "../../../store/appStore";

/**
 * Scroll-spy for the preview pane: keeps `activeHeadingId` in sync with the
 * heading currently near the top of the viewport, so the outline highlights
 * where you are while reading (not only after clicking an outline entry).
 */
export function usePreviewScrollSpy(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !enabled) return;

    let rafId: number | null = null;

    const updateActiveHeading = () => {
      rafId = null;
      const headingElements =
        element.querySelectorAll<HTMLElement>("[data-heading-id]");
      if (headingElements.length === 0) return;

      // A heading is "current" once it crosses the top quarter of the pane.
      const containerTop = element.getBoundingClientRect().top;
      const threshold = containerTop + element.clientHeight * 0.25;

      let currentId: string | null = null;
      for (const headingElement of headingElements) {
        if (headingElement.getBoundingClientRect().top > threshold) break;
        currentId = headingElement.dataset.headingId ?? null;
      }
      if (currentId === null) {
        currentId = headingElements[0].dataset.headingId ?? null;
      }

      const store = useAppStore.getState();
      if (store.activeHeadingId !== currentId) {
        store.setActiveHeadingId(currentId);
      }
    };

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(updateActiveHeading);
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    // Initialize on mount so the outline is highlighted before any scroll.
    handleScroll();

    return () => {
      element.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [containerRef, enabled]);
}
