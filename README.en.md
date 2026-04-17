# M記

[中文](./README.md) · [Development Guide](./docs/DEVELOPMENT.en.md)

<p align="center">
  <img src="./icons/markdown-press-logo-m.svg" alt="M記 logo" width="120" />
</p>

M記 is a desktop Markdown editor designed for local knowledge-base writing, with a strong focus on editing ergonomics, preview fidelity, and wiki-style navigation.

![M記 preview](docs/assets/markdown-press-preview.png)

## Download

Head to [GitHub Releases](https://github.com/Yunz93/markdown-press/releases) for the latest build.

### macOS

The app is not notarized by Apple, so macOS will show a "damaged" or "unverified developer" warning. To install:

1. Download the `.dmg` file and drag the app into the Applications folder
2. Open Terminal and run:
```bash
xattr -cr /Applications/M記.app
```
3. Double-click the app to launch it

> If the app is still in your Downloads folder, replace the path with `~/Downloads/M記.app`.

### Windows

Download the `.exe` installer and run it. If Windows SmartScreen blocks the launch, click "More info" → "Run anyway".

## Highlights

### Editing and Preview
- Three view modes: Editor, Preview, and Split
- Linked scrolling between editor and preview in split mode
- Preview support for KaTeX, Mermaid, task lists, tables, and syntax-highlighted code blocks
- Outline panel with heading navigation, auto-highlights the current section
- Status bar showing live writing stats: characters, words, paragraphs, headings, and estimated reading time
- Wiki link hover preview with Cmd/Ctrl
- Direct preview of images, PDF, and HTML files

### Markdown and Knowledge Base Features
- YAML frontmatter support with configurable metadata templates
- Cross-file wiki links with `[[file]]` and `[[file|alias]]`
- In-document heading jumps with `[[#heading]]` and `[[heading]]`
- Block references with `[[note#^block]]`
- Local attachment embeds with `![[path/to/file]]`, optional sizing via `![[img|600]]` or `![[img|600x400]]`
- Image paste auto-saves to the resource folder, with Markdown or Obsidian link format
- `date modified` (or compatible keys such as `update_time`) in frontmatter is automatically refreshed on save

### Files and Sidebar
- Folder-based local knowledge base workflow
- Multi-tab editing with right-click tab actions (close other tabs)
- Sidebar file tree with create, rename, and drag-and-drop move
- Vault-wide full-text search in sidebar
- Locate current file in sidebar
- Built-in Trash with restore and bulk permanent delete
- Unused attachment cleanup (`Cmd+Shift+-`)

### Writing Experience
- Independent UI, editor, preview, and code font configuration, with bundled LXGW WenKai as the default Chinese font
- Configurable UI font size
- Dark mode as the default theme
- Configurable core keyboard shortcuts in settings
- Format Markdown on manual save (ordered list strict/loose mode)
- Configurable auto-save interval (5 seconds to 30 minutes)
- In-file search and replace (regex, case-sensitive)

### AI and Export
- Dual AI provider: Google Gemini and OpenAI-compatible API, with custom system prompt and model selection
- AI document enhancement: grammar polish, SEO summary, tag generation
- Generate wiki article from selected text with automatic back-linking
- PDF export
- Publish to a `simple-blog` GitHub repository with automatic Vercel deployment

## Screenshot

### Main Workspace

![M記 workspace](docs/assets/markdown-press-preview.png)

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + S` | Save current file |
| `Cmd/Ctrl + 0` | Open settings |
| `Cmd/Ctrl + 1` | Toggle sidebar |
| `Cmd/Ctrl + 2` | Toggle outline |
| `Cmd/Ctrl + 3` | Toggle view mode |
| `Cmd/Ctrl + 4` | Toggle light/dark theme |
| `Cmd/Ctrl + 5` | AI enhance |
| `Cmd + Shift + F` | In-file search |
| `Cmd + Shift + S` | Sidebar search |
| `Cmd + Shift + K` | Open knowledge base |
| `Cmd + Shift + L` | Locate current file in sidebar |
| `Cmd + Shift + H` | Export PDF |
| `Cmd/Ctrl + N` | New note |
| `Cmd/Ctrl + Shift + N` | New folder |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd + Shift + -` | Cleanup unused attachments |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` / `Cmd/Ctrl + Y` | Redo |

## Publish to simple-blog

The desktop app can publish the current note to a `simple-blog` repository and trigger a redeploy.

Publishing field semantics:

- `title`: article title; if omitted, defaults to the current file name
- `aliases`: article aliases; if omitted, defaults to the article title
- `slug`: published URL suffix; if omitted, defaults to the article title
- `link`: automatically written back after a successful publish
- `status`: editorial workflow only, such as `draft` or `review`; does not control publishing
- `is_publish`: publish flag; the publish action writes it as `true`

Notes:

- The Markdown file name in the blog repository stays as the current file name
- The actual public URL in `simple-blog` is determined by `slug`
- If you want an English URL, fill in `slug` explicitly
- `aliases` is kept as metadata only and is not used to build the publish URL
- New-note metadata templates include `slug`, `aliases`, `date created`, and `date modified`
- When a note is edited and saved, `date modified` (or compatible keys such as `update_time`) is refreshed automatically if it exists in frontmatter
- During publishing, Obsidian-style wiki links are converted into clickable Markdown links when the target note is already published

## License

The application code is licensed under the [MIT License](./LICENSE). The bundled `LXGWWenKai-Regular.ttf` font is distributed under the [SIL Open Font License 1.1](./src/assets/fonts/LXGWWenKai-OFL.txt).

## Acknowledgements

- [Tauri](https://tauri.app/)
- [React](https://react.dev/)
- [markdown-it](https://github.com/markdown-it/markdown-it)
- [Shiki](https://shiki.style/)
- [KaTeX](https://katex.org/)
- [Mermaid](https://mermaid.js.org/)
- [Google Gemini](https://ai.google.dev/)
- [OpenAI](https://openai.com/)
