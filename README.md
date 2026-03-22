# M記

[English](./README.en.md)

<p align="center">
  <img src="./icons/markdown-press-logo-m.svg" alt="M記 logo" width="120" />
</p>

M記 是一个基于 Tauri 2、React 19 和 TypeScript 构建的桌面 Markdown 编辑器，面向本地知识库写作场景，强调编辑体验、预览一致性和知识库链接能力。

![M記 preview](docs/assets/markdown-press-preview.png)

## 功能概览

### 编辑与预览
- 三种视图模式：编辑、预览、分屏
- 分屏模式支持编辑区与预览区关联滚动
- 预览区支持 KaTeX 数学公式、Mermaid 图表、任务列表、表格、代码高亮
- Outline 目录支持章节导航
- 预览区外链可直接调用系统浏览器打开

### Markdown 与知识库能力
- 支持 YAML frontmatter，并可自定义新建文件的属性模板
- 新建文件时自动生成与文件名同步的一级标题
- 支持 `[[文件]]` 跨文件 wiki link
- 支持 `[[#章节]]`、`[[章节]]` 文内章节跳转
- 支持 `![[附件路径]]` 本地附件访问
- 图片附件可在预览区直接渲染，其他附件可在系统文件浏览器中定位

### 文件与侧边栏
- 基于本地文件夹的知识库管理
- 多标签页编辑
- 侧边栏文件树支持新建、重命名、拖拽移动
- 内置 Trash 软删除、恢复、批量永久删除
- 回收站目录统一为 `.trash`，并默认隐藏，不在主文件树显示
- 标签页支持右键关闭其他标签

### 写作体验
- 编辑区 frontmatter 属性高亮优化，key 与 value 分离渲染
- 编辑区与预览区版式、边距、卡片风格保持一致
- 支持中英文字体分别配置，中文默认内置霞鹜文楷并随版本打包分发
- 默认暗色主题，支持亮色/暗色切换
- 支持常用快捷键，并可在设置页调整核心快捷键

### AI 与导出
- 集成 Google Gemini，可用于内容增强与元数据生成
- 支持 PDF 导出
- 支持将文章标记为 `is_publish: true` 并保存

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

### 通用要求

- Node.js 18+
- Rust 1.77+
- npm 9+

### 平台依赖

#### macOS

```bash
xcode-select --install
```

#### Windows

- 安装 Visual Studio C++ Build Tools
- 安装或启用 WebView2

#### Linux

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Arch Linux
sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel libayatana-appindicator-gtk3-devel librsvg2-devel
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

## Release 校验

项目已提供 release 冒烟检查脚本：

```bash
npm run smoke:release
```

配套检查清单见 [docs/RELEASE_SMOKE_TEST.md](./docs/RELEASE_SMOKE_TEST.md)。

建议重点检查以下行为是否与开发模式一致：

- 冷启动后首次打开文件的编辑区宽度
- 纯预览模式下 outline 目录展开与跳转
- 分屏模式下编辑区与预览区联动滚动
- `[[文件]]`、`[[#章节]]`、`![[附件]]` 解析与跳转
- 预览区外链、图片附件和 PDF 导出

## 常用快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Ctrl/Cmd + S` | 保存当前文件 |
| `Ctrl/Cmd + E` | 切换视图模式 |
| `Ctrl/Cmd + J` | AI 增强 |
| `Ctrl/Cmd + F` | 打开搜索 |
| `Ctrl/Cmd + 0` | 打开设置 |
| `Ctrl/Cmd + O` | 切换 Outline |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | 重做 |

## 项目结构

```text
markdown-press/
├── src/
│   ├── components/        # 编辑器、预览、侧边栏、设置等 UI
│   ├── hooks/             # 文件操作、快捷键、导出、AI 等逻辑
│   ├── services/          # 文件系统、Gemini 等服务
│   ├── store/             # Zustand 状态管理
│   ├── utils/             # Markdown、frontmatter、outline、附件解析等工具
│   └── types.ts           # 应用类型定义
├── src-tauri/             # Tauri 配置与打包入口
├── docs/                  # 项目文档与截图
├── scripts/               # 发布校验脚本等
└── README.en.md           # 英文版 README
```

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
