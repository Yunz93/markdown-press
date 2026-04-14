# M記 Development Guide

[中文](./DEVELOPMENT.md) · [Back to README](../README.en.md)

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

The repository is configured with a GitHub Actions release workflow. Push a `v`-prefixed tag to automatically build and upload macOS / Windows installers.

```bash
git tag v0.1.1
git push origin v0.1.1
```

CI automatically syncs the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` to the tag, then runs the Tauri build and uploads to GitHub Releases.

The macOS GitHub Release currently uses `ad-hoc signing`, so CI can produce `.app` and `.dmg` artifacts without an Apple Developer certificate. For a seamless install experience without manual intervention, Apple Developer signing and notarization are required.

## Release Smoke Test

The project includes a release smoke-test script:

```bash
npm run smoke:release
```

See [RELEASE_SMOKE_TEST.md](./RELEASE_SMOKE_TEST.md) for the manual checklist.

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
