export interface SelectionOffsets {
  start: number;
  end: number;
}

function createTextNodeWalker(root: HTMLElement): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
}

function getOffsetWithinRoot(root: HTMLElement, container: Node, offset: number): number {
  if (container === root) {
    return offset;
  }

  const walker = createTextNodeWalker(root);
  let currentOffset = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    if (currentNode === container) {
      return currentOffset + Math.min(offset, textLength);
    }

    currentOffset += textLength;
    currentNode = walker.nextNode();
  }

  return currentOffset;
}

function findTextPosition(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  const clampedOffset = Math.max(0, targetOffset);
  const walker = createTextNodeWalker(root);
  let traversed = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    if (traversed + textLength >= clampedOffset) {
      return {
        node: currentNode,
        offset: clampedOffset - traversed,
      };
    }

    traversed += textLength;
    currentNode = walker.nextNode();
  }

  return {
    node: root,
    offset: root.childNodes.length,
  };
}

export function getSelectionOffsets(root: HTMLElement): SelectionOffsets | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  return {
    start: getOffsetWithinRoot(root, range.startContainer, range.startOffset),
    end: getOffsetWithinRoot(root, range.endContainer, range.endOffset),
  };
}

export function setSelectionOffsets(
  root: HTMLElement,
  start: number,
  end: number = start,
  options?: { focus?: boolean }
): void {
  const selection = window.getSelection();
  if (!selection) return;

  const startPosition = findTextPosition(root, start);
  const endPosition = findTextPosition(root, end);
  const range = document.createRange();

  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);

  selection.removeAllRanges();
  selection.addRange(range);

  if (options?.focus) {
    root.focus({ preventScroll: true });
  }
}

export function focusEditorSelection(
  root: HTMLElement,
  start: number,
  end: number = start
): void {
  setSelectionOffsets(root, start, end, { focus: true });
}
