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
- 分屏模式下编辑区与预览区联动滚动
- 支持 KaTeX 数学公式、Mermaid 图表、任务列表、表格、代码高亮预览渲染
- 支持章节导航（Outline 面板，自动跟随当前位置高亮）
- 底部状态栏实时显示字数、字符数、段落数、标题数和预计阅读时长
- Wiki 链接 Cmd/Ctrl+悬停预览
- 支持直接预览打开图片、PDF、HTML 文件

### Markdown 与知识库能力
- 支持 YAML frontmatter，并可自定义新建文件的属性模板
- 支持完整 Markdown 语法
- 支持 Obsidian 知识库内联语法：`[[note]]`、`[[note|alias]]`、`[[#heading]]`、`[[note#^block]]` 块引用
- 支持附件嵌入 `![[path]]`，可选指定尺寸（如 `![[img|600]]`、`![[img|600x400]]`）
- 图片粘贴自动保存至资源文件夹，支持 Markdown / Obsidian 两种链接格式
- 编辑并保存时，如果 frontmatter 中存在 `update_time`，应用会自动刷新它的值

### 文件与侧边栏
- 支持基于本地文件夹的知识库管理，支持文件/文件夹常用操作（创建、重命名、拖拽移动）
- 支持多标签页编辑，右键标签可关闭其他标签
- 侧边栏支持知识库全文搜索
- 支持在侧边栏定位当前文件
- 内置 Trash，支持软删除与还原
- 支持清理未引用附件（`Cmd+Shift+-`）

### 写作体验
- 支持分别配置界面字体/编辑字体/预览字体/代码字体，以及界面字体大小
- 内置中文默认字体霞鹜文楷
- 默认暗色主题，支持亮色/暗色主题切换
- 支持常用快捷键，并可在设置页调整核心快捷键
- 支持手动保存时格式化 Markdown（有序列表严格/宽松模式）
- 支持可配置的自动保存间隔（5 秒 – 30 分钟）
- 当前文件搜索与替换（支持正则、区分大小写）

### AI 与导出
- 集成 Google Gemini 和 OpenAI 兼容 API（双 Provider 可切换），支持自定义 System Prompt 和模型选择
- AI 文章增强：语法润色、SEO 摘要、标签生成
- AI 从选中文本生成 Wiki 词条并自动回链
- 支持 PDF 导出
- 支持发布到 `simple-blog` 关联的 GitHub 仓库，并直接触发 Vercel 部署

### 多端支持（待完善）
- macOS
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
- AI: [Google Gemini API](https://ai.google.dev/) / [OpenAI API](https://platform.openai.com/)

## 安装要求

支持 macOS 和 Windows。Linux 构建与文件操作支持已暂时移除。

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

可在应用设置页填写 Gemini 或 OpenAI API Key，或在本地准备环境变量：

```env
GEMINI_API_KEY=your_api_key_here
```

也支持 OpenAI 兼容 API，可在设置页配置 Base URL 和 Key。

### 4. 启动开发模式

```bash
npm run tauri:dev
```

## 发布到 simple-blog

桌面端支持把当前笔记发布到 `simple-blog`，并触发博客重新部署。

在 M記 的 `Settings -> Publishing` 中配置：

- `Blog Repository URL`
- `GitHub Token`

点击工具栏的发布按钮后，应用会自动：

1. 保存当前笔记，并写入 `is_publish: true`
2. 把当前文章同步到博客仓库的 `posts/`
3. 将文章内引用的本地图片同步到博客仓库的 `resource/`
4. 自动把图片链接改写成对应 GitHub 文件的 raw URL
5. 通过 GitHub API 直接更新远端 GitHub 仓库，由 Vercel Git 集成触发部署

发布字段约定：

- `title`：文章标题；如果未填写，发布时默认使用当前文件名
- `aliases`：文章别名；如果未填写，发布时默认使用文章标题
- `slug`：文章发布 URL 后缀；如果未填写，发布时默认使用文章标题
- `link`：发布完成后自动回填为最终文章地址
- `status`：仅用于写作流程，例如 `draft`、`review`；不参与发布判断
- `is_publish`：发布标记；发布动作会写入 `true`

说明：

- 博客仓库中的 Markdown 文件名保持当前文件名，不会因为 `slug` 或 `aliases` 改名
- simple-blog 的真实访问地址由 `slug` 决定；如果需要英文 URL，应手动填写 `slug`
- `aliases` 不参与发布 URL 计算，只作为文章别名字段保留
- 新建笔记默认 metadata 模板已内置 `slug`、`aliases`、`create_time`、`update_time`
- 编辑并保存时，如果 frontmatter 中存在 `update_time`，应用会自动刷新它的值

支持的仓库格式：

- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git`
- `owner/repo`

`GitHub Token` 需要使用 Fine-grained Personal Access Token，并为目标仓库开启 `Contents: Read and write` 权限。

发布时会继续处理图片类附件与标准 Markdown 图片引用；对于 Obsidian 风格的普通 wiki 链接，如果目标笔记已经发布（存在 `link`，或 `is_publish: true` 且可推导出博客地址），会自动转换成可点击跳转的普通链接。

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

当前仓库的 macOS GitHub Release 使用 `ad-hoc signing`，不依赖 Apple Developer 证书，因此可以直接在 CI 中产出 `.app` 和 `.dmg`。

这类产物不是 Apple 公证包，用户首次打开时仍然可能被 macOS 拦截，需要手动放行。

常见处理方式：

- 在 Finder 中右键应用，选择“打开”
- 或在终端执行：
```bash
xattr -dr com.apple.quarantine /Applications/M記.app
```

如果后续需要“下载后可直接安装、无需手动放行”的体验，仍然需要 Apple Developer 证书和 notarization。

## Release 校验

项目已提供 release 冒烟检查脚本：

```bash
npm run smoke:release
```

配套检查清单见 [docs/RELEASE_SMOKE_TEST.md](./docs/RELEASE_SMOKE_TEST.md)。

## 常用快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Cmd/Ctrl + S` | 保存当前文件 |
| `Cmd + Shift + V` | 切换视图模式 |
| `Cmd/Ctrl + J` | AI 增强 |
| `Cmd + Shift + F` | 当前文件搜索 |
| `Cmd + Shift + S` | 侧边栏搜索 |
| `Cmd + Shift + 0` | 打开设置 |
| `Cmd + Shift + O` | 切换 Outline |
| `Cmd + Shift + B` | 切换侧边栏 |
| `Cmd + Shift + T` | 切换亮色/暗色主题 |
| `Cmd + Shift + K` | 打开知识库 |
| `Cmd + Shift + L` | 在侧边栏定位当前文件 |
| `Cmd + Shift + H` | 导出 PDF |
| `Cmd/Ctrl + N` | 新建笔记 |
| `Cmd/Ctrl + Shift + N` | 新建文件夹 |
| `Cmd/Ctrl + W` | 关闭标签页 |
| `Cmd + Shift + -` | 清理未引用附件 |
| `Cmd/Ctrl + Z` | 撤销 |
| `Cmd/Ctrl + Shift + Z` / `Cmd/Ctrl + Y` | 重做 |

## 开发说明

- 默认主题为暗色模式
- `.trash` 为应用内部回收站目录，不应手动编辑
- 预览层支持 wiki link、heading link、block ref 与附件解析
- 设置页支持分别配置界面字体、编辑字体、预览字体和代码字体
- 内置中文默认字体为霞鹜文楷，许可证见 `src/assets/fonts/LXGWWenKai-OFL.txt`
- 支持外部文件变更监听，如果文件在外部被修改且无未保存编辑，会自动重新加载

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
- [OpenAI](https://openai.com/)
