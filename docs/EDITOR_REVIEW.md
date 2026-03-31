# 编辑器功能整体 Review 报告

## 一、现状概览

### 文件结构
```
src/components/editor/
├── EditorPane.tsx          # 1273 行 - 主编辑器组件（过大）
├── PreviewPane.tsx         # 约 300 行 - 预览面板
├── SplitView.tsx           # 195 行 - 分屏视图
├── markdownBehavior.ts     # 545 行 - Markdown 编辑行为
├── nestedListBehavior.ts   # 338 行 - 多级列表行为
├── nestedListCommands.ts   # 423 行 - 列表命令
└── paneLayout.ts           # 69 行 - 面板布局

src/utils/
├── editorCodeLanguages.ts  # 205 行 - 代码语言支持
├── editorSelectionBridge.ts # 47 行 - 选择器桥接
```

**总代码量：约 4394 行**

---

## 二、功能清单

### 已实现功能

| 类别 | 功能 | 状态 | 备注 |
|------|------|------|------|
| **基础编辑** | 文本输入 | ✅ | CodeMirror 6 |
| | 光标移动 | ✅ | 原生支持 |
| | 选择/复制/粘贴 | ✅ | 含结构化粘贴 |
| | 撤销/重做 | ✅ | 按文件隔离 |
| **Markdown** | 无序列表 | ✅ | 支持多级 |
| | 有序列表 | ✅ | 严格/宽松模式 |
| | 任务列表 | ✅ | 状态保持 |
| | 引用块 | ✅ | 多级引用 |
| | 代码块 | ✅ | 语法高亮 |
| | 标题 | ✅ | H1-H6 循环 |
| | 行内格式 | ✅ | 粗体/斜体/代码/链接 |
| **快捷键** | Enter 续写 | ✅ | 列表/引用/标题 |
| | Backspace 回退 | ✅ | 结构降级 |
| | Tab/Shift-Tab | ✅ | 缩进调整 |
| | Mod+B/I/K 等 | ✅ | 格式切换 |
| **视图** | 编辑模式 | ✅ | |
| | 预览模式 | ✅ | |
| | 分屏模式 | ✅ | 可拖拽调整 |
| | 大纲面板 | ✅ | |
| | 滚动同步 | ✅ | 双向 |
| **其他** | WikiLink | ✅ | 双向链接 |
| | 自动补全 | ✅ | 文件/标题 |
| | 悬停预览 | ✅ | |
| | 图片粘贴 | ✅ | |
| | 字体设置 | ✅ | 中英文字体 |

---

## 三、主要问题与优化点

### 3.1 🔴 严重问题

#### 1. EditorPane.tsx 过于庞大（1273 行）
**问题：**
- 61 个 hooks 调用
- 职责过多：编辑器初始化、事件处理、滚动同步、WikiLink、自动补全、图片粘贴等
- 维护困难，容易引入 bug

**优化建议：**
```typescript
// 拆分为多个 hook
├── useCodeMirror.ts         // 编辑器初始化
├── useWikiLinks.ts          // WikiLink 处理
├── useAutoCompletion.ts     // 自动补全
├── useScrollSync.ts         // 滚动同步
├── useImagePaste.ts         // 图片粘贴
├── useHoverPreview.ts       // 悬停预览
└── useEditorKeymap.ts       // 键盘映射
```

#### 2. 状态管理混乱
**问题：**
- EditorPane 中混用 `useAppStore` 和本地 state
- `updateContent` 通过 ref 传递，模式不统一
- 频繁的全局状态订阅导致不必要的重渲染

**优化建议：**
- 使用 Context 或更细粒度的状态订阅
- 统一数据流模式

#### 3. 性能隐患
**问题：**
- `useMemo` 和 `useCallback` 使用不当，依赖项过多
- `wikiLinkCompletionSource` 每次渲染都创建新函数
- `buildWikiPreviewMarkup` 使用 dangerouslySetInnerHTML

---

### 3.2 🟡 中等问题

#### 4. 列表行为代码重复
**问题：**
- `markdownBehavior.ts` 和 `nestedListBehavior.ts` 有重叠
- 旧逻辑和新逻辑并存，维护成本高

**优化建议：**
- 逐步迁移到新的多级列表模块
- 删除旧代码

#### 5. 滚动同步实现复杂
**问题：**
- 使用大量 ref 和动画帧管理滚动状态
- 容易出现滚动抖动

**优化建议：**
- 考虑使用 CodeMirror 的 `scrollIntoView` API
- 或简化同步逻辑

#### 6. 错误处理不足
**问题：**
- 多处 `catch` 块仅打印日志
- 图片粘贴失败无用户反馈
- 文件读取错误处理不完整

**优化建议：**
- 统一错误处理机制
- 添加用户友好的错误提示

---

### 3.3 🟢 轻微问题

#### 7. 类型定义分散
**问题：**
- `ListInfo` 在多处定义
- 类型导入混乱

#### 8. 常量定义不统一
**问题：**
- `LIST_INDENT_UNIT` 在多个文件定义
- 魔法数字较多

#### 9. 测试覆盖不足
**问题：**
- 无单元测试
- 行为变更依赖手动测试

---

## 四、架构优化建议

### 4.1 模块重组

```
src/editor/
├── core/
│   ├── useCodeMirror.ts      // 核心编辑器 hook
│   ├── extensions.ts         // CodeMirror 扩展配置
│   └── state.ts              // 编辑器状态管理
├── features/
│   ├── markdown/
│   │   ├── behavior.ts       // Markdown 行为
│   │   ├── lists/            // 列表处理
│   │   └── commands.ts       // 命令集合
│   ├── wikiLinks/
│   │   ├── completion.ts     // 自动补全
│   │   ├── preview.ts        // 悬停预览
│   │   └── navigation.ts     // 跳转处理
│   ├── scroll/
│   │   └── sync.ts           // 滚动同步
│   └── paste/
│       └── image.ts          // 图片粘贴
├── ui/
│   ├── EditorPane.tsx        // 简化后的主组件
│   ├── PreviewPane.tsx
│   └── SplitView.tsx
└── utils/
    └── selection.ts
```

### 4.2 核心 hook 设计

```typescript
// useCodeMirror.ts 示例
export function useCodeMirror(options: {
  content: string;
  onChange: (content: string) => void;
  extensions?: Extension[];
}) {
  const editorRef = useRef<EditorView | null>(null);
  
  // 初始化、更新、销毁逻辑
  
  return {
    editorRef,
    focus: () => editorRef.current?.focus(),
    getSelection: () => editorRef.current?.state.selection.main,
    // ...
  };
}
```

### 4.3 性能优化清单

| 优化项 | 优先级 | 预估收益 |
|--------|--------|----------|
| 拆分 EditorPane | P0 | 可维护性 +++ |
| 优化状态订阅 | P1 | 渲染性能 ++ |
| 缓存 completionSource | P1 | 输入响应 ++ |
| 懒加载语法高亮 | P2 | 启动速度 + |
| 虚拟滚动大纲 | P2 | 大文件性能 + |

---

## 五、短期优化计划（1-2 周）

### Week 1
1. **拆分 EditorPane.tsx**
   - 提取 `useCodeMirror` hook
   - 提取 `useWikiLinks` hook
   - 提取 `useScrollSync` hook

2. **统一列表处理**
   - 完全迁移到 nestedList 模块
   - 删除旧代码

### Week 2
3. **优化状态管理**
   - 使用细粒度订阅
   - 统一数据流

4. **添加错误处理**
   - 统一错误提示
   - 添加边界处理

---

## 六、长期优化计划（1-2 月）

1. **测试覆盖**
   - 单元测试
   - E2E 测试
   - 视觉回归测试

2. **性能优化**
   - 大文件优化
   - 虚拟滚动
   - 懒加载

3. **功能增强**
   - 表格编辑
   - 数学公式实时预览
   - 协同编辑准备

---

## 七、风险与注意事项

1. **向后兼容**
   - 用户习惯的行为保持一致
   - 快捷键映射不变

2. **回归测试**
   - 列表行为
   - WikiLink 跳转
   - 滚动同步

3. **性能监控**
   - 大文件（>10MB）性能
   - 内存泄漏检查

---

## 八、总结

### 当前状态
- **功能完整性：** 85%（基本功能齐全）
- **代码质量：** 60%（需要重构）
- **可维护性：** 50%（急需拆分）
- **性能：** 70%（有优化空间）

### 建议优先级
1. 🔥 **立即处理：** EditorPane 拆分
2. **本周处理：** 统一列表模块
3. **本月处理：** 测试覆盖
4. **后续优化：** 性能增强
