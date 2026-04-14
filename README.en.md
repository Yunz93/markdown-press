# M記

[中文](./README.md)

<p align="center">
  <img src="./icons/markdown-press-logo-m.svg" alt="M記 logo" width="120" />
</p>

M記 is a desktop Markdown editor built with Tauri 2, React 19, and TypeScript. It is designed for local knowledge-base writing, with a strong focus on editing ergonomics, preview fidelity, and wiki-style navigation.

![M記 preview](docs/assets/markdown-press-preview.png)

## Highlights

### Editing and Preview
- Three view modes: Editor, Preview, and Split
- Linked scrolling between editor and preview in split mode
- Preview support for KaTeX, Mermaid, task lists, tables, and syntax-highlighted code blocks
- Outline panel with heading navigation, auto-highlights the current section
- Status bar showing live writing stats: characters, words, paragraphs, headings, and estimated reading time
- Wiki link hover preview with Cmd/Ctrl
- Direct preview of images, PDF, and HTML files
- External links can open in the system browser

### Markdown and Knowledge Base Features
- YAML frontmatter support with configurable metadata templates
- New files generate an H1 title that matches the file name
- Cross-file wiki links with `[[file]]` and `[[file|alias]]`
- In-document heading jumps with `[[#heading]]` and `[[heading]]`
- Block references with `[[note#^block]]`
- Local attachment embeds with `![[path/to/file]]`, optional sizing via `![[img|600]]` or `![[img|600x400]]`
- Image paste auto-saves to the resource folder, with Markdown or Obsidian link format
- `update_time` in frontmatter is automatically refreshed on save

### Files and Sidebar
- Folder-based local knowledge base workflow
- Multi-tab editing with right-click tab actions (close other tabs)
- Sidebar file tree with create, rename, and drag-and-drop move
- Vault-wide full-text search in sidebar
- Locate current file in sidebar
- Built-in Trash with restore and bulk permanent delete
- Trash directory is standardized to `.trash` and hidden from the main file tree
- Unused attachment cleanup (`Cmd+Shift+-`)

### Writing Experience
- Improved frontmatter highlighting with colored keys and neutral values
- Consistent layout rhythm between editor and preview panes
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

## Tech Stack

- Desktop framework: [Tauri 2](https://tauri.app/)
- Frontend: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- Build tool: [Vite](https://vitejs.dev/)
- State management: [Zustand](https://zustand-demo.pmnd.rs/)
- Markdown rendering: [markdown-it](https://github.com/markdown-it/markdown-it)
- Syntax highlighting: [Shiki](https://shiki.style/)
- Math rendering: [KaTeX](https://katex.org/)
- Diagrams: [Mermaid](https://mermaid.js.org/)
- AI: [Google Gemini API](https://ai.google.dev/) / [OpenAI API](https://platform.openai.com/)

## Requirements

This project currently supports macOS and Windows. Linux build/file-operation support has been removed for now.

### Common

- Node.js 18+
- Rust 1.77+
- npm 9+

### Platform Dependencies

#### macOS

```bash
xcode-select --install
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Yunz93/markdown-press.git
cd markdown-press
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure AI (optional)

You can enter the Gemini or OpenAI API key in the app settings, or provide it locally:

```env
GEMINI_API_KEY=your_api_key_here
```

OpenAI-compatible APIs are also supported; configure the base URL and key in settings.

### 4. Run in development mode

```bash
npm run tauri:dev
```

## Publish To simple-blog

The desktop app can publish the current note to a `simple-blog` repository and trigger a redeploy.

Publishing field semantics:

- `title`: article title; if omitted, publishing defaults it to the current file name
- `aliases`: article aliases; if omitted, publishing defaults it to the article title
- `slug`: published URL suffix; if omitted, publishing defaults it to the article title
- `link`: automatically written back after a successful publish
- `status`: editorial workflow only, such as `draft` or `review`; it does not control publishing
- `is_publish`: publish flag; the publish action writes it as `true`

Notes:

- The Markdown file name in the blog repository stays as the current file name
- The actual public URL in `simple-blog` is determined by `slug`
- If you want an English URL, fill in `slug` explicitly
- `aliases` is kept as metadata only and is not used to build the publish URL
- New-note metadata templates now include `slug`, `aliases`, `create_time`, and `update_time`
- When a note is edited and saved, `update_time` is refreshed automatically if it exists in frontmatter
- During publishing, regular Obsidian-style wiki links are converted into clickable Markdown links when the target note is already published (either with a saved `link`, or with `is_publish: true` and a resolvable blog URL)

## Build

### Web build

```bash
npm run build
```

### Desktop build

```bash
npm run tauri:build
```

Artifacts are generated under `src-tauri/target/release/bundle/`.

### GitHub Tag Auto Build

The repository is configured with a GitHub Actions release workflow. Push a `v`-prefixed tag to automatically build and upload macOS installers.

The macOS GitHub Release currently uses `ad-hoc signing`, so CI can build `.app` and `.dmg` artifacts without an Apple Developer certificate.

These artifacts are not notarized by Apple, so macOS may still block them on first launch and require a manual allow step.

Common workarounds:

- Right-click the app in Finder and choose `Open`
- Or run:
```bash
xattr -dr com.apple.quarantine /Applications/M記.app
```

If you want browser-downloaded macOS builds to install cleanly without manual intervention, you will still need Apple Developer signing and notarization.

## Release Smoke Test

The project includes a release smoke-test script:

```bash
npm run smoke:release
```

See [docs/RELEASE_SMOKE_TEST.md](./docs/RELEASE_SMOKE_TEST.md) for the manual checklist.

Recommended parity checks between development and release builds:

- First-file open layout after cold start
- Outline panel visibility and heading jump in preview mode
- Linked scrolling in split mode
- `[[file]]`, `[[#heading]]`, `[[note#^block]]`, and `![[attachment]]` resolution
- External links, image attachments, and PDF export
- Sidebar full-text search and locate current file

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + S` | Save current file |
| `Cmd + Shift + V` | Toggle view mode |
| `Cmd/Ctrl + J` | AI enhance |
| `Cmd + Shift + F` | In-file search |
| `Cmd + Shift + S` | Sidebar search |
| `Cmd + Shift + 0` | Open settings |
| `Cmd + Shift + O` | Toggle outline |
| `Cmd + Shift + B` | Toggle sidebar |
| `Cmd + Shift + T` | Toggle light/dark theme |
| `Cmd + Shift + K` | Open knowledge base |
| `Cmd + Shift + L` | Locate current file in sidebar |
| `Cmd + Shift + H` | Export PDF |
| `Cmd/Ctrl + N` | New note |
| `Cmd/Ctrl + Shift + N` | New folder |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd + Shift + -` | Cleanup unused attachments |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` / `Cmd/Ctrl + Y` | Redo |

## Project Structure

```text
markdown-press/
├── src/
│   ├── components/        # Editor, preview, sidebar, settings UI
│   ├── hooks/             # File operations, shortcuts, export, AI, etc.
│   ├── services/          # File system and Gemini integrations
│   ├── store/             # Zustand state
│   ├── utils/             # Markdown, frontmatter, outline, attachment helpers
│   └── types.ts           # Shared types
├── src-tauri/             # Tauri config and bundling entry
├── docs/                  # Docs and screenshots
├── scripts/               # Release validation scripts
└── README.md              # Default Chinese README
```

## Development Notes

- Dark mode is the default theme
- `.trash` is an internal application directory and should not be edited manually
- The preview pipeline supports wiki links, heading jumps, block references, and attachment resolution
- Settings allow separate UI, editor, preview, and code font configuration
- The bundled default Chinese font is LXGW WenKai; see `src/assets/fonts/LXGWWenKai-OFL.txt` for its license
- External file change watch: if a file is modified outside the app with no unsaved edits, it reloads automatically

## Contributing

Issues and pull requests are welcome. Before submitting changes, run:

```bash
npm run build
npm run smoke:release
```

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
