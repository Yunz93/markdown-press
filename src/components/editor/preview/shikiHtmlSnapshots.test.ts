import { describe, expect, it } from "vitest";
import {
  protectShikiPresInHtmlString,
  restoreShikiPresFromSnapshots,
} from "./shikiHtmlSnapshots";

describe("shikiHtmlSnapshots", () => {
  it("round-trips Shiki pre HTML without relying on DOM serialization", () => {
    const pre =
      '<pre class="shiki markdown-press-light" style="background-color:#f8fafc"><code>' +
      '<span style="color:#C2410C">const</span></code></pre>';
    const html = `<p>x</p>${pre}<p>y</p>`;
    const snapshots: string[] = [];
    const protectedHtml = protectShikiPresInHtmlString(html, snapshots);
    expect(protectedHtml).toContain('data-mp-shiki-slot="0"');
    expect(protectedHtml).toContain('data-mp-shiki-h="');
    expect(protectedHtml).not.toContain("color:#C2410C");

    const fakeDomReadback = protectedHtml;
    expect(restoreShikiPresFromSnapshots(fakeDomReadback, snapshots)).toBe(
      html,
    );
  });

  it("handles multiple blocks and note-style concatenation", () => {
    const a =
      '<pre class="shiki markdown-press-dark"><code><span style="color:red">1</span></code></pre>';
    const b =
      '<pre class="shiki markdown-press-light"><code><span style="color:blue">2</span></code></pre>';
    const snapshots: string[] = [];
    let html = protectShikiPresInHtmlString(`<div>${a}</div>`, snapshots);
    html = protectShikiPresInHtmlString(
      `${html}<article>${b}</article>`,
      snapshots,
    );
    expect(snapshots).toHaveLength(2);
    const restored = restoreShikiPresFromSnapshots(html, snapshots);
    expect(restored).toContain("color:red");
    expect(restored).toContain("color:blue");
  });

  it("round-trips wrapped Shiki blocks", () => {
    const wrapped =
      '<div class="mp-shiki-block"><pre class="shiki markdown-press-light" style="background-color:#0f172a"><code>' +
      '<span style="color:hotpink">x</span></code></pre></div>';
    const html = `<p>a</p>${wrapped}<p>b</p>`;
    const snapshots: string[] = [];
    const protectedHtml = protectShikiPresInHtmlString(html, snapshots);
    expect(snapshots).toHaveLength(1);
    expect(protectedHtml).toContain('data-mp-shiki-slot="0"');
    expect(protectedHtml).not.toContain("hotpink");
    const restored = restoreShikiPresFromSnapshots(protectedHtml, snapshots);
    expect(restored).toBe(html);
  });

  it("does not accidentally replace user-authored placeholder-like HTML", () => {
    const pre =
      '<pre class="shiki"><code><span style="color:hotpink">x</span></code></pre>';
    const snapshots: string[] = [];

    const originalHtml = [
      "<p>before</p>",
      // User-authored marker that resembles our token, but without the hash attribute.
      '<div data-mp-shiki-slot="0"></div>',
      pre,
      "<p>after</p>",
    ].join("");

    const protectedHtml = protectShikiPresInHtmlString(originalHtml, snapshots);
    expect(snapshots).toHaveLength(1);

    const restored = restoreShikiPresFromSnapshots(protectedHtml, snapshots);
    // The user-authored placeholder remains unchanged.
    expect(restored).toContain('<div data-mp-shiki-slot="0"></div>');
    // The Shiki <pre> is restored.
    expect(restored).toContain("color:hotpink");
  });

  it("tolerates missing slots during restore", () => {
    const pre =
      '<pre class="shiki"><code><span style="color:green">ok</span></code></pre>';
    const snapshots: string[] = [];
    const protectedHtml = protectShikiPresInHtmlString(
      `<div>${pre}</div>`,
      snapshots,
    );
    expect(snapshots).toHaveLength(1);

    // Simulate a DOM pipeline that drops the placeholder entirely.
    const dropped = protectedHtml.replace(
      /<div data-mp-shiki-slot="0"[^>]*><\/div>/,
      "",
    );
    const restored = restoreShikiPresFromSnapshots(dropped, snapshots);
    expect(restored).not.toContain("data-mp-shiki-slot=");
    expect(restored).not.toContain("color:green");
  });

  it("returns html unchanged when there are no shiki blocks", () => {
    const html = "<p>plain text</p><code>inline</code>";
    const snapshots: string[] = [];
    expect(protectShikiPresInHtmlString(html, snapshots)).toBe(html);
    expect(snapshots).toHaveLength(0);
    expect(restoreShikiPresFromSnapshots(html, snapshots)).toBe(html);
  });

  it("restores snapshot even when placeholder has a different hash (WKWebView robustness)", () => {
    // Hash verification was removed because WKWebView may reorder or modify
    // attributes during innerHTML serialization. The slot id is sufficient to
    // identify the correct snapshot.
    const pre =
      '<pre class="shiki"><code><span style="color:purple">secret</span></code></pre>';
    const snapshots: string[] = [];
    const protectedHtml = protectShikiPresInHtmlString(pre, snapshots);
    const tampered = protectedHtml.replace(
      /data-mp-shiki-h="[^"]+"/,
      'data-mp-shiki-h="00000000"',
    );
    const restored = restoreShikiPresFromSnapshots(tampered, snapshots);
    // Placeholder is replaced even with a mismatched hash — slot id alone is trusted.
    expect(restored).not.toContain('data-mp-shiki-slot="0"');
    expect(restored).toContain("color:purple");
  });

  it("protects empty html without creating snapshots", () => {
    const snapshots: string[] = [];
    expect(protectShikiPresInHtmlString("", snapshots)).toBe("");
    expect(snapshots).toHaveLength(0);
  });
});
