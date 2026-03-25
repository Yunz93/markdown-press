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
- Outline panel with heading navigation
- External links can open in the system browser

### Markdown and Knowledge Base Features
- YAML frontmatter support with configurable metadata templates
- New files generate an H1 title that matches the file name
- Cross-file wiki links with `[[file]]`
- In-document heading jumps with `[[#heading]]` and `[[heading]]`
- Local attachment embeds with `![[path/to/file]]`
- Image attachments render inline in preview; non-image attachments can be revealed in the system file explorer

### Files and Sidebar
- Folder-based local knowledge base workflow
- Multi-tab editing
- Sidebar file tree with create, rename, and drag-and-drop move
- Built-in Trash with restore and bulk permanent delete
- Trash directory is standardized to `.trash` and hidden from the main file tree
- Right-click tab actions, including close other tabs

### Writing Experience
- Improved frontmatter highlighting with colored keys and neutral values
- Consistent layout rhythm between editor and preview panes
- Independent English and Chinese font configuration, with bundled LXGW WenKai as the default Chinese font
- Dark mode as the default theme
- Configurable core keyboard shortcuts in settings

### AI and Export
- Google Gemini integration for writing enhancement and metadata generation
- PDF export
- Publish flag workflow by marking notes as `is_publish: true`

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
- AI: [Google Gemini API](https://ai.google.dev/)

## Requirements

This project currently supports macOS only. Windows and Linux build/file-operation support has been removed for now.

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

You can enter the Gemini API key in the app settings, or provide it locally:

```env
GEMINI_API_KEY=your_api_key_here
```

### 4. Run in development mode

```bash
npm run tauri:dev
```

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
- `[[file]]`, `[[#heading]]`, and `![[attachment]]` resolution
- External links, image attachments, and PDF export

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Save current file |
| `Ctrl/Cmd + E` | Toggle view mode |
| `Ctrl/Cmd + J` | AI enhance |
| `Ctrl/Cmd + F` | Open search |
| `Ctrl/Cmd + 0` | Open settings |
| `Ctrl/Cmd + O` | Toggle outline |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |

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
- The preview pipeline supports wiki links, heading jumps, and attachment resolution
- Settings allow separate English and Chinese font configuration
- The bundled default Chinese font is LXGW WenKai; see `src/assets/fonts/LXGWWenKai-OFL.txt` for its license

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
