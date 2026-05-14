# M記

[中文](./README.md) · [Development guide](./docs/DEVELOPMENT.en.md)

A local-first Markdown editor for knowledge-base writing: tight editor–preview parity, smooth wiki and attachment workflows, desktop builds on Tauri.

> Goal: a focused Markdown writing flow—lighter than Obsidian, smoother day-to-day than Typora for many writers.

![M記 preview](https://raw.githubusercontent.com/Yunz93/PicRepo/main/image/M%20%E8%A8%98-1776170252301.png)

## Download

Grab the installer for your platform from [GitHub Releases](https://github.com/Yunz93/markdown-press/releases).

### macOS

The app is not Apple-notarized, so Gatekeeper may block it. After moving **M記.app** to Applications, run:

```bash
xattr -cr /Applications/M記.app
```

If it is still in Downloads, use `~/Downloads/M記.app` instead.

### Windows

Run the `.exe` installer. If SmartScreen appears, choose **More info** → **Run anyway**. After install, **Settings → About** can check for newer GitHub Release builds.

## Highlights

- **Local vault**: Folder-based library with tabs, sidebar, and search; notes and assets stay on disk under your control.
- **Editor–preview parity**: Multiple writing layouts; preview renders Markdown plus common extensions (math, diagrams, highlighted code); outline for structure at a glance.
- **Knowledge-base Markdown**: Familiar wiki links and `![[embeds]]`, configurable YAML metadata and templates, images handled in the same reference flow.
- **Export & publish**: PDF, plain text, and a single long-image share from the preview; toolbar publishing to **simple-blog** (GitHub + Vercel) or **WeChat Official Account drafts**.
- **Optional AI assist**: Switch between Gemini and an OpenAI-compatible API for polish, summaries, tags, and generating entries from a selection.

## Keyboard shortcuts

Defaults below; the full list lives in **Settings → Shortcuts**.

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + S` | Save |
| `Cmd/Ctrl + 0` | Settings |
| `Cmd/Ctrl + 1` ~ `5` | Sidebar / outline / view mode / theme / AI enhance |
| `Cmd + Shift + F` | In-file search |
| `Cmd + Shift + S` | Sidebar search |
| `Cmd + Shift + K` / `L` | Open vault / locate current file |
| `Cmd + Shift + H` | Export PDF |
| `Cmd/Ctrl + N` / `Cmd/Ctrl + Shift + N` | New note / new folder |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd + Shift + -` | Clean unused attachments |
| `Escape` | Close search panel, dialog, or menu |

## Publish to simple-blog

In **Settings → Publishing**, set:

- **Blog repository URL** (`https://github.com/owner/repo`, `git@github.com:owner/repo.git`, or `owner/repo`)
- **Public blog site URL** (used to write back `link` in frontmatter, e.g. `https://your-domain` or `your-app.vercel.app`)
- **GitHub token**: Fine-grained PAT with **Contents: Read and write** on the target repo

On publish, the app saves the note, sets `is_publish: true`, syncs `posts/` and images, rewrites image links to raw URLs, and pushes so Vercel redeploys.

Common frontmatter: `title`, `aliases`, `slug`, `link` (filled after publish), `status` (editorial only, not publish gate), `is_publish`. Empty `title` / `aliases` / `slug` can fall back to file name or title; the repo file name does not change when you edit `slug`.

## Publish to WeChat drafts

Same settings tab: **App ID** and **App Secret** (App Secret stays in secure local storage only). From the toolbar, pick the WeChat channel: confirm title, author, digest, and source URL; pick the cover at publish time; local images in the body upload automatically. First publish stores `wechat_draft_media_id`; republishing updates that draft. One account and single-article drafts for now; server-side calls may require allowlisting the outbound IP on the WeChat platform.

## License

[MIT License](./LICENSE)

## Acknowledgements

[Tauri](https://tauri.app/) · [React](https://react.dev/) · [markdown-it](https://github.com/markdown-it/markdown-it) · [Shiki](https://shiki.style/) · [KaTeX](https://katex.org/) · [Mermaid](https://mermaid.js.org/) · [Google Gemini](https://ai.google.dev/) · [OpenAI](https://openai.com/)
