# 多级列表行为完善方案

## 概述

本文档描述 Markdown 编辑器中多级列表的行为规范与实现方案。

## 核心设计原则

1. **层级由缩进决定**：每级缩进为 4 个空格
2. **有序列表编号按层级独立计算**：子层级重新从 1 开始
3. **Tab/Shift-Tab 调整缩进并重新计算编号**
4. **Enter 续写保持当前层级**
5. **严格模式自动修复整个文档的编号连续性**

## 层级定义

| 层级 | 缩进 | 示例 |
|------|------|------|
| Level 0 | 0 空格 | `- item` |
| Level 1 | 4 空格 | `    - item` |
| Level 2 | 8 空格 | `        - item` |
| Level 3 | 12 空格 | `            - item` |

## 行为规范

### 1. Enter 行为

#### 1.1 非空列表项续写
```markdown
- item|
→ Enter →
- item
- |
```

#### 1.2 有序列表递增
```markdown
1. item|
→ Enter →
1. item
2. |
```

#### 1.3 空列表项退出（回退一级）
```markdown
    - |
→ Enter →
- |
```

#### 1.4 空列表项退出（转为普通行）
```markdown
- |
→ Enter →
|
```

#### 1.5 任务列表状态保持
```markdown
- [x] done|
→ Enter →
- [x] done
- [x] |
```

### 2. Tab / Shift-Tab 行为

#### 2.1 增加缩进
```markdown
- item
→ Tab →
    - item
```

#### 2.2 减少缩进
```markdown
    - item
→ Shift-Tab →
- item
```

#### 2.3 有序列表编号重排
```markdown
1. parent
    1. child
→ Shift-Tab (在 child 上) →
1. parent
2. child
```

### 3. 有序列表编号规则

#### 3.1 同层递增
```markdown
1. first
2. second
3. third
```

#### 3.2 子层级重新从 1 开始
```markdown
1. parent
    1. child-1
    2. child-2
2. parent-2
```

#### 3.3 严格模式自动修复
```markdown
1. first
3. third (错误)
5. fifth (错误)
→ 自动修复为 →
1. first
2. third
3. fifth
```

### 4. 列表切换

#### 4.1 无序列表 ↔ 有序列表
```markdown
- item
→ Mod-Shift-O →
1. item
```

#### 4.2 转换为任务列表
```markdown
- item
→ 任务列表切换 →
- [ ] item
```

## 实现架构

### 模块划分

```
editor/
├── nestedListBehavior.ts    # 核心行为逻辑
├── nestedListCommands.ts    # 命令实现
└── markdownBehavior.ts      # 整合层（保持向后兼容）
```

### 核心数据结构

```typescript
interface ListItemInfo {
  type: 'unordered' | 'ordered' | 'task';
  level: number;           // 层级 (0, 1, 2, ...)
  indent: string;          // 前导空格
  marker: string;          // -, *, +, 1., 2), 等
  content: string;         // 内容部分
  number?: number;         // 有序列表编号
  delimiter?: string;      // . 或 )
  checkbox?: string;       // [ ], [x], [X]
  lineNumber: number;      // 行号
  startPos: number;        // 行起始位置
}
```

### 关键函数

| 函数 | 作用 |
|------|------|
| `parseListItem()` | 解析单行列表项 |
| `getLevelFromIndent()` | 根据缩进计算层级 |
| `adjustListItemLevel()` | 调整列表项层级 |
| `formatListItem()` | 格式化列表项为文本 |
| `calculateOrderedListNumbers()` | 计算标准化编号 |
| `handleListEnter()` | Enter 键处理 |
| `handleListTab()` | Tab 键处理 |
| `toggleOrderedList()` | 切换有序列表 |

## 与现有代码整合

为了保持向后兼容，新的多级列表模块通过以下方式与现有代码整合：

1. **markdownBehavior.ts** 保留原有接口
2. 列表相关命令内部调用新模块
3. 非列表功能（引用、标题等）保持不变

## 测试覆盖

测试文件：`src/components/editor/__tests__/nestedList.test.ts`

测试范围：
- 列表项解析
- 层级计算
- 空内容检测
- 格式化输出
- 层级调整
- 使用示例

## 未来扩展

1. 支持更多列表标记（如 `+`）
2. 混合列表情境下的智能处理
3. 与引用块嵌套的完整支持
4. 实时协作编辑时的列表同步
