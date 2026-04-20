# M記

[English](./README.en.md) · [开发文档](./docs/DEVELOPMENT.md)

M記 是一个简单易用的 Markdown 编辑器，面向本地知识库写作场景，强调编辑体验、预览一致性和知识库链接能力。

> 初衷就是开发一个比Typora更好用，比Obsidian更易用的Markdown编辑器。

![M 記-1776329034274](https://raw.githubusercontent.com/Yunz93/PicRepo/main/image/M%20%E8%A8%98-1776170252301.png)

## 下载安装

前往 [GitHub Releases](https://github.com/Yunz93/markdown-press/releases) 下载最新版本。

### macOS

由于本应用未经 Apple 签名公证，macOS 会提示"已损坏"或"无法验证开发者"。请按以下步骤安装：

1. 下载 `.dmg` 文件并将应用拖入 Applications 文件夹
2. 打开终端（Terminal），执行：
```bash
xattr -cr /Applications/M記.app
```
3. 再次双击打开应用即可

> 如果应用还在 Downloads 文件夹未移动，将路径替换为 `~/Downloads/M記.app`。

### Windows

下载 `.exe` 安装程序，双击运行即可。如果 Windows SmartScreen 拦截，点击"更多信息" → "仍要运行"。

## 功能概览

### 编辑与预览

- 三种视图模式便捷切换：编辑、分屏、预览
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
- 编辑并保存时，如果 frontmatter 中存在 `date modified`（或 `update_time` 等兼容键名），应用会自动刷新它的值

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
- 支持发布到微信公众号草稿箱，并对同一篇笔记再次更新原草稿


## 常用快捷键

以下为当前默认快捷键；大部分可在 `Settings -> Shortcuts` 中调整。

| 快捷键 | 动作 |
| --- | --- |
| `Cmd/Ctrl + S` | 保存当前文件 |
| `Cmd/Ctrl + 0` | 打开设置 |
| `Cmd/Ctrl + 1` | 切换侧边栏 |
| `Cmd/Ctrl + 2` | 切换 Outline |
| `Cmd/Ctrl + 3` | 切换视图模式 |
| `Cmd/Ctrl + 4` | 切换亮色/暗色主题 |
| `Cmd/Ctrl + 5` | AI 增强 |
| `Cmd + Shift + F` | 当前文件搜索 |
| `Cmd + Shift + S` | 侧边栏搜索 |
| `Cmd + Shift + K` | 打开知识库 |
| `Cmd + Shift + L` | 在侧边栏定位当前文件 |
| `Cmd + Shift + H` | 导出 PDF |
| `Cmd/Ctrl + N` | 新建笔记 |
| `Cmd/Ctrl + Shift + N` | 新建文件夹 |
| `Cmd/Ctrl + W` | 关闭标签页 |
| `Cmd + Shift + -` | 清理未引用附件 |
| `Enter` / `Shift + Enter` | 搜索结果下一个 / 上一个匹配 |
| `Escape` | 关闭当前搜索面板、弹窗或菜单 |
| `Cmd/Ctrl + Z` | 撤销 |
| `Cmd/Ctrl + Shift + Z` / `Cmd/Ctrl + Y` | 重做 |

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
- 新建笔记默认 metadata 模板已内置 `slug`、`aliases`、`date created`、`date modified`
- 编辑并保存时，如果 frontmatter 中存在 `date modified`（或 `update_time` 等兼容键名），应用会自动刷新它的值

支持的仓库格式：

- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git`
- `owner/repo`

`GitHub Token` 需要使用 Fine-grained Personal Access Token，并为目标仓库开启 `Contents: Read and write` 权限。

发布时会继续处理图片类附件与标准 Markdown 图片引用；对于 Obsidian 风格的普通 wiki 链接，如果目标笔记已经发布（存在 `link`，或 `is_publish: true` 且可推导出博客地址），会自动转换成可点击跳转的普通链接。

## 发布到微信公众号草稿箱

在 `Settings -> Publishing` 中额外配置：

- `公众号 AppID`
- `公众号 AppSecret`

点击工具栏发布按钮后，可以选择 `微信公众号草稿`。首版行为如下：

- 发布前会弹窗填写或确认标题、作者、摘要、原文链接
- 封面图在发布时临时选择
- 正文里的本地图片会自动上传为微信公众号正文可用图片
- 第一次发布会新建草稿，并把 `wechat_draft_media_id` 回填到当前笔记 frontmatter
- 再次发布同一篇笔记时，如果存在 `wechat_draft_media_id`，会直接更新原草稿

说明：

- 当前只支持一个公众号账号
- 当前只支持单图文草稿
- `AppSecret` 仅保存在本机安全存储中，不进入普通设置持久化
- 公众号接口通常要求服务器出口 IP 已加入微信公众平台白名单

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
