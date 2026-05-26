import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { StateCommand } from "@codemirror/state";
import {
  createHandleSmartShiftTab,
  createHandleSmartTab,
  createHandleSmartBackspace,
  handleSmartEnter,
} from "./input";
import {
  createHandleListBackspace,
  handleListEnter,
  handleListTab,
} from "./nestedListCommands";

function applyCommand(
  cmd: StateCommand,
  doc: string,
  anchor: number,
  head: number,
): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  let next = state;
  cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

describe("createHandleSmartTab selection", () => {
  const tab = createHandleSmartTab("strict");

  it("indents each covered line when a paragraph selection is non-empty", () => {
    const next = applyCommand(tab, "aa\nbb\ncc", 0, 8);
    expect(next.doc.toString()).toBe("    aa\n    bb\n    cc");
  });

  it("indents the full line when only part of a line is selected", () => {
    const next = applyCommand(tab, "hello world", 0, 5);
    expect(next.doc.toString()).toBe("    hello world");
  });

  it("indents an ordered list item consistently from before and after the marker", () => {
    const beforeMarker = applyCommand(tab, "1. parent\n2. item", 10, 10);
    const afterMarker = applyCommand(tab, "1. parent\n2. item", 13, 13);

    expect(beforeMarker.doc.toString()).toBe("1. parent\n    1. item");
    expect(afterMarker.doc.toString()).toBe("1. parent\n    1. item");
    expect(beforeMarker.selection.main.from).toBe(17);
    expect(afterMarker.selection.main.from).toBe(17);
  });

  it("keeps the cursor content-relative when indenting an ordered list item", () => {
    const next = applyCommand(tab, "1. parent\n10. item", 15, 15);

    expect(next.doc.toString()).toBe("1. parent\n    1. item");
    expect(next.selection.main.from).toBe(18);
  });

  it("uses marker-width-aware child indentation for wider ordered parents", () => {
    const looseTab = createHandleSmartTab("loose");
    const twoDigitParent = applyCommand(
      looseTab,
      "10. parent\n11. child",
      11,
      11,
    );
    const threeDigitParent = applyCommand(
      looseTab,
      "100. parent\n101. child",
      12,
      12,
    );

    expect(twoDigitParent.doc.toString()).toBe("10. parent\n    1. child");
    expect(threeDigitParent.doc.toString()).toBe("100. parent\n     1. child");
  });

  it("uses the decimal parent marker style when indenting a stale alphabetic empty item", () => {
    const doc = "1. 服务化\na. \n3. 可靠性";
    const cursorAfterMarker = "1. 服务化\na. ".length;
    const next = applyCommand(tab, doc, cursorAfterMarker, cursorAfterMarker);

    expect(next.doc.toString()).toBe("1. 服务化\n    1. \n2. 可靠性");
  });

  it("renumbers ordered siblings in the same tab command", () => {
    const next = applyCommand(tab, "1. one\n2. two\n3. three", 7, 7);

    expect(next.doc.toString()).toBe("1. one\n    1. two\n2. three");
  });

  it("indents mixed selections line by line instead of nesting later list items", () => {
    const next = applyCommand(tab, "- A\nB\n- C", 0, 9);
    expect(next.doc.toString()).toBe("    - A\n    B\n    - C");
  });

  // 回归 #9：Tab 不应当强制把非空子项的 markerStyle 改成父级风格
  it("preserves explicit child markerStyle when content is non-empty", () => {
    const tabStrict = createHandleSmartTab("strict");
    const doc = "A. parent\n1. child";
    const next = applyCommand(tabStrict, doc, doc.length, doc.length);
    // child 是非空显式数字项，应当保留 1. 数字样式，仅缩进改变
    expect(next.doc.toString()).toBe("A. parent\n    1. child");
  });

  // 回归 #6：连续 Tab 应当持续缩进，不应卡在 marker-aware 父级缩进
  it("keeps indenting on consecutive tabs even when child indent equals marker-aware proposal", () => {
    const tabStrict = createHandleSmartTab("strict");
    const doc = "- [ ] parent\n- [x] child";
    const after1 = applyCommand(tabStrict, doc, doc.length, doc.length);
    expect(after1.doc.toString()).toBe("- [ ] parent\n      - [x] child");

    const doc2 = after1.doc.toString();
    const after2 = applyCommand(tabStrict, doc2, doc2.length, doc2.length);
    expect(after2.doc.toString()).toBe("- [ ] parent\n          - [x] child");
  });

  it("after a nested ordered item, Tab nests a top-level sibling under the nearest shallower item", () => {
    const doc =
      "1. 基础：算力付费；\n2. 进阶：可靠性保障 SLA 付费；\n   1. 测试\n3. ";
    const pos = doc.length;
    const next = applyCommand(tab, doc, pos, pos);
    // 与同父级（2. 进阶）下已存在的子项 `   1. 测试` 对齐，使用 3 空格缩进；
    // strict 模式 normalize 接续编号 → `   2. `
    expect(next.doc.toString().split("\n").pop()).toBe("   2. ");
    // 误把「上一行」子列表当父级时会出现 7 格缩进
    expect(next.doc.toString()).not.toMatch(/\n {7}1\. /);
  });
});

describe("createHandleSmartShiftTab selection", () => {
  const shiftTab = createHandleSmartShiftTab("strict");

  it("outdents an ordered list item consistently from before and after the marker", () => {
    const beforeMarker = applyCommand(shiftTab, "  1. item", 2, 2);
    const afterMarker = applyCommand(shiftTab, "  1. item", 5, 5);

    expect(beforeMarker.doc.toString()).toBe("1. item");
    expect(afterMarker.doc.toString()).toBe("1. item");
    expect(beforeMarker.selection.main.from).toBe(3);
    expect(afterMarker.selection.main.from).toBe(3);
  });

  it("removes the marker from level-0 list items", () => {
    expect(applyCommand(shiftTab, "- item", 2, 2).doc.toString()).toBe("item");
    expect(applyCommand(shiftTab, "1. item", 3, 3).doc.toString()).toBe("item");
    expect(applyCommand(shiftTab, "- [ ] item", 6, 6).doc.toString()).toBe(
      "item",
    );
  });

  it("outdents mixed selections line by line and unlists level-0 items", () => {
    const next = applyCommand(shiftTab, "- A\nB\n- C", 0, 9);
    expect(next.doc.toString()).toBe("A\nB\nC");
  });

  it("keeps loose Shift-Tab numbering aligned with Enter when outdenting an empty ordered child", () => {
    const looseShiftTab = createHandleSmartShiftTab("loose");
    const doc = "1. 前项\n2. 数据的安全性；\n    1. 专属算力模式；\n    2. ";
    const next = applyCommand(looseShiftTab, doc, doc.length, doc.length);
    const enterNext = applyCommand(
      handleSmartEnter,
      doc,
      doc.length,
      doc.length,
    );

    expect(next.doc.toString()).toBe(
      "1. 前项\n2. 数据的安全性；\n    1. 专属算力模式；\n3. ",
    );
    expect(next.doc.toString()).toBe(enterNext.doc.toString());
  });
});

describe("handleListTab selection fallback", () => {
  it("indents each line when there is a selection but no parsed list items", () => {
    const next = applyCommand(
      handleListTab({ strictMode: true }),
      "aa\nbb",
      0,
      5,
    );
    expect(next.doc.toString()).toBe("    aa\n    bb");
  });
});

describe("handleSmartEnter ordered list continuation", () => {
  it("inserts the next sibling number after a tab-indented continuation line", () => {
    const doc = "1. first\n\tcontinuation";
    const cursorAtEnd = doc.length;
    const next = applyCommand(handleSmartEnter, doc, cursorAtEnd, cursorAtEnd);
    expect(next.doc.toString()).toBe("1. first\n\tcontinuation\n2. ");
  });
});

describe("handleSmartEnter empty nested list items", () => {
  it("keeps the cursor after the marker when outdenting an empty ordered item", () => {
    const doc = "1. test\n   1. test\n   2. ";
    const next = applyCommand(handleSmartEnter, doc, doc.length, doc.length);

    expect(next.doc.toString()).toBe("1. test\n   1. test\n2. ");
    expect(next.selection.main.from).toBe("1. test\n   1. test\n2. ".length);
  });
});

describe("unordered and task nested list editing", () => {
  const tab = createHandleSmartTab("strict");

  it("Tab nests an unordered sibling under its parent", () => {
    const doc = "- parent\n- child";
    const childPos = doc.indexOf("- child") + 2;
    const next = applyCommand(tab, doc, childPos, childPos);
    expect(next.doc.toString()).toBe("- parent\n    - child");
  });

  it("Enter continues an unordered list at the same indent", () => {
    const doc = "- first item";
    const next = applyCommand(handleListEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toBe("- first item\n- ");
  });

  it("Enter continues a task list and keeps the checkbox unchecked", () => {
    const doc = "- [ ] todo";
    const next = applyCommand(handleListEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toBe("- [ ] todo\n- [ ] ");
  });

  it("Shift-Tab outdents a nested unordered item", () => {
    const shiftTab = createHandleSmartShiftTab("strict");
    const doc = "- parent\n    - child";
    const childPos = doc.indexOf("- child") + 2;
    const next = applyCommand(shiftTab, doc, childPos, childPos);
    expect(next.doc.toString()).toBe("- parent\n- child");
  });

  it("Backspace outdents a nested unordered item at marker boundary", () => {
    const doc = "- parent\n    - child";
    const markerEnd = doc.indexOf("child");
    const next = applyCommand(
      createHandleListBackspace(),
      doc,
      markerEnd,
      markerEnd,
    );
    expect(next.doc.toString()).toBe("- parent\n- child");
  });
});

describe("multi-level Shift-Tab outdent", () => {
  const shiftTab = createHandleSmartShiftTab("strict");

  it("outdents a deeply nested ordered item one parent indent at a time", () => {
    const doc = [
      "1. top",
      "    1. mid",
      "        1. inner",
      "            1. leaf",
    ].join("\n");
    const leafMarkerEnd = doc.indexOf("leaf");

    const once = applyCommand(shiftTab, doc, leafMarkerEnd, leafMarkerEnd);
    expect(once.doc.toString()).toBe(
      ["1. top", "    1. mid", "        1. inner", "        2. leaf"].join(
        "\n",
      ),
    );

    const twicePos = once.doc.toString().lastIndexOf("leaf");
    const twice = applyCommand(
      shiftTab,
      once.doc.toString(),
      twicePos,
      twicePos,
    );
    expect(twice.doc.toString()).toBe(
      ["1. top", "    1. mid", "        1. inner", "    2. leaf"].join("\n"),
    );

    const thirdPos = twice.doc.toString().lastIndexOf("leaf");
    const thrice = applyCommand(
      shiftTab,
      twice.doc.toString(),
      thirdPos,
      thirdPos,
    );
    expect(thrice.doc.toString()).toBe(
      ["1. top", "    1. mid", "        1. inner", "2. leaf"].join("\n"),
    );
  });
});

describe("blockquote nested list editing", () => {
  const tab = createHandleSmartTab("strict");

  it("Tab nests a blockquote ordered sibling under its parent", () => {
    const doc = ["> 1. parent", "> 2. child"].join("\n");
    const childPos = doc.indexOf("2. child") + 2;
    const next = applyCommand(tab, doc, childPos, childPos);
    expect(next.doc.toString()).toBe(
      ["> 1. parent", ">     1. child"].join("\n"),
    );
  });

  it("Shift-Tab on Tab-nested blockquote item removes marker but keeps quote spacing", () => {
    const shiftTab = createHandleSmartShiftTab("strict");
    const doc = ["> 1. parent", ">     1. child"].join("\n");
    const cursorAtChildMarker = doc.indexOf("1. child") + "1. ".length;
    const next = applyCommand(
      shiftTab,
      doc,
      cursorAtChildMarker,
      cursorAtChildMarker,
    );
    expect(next.doc.toString()).toBe(["> 1. parent", ">     child"].join("\n"));
  });
});

describe("createHandleSmartBackspace strict normalization", () => {
  // 回归 #4：Backspace 拉平嵌套有序项时不应出现瞬时的重复编号
  it("normalizes duplicate marker number in the same transaction", () => {
    const cmd = createHandleSmartBackspace("strict");
    const doc = "1. parent\n    1. child";
    const cursorAtChildMarker = "1. parent\n    1. ".length;
    const next = applyCommand(
      cmd,
      doc,
      cursorAtChildMarker,
      cursorAtChildMarker,
    );
    expect(next.doc.toString()).toBe("1. parent\n2. child");
  });

  it("leaves loose mode untouched after backspace outdent", () => {
    const cmd = createHandleSmartBackspace("loose");
    const doc = "1. parent\n    1. child";
    const cursorAtChildMarker = "1. parent\n    1. ".length;
    const next = applyCommand(
      cmd,
      doc,
      cursorAtChildMarker,
      cursorAtChildMarker,
    );
    expect(next.doc.toString()).toBe("1. parent\n1. child");
  });
});
