# M記

[English](./README.en.md)

<p align="center">
  <img src="./icons/markdown-press-logo-m.svg" alt="M記 logo" width="120" />
</p>

M記 是一个简单易用的 Markdown 编辑器，面向本地知识库写作场景，强调编辑体验、预览一致性和知识库链接能力，基于 Tauri 2、React 19 和 TypeScript 构建。

>初衷就是开发一个比Typora更好用，比Obsidian更易用的Markdown编辑器。

![M記 preview](docs/assets/markdown-press-preview.png)

## 功能概览

### 编辑与预览
- 三种视图模式便捷切换：编辑、分屏、预览（尝试实现Typora的实时编辑预览功能，折腾了一个周末搞不定稳定性问题，遂作罢）
- 支持 KaTeX 数学公式、Mermaid 图表、任务列表、表格、代码高亮预览渲染（有问题，待完善）
- 支持章节导航

### Markdown 与知识库能力
- 支持 YAML frontmatter，并可自定义新建文件的属性模板
- 支持完整Markdown语法
- 支持Obsidian知识库内联语法

### 文件与侧边栏
- 支持基于本地文件夹的知识库管理，支持文件/文件夹常用操作
- 支持多标签页编辑
- 内置 Trash，支持软删除

### 写作体验
- 支持中英文字体配置
- 默认暗色主题，支持亮色/暗色主题切换
- 支持常用快捷键，并可在设置页调整核心快捷键

### AI 与导出（待完善）
- 集成 Google Gemini
- 支持 HTML 导出
- 支持博客一键发布

### 多端支持（待完善）
- MacOS
- Linux
- Windows

## 截图

### 主工作区

![M記 workspace](docs/assets/markdown-press-preview.png)

## 技术栈

- 桌面框架: [Tauri 2](https://tauri.app/)
- 前端: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- 构建工具: [Vite](https://vitejs.dev/)
- 状态管理: [Zustand](https://zustand-demo.pmnd.rs/)
- Markdown 渲染: [markdown-it](https://github.com/markdown-it/markdown-it)
- 代码高亮: [Shiki](https://shiki.style/)
- 数学公式: [KaTeX](https://katex.org/)
- 图表: [Mermaid](https://mermaid.js.org/)
- AI: [Google Gemini API](https://ai.google.dev/)

## 安装要求

当前仅支持 macOS。Windows / Linux 未测试，已暂时移除。

### 通用要求

- Node.js 18+
- Rust 1.77+
- npm 9+

### 平台依赖

#### macOS

```bash
xcode-select --install
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/Yunz93/markdown-press.git
cd markdown-press
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 AI（可选）

可在应用设置页填写 Gemini API Key，或在本地准备环境变量：

```env
GEMINI_API_KEY=your_api_key_here
```

### 4. 启动开发模式

```bash
npm run tauri:dev
```

## 构建发布

### Web 构建

```bash
npm run build
```

### 桌面应用构建

```bash
npm run tauri:build
```

构建产物默认位于 `src-tauri/target/release/bundle/`。

### GitHub Tag 自动构建

仓库已配置 GitHub Actions 发布流程，推送 `v` 前缀标签后会自动构建并上传 macOS 安装包。

```bash
git tag v0.1.1
git push origin v0.1.1
```

CI 会自动将 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的版本号同步为当前 tag 对应版本，再执行 Tauri 打包和 GitHub Release 上传。

## Release 校验

项目已提供 release 冒烟检查脚本：

```bash
npm run smoke:release
```

配套检查清单见 [docs/RELEASE_SMOKE_TEST.md](./docs/RELEASE_SMOKE_TEST.md)。

## 常用快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Ctrl/Cmd + S` | 保存当前文件 |
| `Ctrl/Cmd + E` | 切换视图模式 |
| `Ctrl/Cmd + J` | AI 增强 |
| `Ctrl/Cmd + F` | 打开搜索 |
| `Ctrl/Cmd + 0` | 打开设置 |
| `Ctrl/Cmd + O` | 切换 Outline |
| `Ctrl/Cmd + B` | 切换侧边栏 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | 重做 |

## 开发说明

- 默认主题为暗色模式
- `.trash` 为应用内部回收站目录，不应手动编辑
- 预览层支持 wiki link、heading link 与附件解析
- 设置页支持分别配置英文和中文字体
- 内置中文默认字体为霞鹜文楷，许可证见 `src/assets/fonts/LXGWWenKai-OFL.txt`

## 贡献

欢迎提交 Issue 和 Pull Request。提交前建议至少执行：

```bash
npm run build
npm run smoke:release
```

## 许可证

本项目代码基于 [MIT License](./LICENSE) 开源；随应用分发的 `LXGWWenKai-Regular.ttf` 字体基于 [SIL Open Font License 1.1](./src/assets/fonts/LXGWWenKai-OFL.txt) 授权。

## 致谢

- [Tauri](https://tauri.app/)
- [React](https://react.dev/)
- [markdown-it](https://github.com/markdown-it/markdown-it)
- [Shiki](https://shiki.style/)
- [KaTeX](https://katex.org/)
- [Mermaid](https://mermaid.js.org/)
- [Google Gemini](https://ai.google.dev/)
