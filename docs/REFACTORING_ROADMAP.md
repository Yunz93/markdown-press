# 重构路线图

## 已完成 ✅

### 1. EditorPane 重构
- 提取 `useCodeMirror` hook (282 行)
- 提取 `useWikiLinks` hook (256 行)
- 提取 `useImagePaste` hook (130 行)
- 提取 `useScrollSync` hook (154 行)
- 提取 `decorations.ts` (243 行)
- **结果**: EditorPane 从 1273 行减少到 431 行 (-66%)

---

## 高优先级 🔥 (建议接下来处理)

### 2. PreviewPane 重构
**当前**: 1055 行  
**目标**: 500 行以下

#### 建议拆分:
```
src/components/editor/
├── hooks/
│   ├── usePreviewRenderer.ts    # Markdown 渲染逻辑
│   ├── usePreviewScroll.ts      # 预览滚动同步
│   ├── useWikiLinkNavigation.ts # WikiLink 点击处理
│   └── useMermaidRenderer.ts    # Mermaid 图表渲染
```

#### 主要提取内容:
- **滚动同步逻辑** (约 200 行)
- **WikiLink 点击处理** (约 150 行)
- **Mermaid 渲染** (约 100 行)
- **图片缓存处理** (约 100 行)

---

### 3. Sidebar 重构
**当前**: 1086 行  
**目标**: 400 行以下

#### 建议拆分:
```
src/components/sidebar/
├── hooks/
│   ├── useContextMenu.ts        # 右键菜单逻辑
│   ├── useDragAndDrop.ts        # 拖拽排序
│   ├── useFileTree.ts           # 文件树操作
│   └── useSidebarResize.ts      # 侧边栏调整大小
├── components/
│   ├── ContextMenu.tsx          # 右键菜单组件
│   ├── FileTreeNode.tsx         # 文件树节点
│   ├── NewFileDialog.tsx        # 新建文件对话框
│   └── RenameDialog.tsx         # 重命名对话框
```

---

### 4. export.ts 模块化
**当前**: 1009 行  
**目标**: 拆分为多个小模块

#### 建议结构:
```
src/services/export/
├── index.ts                     # 统一导出
├── types.ts                     # 导出相关类型
├── htmlExport.ts                # HTML 导出
├── pdfExport.ts                 # PDF 导出
├── markdownExport.ts            # Markdown 导出
├── imageExport.ts               # 图片导出
└── utils/
    ├── templateBuilder.ts       # 模板构建
    ├── styleGenerator.ts        # 样式生成
    └── fileNamer.ts             # 文件名生成
```

---

## 中优先级 📋 (建议本月内完成)

### 5. Markdown 工具函数整合
**当前问题**:
- `markdown.ts` (264 行) 和 `markdown-extensions.ts` (209 行) 有重叠
- `markdownSourceHighlight.ts` (382 行) 可以独立成模块

#### 建议:
```
src/utils/markdown/
├── index.ts                     # 统一导出
├── renderer.ts                  # 渲染核心
├── extensions.ts                # 扩展功能
├── highlighting.ts              # 代码高亮
└── plugins/
    ├── mermaid.ts               # Mermaid 插件
    ├── taskList.ts              # 任务列表插件
    └── wikiLink.ts              # WikiLink 插件
```

---

### 6. 文件系统服务优化
**当前**: `useFileSystem.ts` 和多个文件系统相关文件

#### 建议:
- 统一文件系统抽象层
- 更好的错误处理
- 支持更多文件操作（复制、批量移动等）

```
src/services/
├── fileSystem/
│   ├── index.ts                 # 统一接口
│   ├── types.ts                 # 类型定义
│   ├── tauriFs.ts              # Tauri 实现
│   ├── browserFs.ts            # 浏览器实现
│   └── utils/
│       ├── pathUtils.ts        # 路径处理
│       └── errorHandler.ts     # 错误处理
```

---

## 低优先级 📌 (长期优化)

### 7. UI 组件库建设
**当前问题**:
- Dialog、Button 等组件分散
- 缺乏统一的样式系统

#### 建议:
```
src/components/ui/
├── Button/
├── Dialog/
├── Input/
├── Select/
├── Tooltip/
└── index.ts
```

---

### 8. 测试覆盖
**当前**: 几乎没有单元测试

#### 建议优先级:
1. **单元测试**: utils 函数、hooks
2. **组件测试**: 关键 UI 组件
3. **E2E 测试**: 核心用户流程

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── utils/
│   │   └── hooks/
│   ├── integration/
│   └── e2e/
```

---

### 9. 性能优化

#### 已识别问题:
- `markdownSourceHighlight.ts` (382 行) 可能阻塞主线程
- 大文件预览性能需要优化
- 图片加载没有懒加载

#### 建议:
- 使用 Web Worker 处理 Markdown 渲染
- 虚拟滚动处理大文件
- 图片懒加载

---

## 重构检查清单

### 重构前检查:
- [ ] 备份原文件
- [ ] 确保有类型定义
- [ ] 标记所有依赖关系

### 重构中:
- [ ] 逐步提取，每步验证
- [ ] 保持向后兼容
- [ ] 更新导入路径

### 重构后:
- [ ] 类型检查通过
- [ ] 构建成功
- [ ] 功能测试通过
- [ ] 性能对比测试

---

## 预计工作量

| 项目 | 预计时间 | 复杂度 |
|------|----------|--------|
| PreviewPane 重构 | 4-6 小时 | ⭐⭐⭐ |
| Sidebar 重构 | 6-8 小时 | ⭐⭐⭐⭐ |
| export.ts 模块化 | 3-4 小时 | ⭐⭐ |
| Markdown 工具整合 | 3-4 小时 | ⭐⭐ |
| 测试覆盖 | 8-12 小时 | ⭐⭐⭐⭐ |

---

## 下一步建议

基于优先级和复杂度，建议按以下顺序:

1. **PreviewPane 重构** (4-6 小时，高价值)
2. **Sidebar 重构** (6-8 小时，高价值)
3. **export.ts 模块化** (3-4 小时，中等价值)
4. **测试覆盖** (长期项目)

是否需要我立即开始 PreviewPane 的重构?
