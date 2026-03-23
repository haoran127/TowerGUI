# TowerGUI 快速入门

## 环境准备

- **Node.js** 18+
- **pnpm** 8+
- **Unity** 2021.3+ (如需 Unity 运行)
- **Puerts** 2.x (Unity JS 桥接)

## 1. 安装依赖

```bash
git clone <your-repo-url> TowerGUI
cd TowerGUI
pnpm install
```

## 2. 创建项目

```bash
# CLI 方式
npx tower-ui create my-game --dir ./apps

# 或通过编辑器 UI
pnpm dev
# 在编辑器中 File → New Project
```

## 3. 启动开发服务器

```bash
pnpm dev
# 访问 http://localhost:3000
```

编辑器界面分为：
- **左侧** — Hierarchy（节点树）、Files（文件管理）、Templates（组件模板）
- **中间** — Canvas（可视化画布）
- **右侧** — Properties（属性面板）、JSON（原始数据）、AI（AI 助手）

## 4. 创建你的第一个 UI

### 方式一：可视化编辑

1. 在画布上右键 → Add Component → 选择组件类型
2. 在右侧属性面板调整位置、大小、颜色等
3. Ctrl+S 保存

### 方式二：导入 Unity Prefab

1. File → Sync Prefabs
2. 选择 Unity 项目的 Assets 目录
3. 点击 Start Sync，等待转换完成
4. 在 Files 面板中点击 .tower.json 文件加载

### 方式三：AI 生成

```bash
# CLI
npx tower-ui generate "一个背包界面，顶部有标题，中间3x4格子，底部有关闭按钮" -o Backpack.tower.json

# 或在编辑器 AI 面板中描述
```

## 5. 在 Unity 中运行

### 5.1 打包 JS Bundle

```bash
cd apps/unity-demo/TsProject
pnpm install
pnpm build
```

### 5.2 Unity 场景配置

1. 创建空 Scene
2. 添加 GameObject，挂载组件：
   - `TowerUIBoot` — JS 引擎
   - `TowerHMR` — (可选) 热重载
3. 将 `output/main.mjs` 放到 Unity Resources 目录

### 5.3 运行

点击 Unity Play，TowerGUI 将自动初始化 JS 环境并渲染 UI。

## 6. 数据绑定

### 标注 UI 节点

在编辑器中选择节点，在属性面板底部的 "Data Binding" 区域：
- 文本节点 → `display` 角色，设置 `field` 和 `protoType`
- 按钮节点 → `event` 角色，设置事件名
- 列表容器 → `list` 角色，设置列表字段名

### 生成协议代码

File → Generate Protocol

自动生成：
- `.proto` 文件（Protobuf 协议定义）
- `.cs` 代理类（C# UI 绑定代理）

### C# 侧推送数据

```csharp
DataBridge.Push("player.name", "Hero");
DataBridge.Push("player.level", 42);
```

JS Store 自动更新 → UI 重新渲染。

## 7. 开发工作流

```
编辑 TSX/tower.json → Dev Server HMR → Web 预览
                    → WebSocket → Unity 热重载
C# DataBridge.Push → JS Store → React Reconciler → UGUI 更新
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `npx tower-ui create <name>` | 创建新项目 |
| `npx tower-ui validate <file>` | 验证 JSON 格式 |
| `npx tower-ui generate <desc>` | AI 生成 UI |
| `npx tower-ui from-image <img>` | 截图转 UI |
| `node tools/mirror-prefabs.mjs` | 批量同步 Prefab |
| `node tools/tower-to-proto.mjs` | 生成 Proto |
| `node tools/tower-to-proxy.mjs` | 生成 C# Proxy |
