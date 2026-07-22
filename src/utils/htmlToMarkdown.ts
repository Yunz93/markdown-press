import TurndownService from "turndown";

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

let turndownService: TurndownService | null = null;

function getTurndownService(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
      strongDelimiter: "**",
    });
  }
  return turndownService;
}

/**
 * Convert HTML clipboard content to Markdown.
 * Scripts/styles are stripped before conversion.
 */
export function convertHtmlToMarkdown(html: string): string {
  const cleaned = stripScriptsAndStyles(html).trim();
  if (!cleaned) return "";

  return getTurndownService().turndown(cleaned).trim();
}
