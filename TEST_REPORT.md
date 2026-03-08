# 右键功能测试报告

## 测试概述

**测试日期**: 2026-02-24
**测试范围**: 侧边栏文件树右键菜单功能
**构建状态**: 成功 (无编译错误)

---

## 修复内容摘要

### 1. 菜单位置边界检测 ✅
**问题**: 在屏幕右侧/底部右键时菜单会超出可视区域
**修复**: 添加边界检测逻辑，确保菜单始终在视口内显示

```typescript
// 边界检测逻辑
if (window.innerWidth - x < menuWidth) x = window.innerWidth - menuWidth;
if (window.innerHeight - y < menuHeight) y = window.innerHeight - menuHeight;
x = Math.max(10, x);
y = Math.max(10, y);
```

### 2. TrashView 右键支持 ✅
**问题**: 垃圾桶项目只能通过悬停按钮操作，无右键菜单
**修复**: 为 TrashView 添加 `onContextMenu` 属性支持

```typescript
// TrashView.tsx
interface TrashViewProps {
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void;
}
```

### 3. 点击关闭逻辑 ✅
**问题**: 普通 `click` 事件监听在右键时不会触发
**修复**: 使用 capture 模式并添加 ESC 键关闭支持

```typescript
// 使用 capture 模式捕获右键点击
window.addEventListener('click', handleClick, true);
// 添加 ESC 键关闭
window.addEventListener('keydown', handleEscape);
```

### 4. 垃圾桶专用菜单 ✅
**问题**: 垃圾桶项目没有专用的右键菜单选项
**修复**: 添加 Restore 和 Delete Permanently 选项

---

## 测试清单

### 基础功能测试

| 测试项 | 操作步骤 | 预期结果 | 状态 |
|--------|---------|---------|------|
| **文件右键菜单** | 在普通.md 文件上右键 | 显示：Rename / Reveal in Finder / Delete | ⬜ 待测 |
| **文件夹右键菜单** | 在文件夹上右键 | 显示：New File / New Folder / Rename / Reveal / Delete | ⬜ 待测 |
| **垃圾桶右键菜单** | 在垃圾桶项目上右键 | 显示：Restore / Delete Permanently | ⬜ 待测 |
| **菜单标题** | 检查菜单顶部标题 | 根据类型显示：File Actions / Folder Actions / Trash Actions | ⬜ 待测 |

### 边界测试

| 测试项 | 操作步骤 | 预期结果 | 状态 |
|--------|---------|---------|------|
| **右下角边界** | 在屏幕右下角右键 | 菜单向左上方向展开，不超出视口 | ⬜ 待测 |
| **左下角边界** | 在屏幕左下角右键 | 菜单向上展开，不超出视口 | ⬜ 待测 |
| **右上角边界** | 在屏幕右上角右键 | 菜单向左展开，不超出视口 | ⬜ 待测 |
| **左上角边界** | 在屏幕左上角右键 | 菜单正常向右下展开 | ⬜ 待测 |

### 交互测试

| 测试项 | 操作步骤 | 预期结果 | 状态 |
|--------|---------|---------|------|
| **点击关闭** | 右键菜单显示后点击任意位置 | 菜单关闭 | ⬜ 待测 |
| **ESC 关闭** | 右键菜单显示后按 ESC 键 | 菜单关闭 | ⬜ 待测 |
| **右键关闭** | 菜单显示后再次右键 | 原菜单关闭，新位置显示菜单 | ⬜ 待测 |
| **悬停高亮** | 鼠标悬停在菜单项上 | 菜单项高亮显示 | ⬜ 待测 |

### 功能测试

| 测试项 | 操作步骤 | 预期结果 | 状态 |
|--------|---------|---------|------|
| **New File** | 文件夹右键 → New File | 创建新文件并选中 | ⬜ 待测 |
| **New Folder** | 文件夹右键 → New Folder | 创建新文件夹 | ⬜ 待测 |
| **Rename** | 文件/文件夹右键 → Rename | 弹出重命名输入框 | ⬜ 待测 |
| **Reveal in Finder** | 文件/文件夹右键 → Reveal | 在系统 Finder/资源管理器中显示 | ⬜ 待测 |
| **Delete** | 文件/文件夹右键 → Delete | 项目移入垃圾桶并显示确认对话框 | ⬜ 待测 |
| **Restore** | 垃圾桶项目右键 → Restore | 项目恢复到原位置 | ⬜ 待测 |
| **Delete Permanently** | 垃圾桶项目右键 → Delete Permanently | 项目永久删除并显示确认对话框 | ⬜ 待测 |

---

## 代码变更摘要

### 修改的文件

1. **src/components/sidebar/Sidebar.tsx**
   - 添加 `menuRef` 引用
   - 修改 `handleContextMenu` 添加边界检测
   - 添加 `handleRestoreFromTrashClick` 和 `handleDeleteForeverClick`
   - 更新右键菜单 UI 结构，区分垃圾桶和普通项目

2. **src/components/sidebar/TrashView.tsx**
   - 添加 `onContextMenu` 可选属性
   - 在垃圾项目上绑定 `onContextMenu` 事件

### 新增的功能

- ✅ 菜单边界检测 (约 200px 宽，300px 高)
- ✅ ESC 键关闭菜单
- ✅ 垃圾桶项目右键支持
- ✅ 区分三种菜单类型 (File / Folder / Trash)

---

## 浏览器兼容性

| 浏览器 | 预期支持 | 测试状态 |
|--------|---------|---------|
| Chrome/Edge | ✅ | ⬜ 待测 |
| Firefox | ✅ | ⬜ 待测 |
| Safari | ✅ | ⬜ 待测 |

---

## 已知问题

无 (待实际测试验证)

---

## 测试建议

1. **开发环境测试**: 运行 `npm run dev` 在浏览器中测试
2. **生产环境测试**: 运行 `npm run build` 后通过 Tauri 桌面应用测试
3. **跨平台测试**: 在 macOS、Windows、Linux 上分别测试

---

## 如何运行测试

```bash
# 1. 启动开发服务器
npm run dev

# 2. 打开浏览器访问 http://localhost:3000

# 3. 或使用 Tauri 桌面应用
npm run tauri:dev
```

---

## 测试结论

⬜ 待实际执行测试
