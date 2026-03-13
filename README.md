# Markdown Press

A modern, AI-powered Markdown editor built with Tauri, React, and TypeScript. Write, preview, and enhance your documents with intelligent AI assistance.

## Features

### Core Editing
- **Real-time Markdown Preview** - Three view modes: Editor, Preview, and Split view
- **Syntax Highlighting** - Powered by Shiki for beautiful code blocks
- **Math Rendering** - KaTeX support for mathematical expressions
- **Diagrams** - Mermaid integration for flowcharts and diagrams
- **Task Lists** - Interactive checkbox support

### File Management
- **Knowledge Base** - Organize your notes with folder-based knowledge bases
- **File Tree** - Navigate and manage files with an intuitive sidebar
- **Multi-tab Support** - Work on multiple files simultaneously
- **Auto-save** - Automatic saving with configurable intervals
- **Trash & Recovery** - Safe file deletion with restore capability

### AI Enhancement
- **Smart Analysis** - Powered by Google Gemini AI
- **Auto-generated Frontmatter** - Automatically creates YAML metadata
- **SEO Optimization** - Generate SEO-friendly titles and descriptions
- **Tag Suggestions** - AI-powered tag recommendations

### User Experience
- **Multiple Themes** - Light, Dark, Solarized Light, Solarized Dark, and Custom CSS
- **Document Outline** - Quick navigation via heading hierarchy
- **Full-text Search** - Find content across your documents
- **Keyboard Shortcuts** - Efficient workflow with customizable shortcuts
- **Undo/Redo** - Full history support

### Export Options
- **PDF Export** - Export preview to PDF format
- **Blog Publishing** - Publish directly to your blog

## Screenshots

### Main Workspace

![Markdown Press preview](docs/assets/markdown-press-preview.png)

## Tech Stack

- **Framework**: [Tauri 2.x](https://tauri.app/) - Cross-platform desktop apps
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Markdown**: [markdown-it](https://github.com/markdown-it/markdown-it)
- **Syntax Highlighting**: [Shiki](https://shiki.style/)
- **Math Rendering**: [KaTeX](https://katex.org/)
- **Diagrams**: [Mermaid](https://mermaid.js.org/)
- **AI**: [Google Gemini API](https://ai.google.dev/)

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/) (v1.77 or later)
- [pnpm](https://pnpm.io/) or [npm](https://www.npmjs.com/)

### Platform-specific Requirements

#### macOS
```bash
xcode-select --install
```

#### Windows
- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (Windows 10/11 includes this by default)

#### Linux
```bash
# Debian/Ubuntu
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Arch Linux
sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel libayatana-appindicator-gtk3-devel librsvg2-devel
```

## Development

### Clone the Repository

```bash
git clone https://github.com/Yunz93/markdown-press.git
cd markdown-press
```

### Install Dependencies

```bash
npm install
```

### Configure AI (Optional)

Create a `.env.local` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
```

Or configure the API key in the app settings after launch.

### Run in Development Mode

```bash
npm run tauri:dev
```

This will start the Vite dev server and launch the Tauri application.

## Build

### Build for Production

```bash
npm run tauri:build
```

The built application will be available in `src-tauri/target/release/bundle/`:

| Platform | Output |
|----------|--------|
| macOS | `.dmg`, `.app` |
| Windows | `.msi`, `.exe` |
| Linux | `.deb`, `.AppImage` |

### Build for Specific Platform

```bash
# Build only for current platform
npm run tauri:build

# Or use Tauri CLI directly
npx tauri build --target universal-apple-darwin  # macOS Universal
npx tauri build --target x86_64-pc-windows-msvc   # Windows x64
npx tauri build --target x86_64-unknown-linux-gnu # Linux x64
```

## Project Structure

```
markdown-press/
├── src/                    # React frontend source
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # External service integrations
│   ├── store/              # Zustand state management
│   ├── utils/              # Utility functions
│   └── types.ts            # TypeScript type definitions
├── src-tauri/              # Tauri backend (Rust)
│   ├── src/                # Rust source code
│   ├── icons/              # Application icons
│   └── tauri.conf.json     # Tauri configuration
├── package.json            # Node.js dependencies
├── vite.config.ts          # Vite configuration
└── tailwind.config.cjs     # TailwindCSS configuration
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save file |
| `Ctrl/Cmd + Shift + A` | AI Analyze |
| `Ctrl/Cmd + F` | Search |
| `Ctrl/Cmd + 0` | Open Settings |
| `Ctrl/Cmd + O` | Toggle Outline |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing cross-platform framework
- [Shiki](https://shiki.style/) - For beautiful syntax highlighting
- [Google Gemini](https://ai.google.dev/) - For AI capabilities

---

Made with ❤️ by [Yunz93](https://github.com/Yunz93)
