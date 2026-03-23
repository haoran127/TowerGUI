# TowerGUI 商业项目使用指南

面向大型 SLG 游戏团队（100+ 开发、300+ 设计师）的完整操作手册。

---

## 你有两条路径

| 路径 | 适用场景 | 产出 |
|:-----|:---------|:-----|
| **A. 新建 UI** | 从零设计新界面 | .tower.json → Unity Prefab |
| **B. 迁移老项目** | 已有 Unity Prefab 要纳入管理 | Prefab → .tower.json → 编辑器可视化 → 新 Prefab |

两条路径最终都产出**标准 UGUI Prefab**，Unity 开发者照常使用，无任何运行时依赖。

---

## 第一步：环境搭建（一次性）

### 1.1 安装依赖

```bash
# 前置条件：Node.js 18+, pnpm 8+
git clone <你的仓库地址>
cd TowerGUI
pnpm install
```

### 1.2 验证安装

```bash
pnpm dev
```

浏览器打开 `http://localhost:3000/editor` 看到编辑器界面即成功。

### 1.3 Unity 侧配置

在你的 Unity 项目的 `Packages/manifest.json` 中添加：

```json
{
  "dependencies": {
    "com.towerui.runtime": "file:../../packages/unity-runtime"
  }
}
```

然后在 Unity 菜单 `TowerUI > Settings` 配置：
- **Sprite Search Paths**：你的项目的图片目录（如 `UI/Sprites`, `Resources/Atlas`）
- **Default Font**：拖入你的 TMP 字体文件
- **Output Folder**：编译后的 Prefab 存放目录

---

## 第二步：创建项目（每个游戏项目一次）

### 2.1 在编辑器中创建

1. 打开 `http://localhost:3000/editor`
2. 右上角点击 **New Project**
3. 选择目录，输入项目名（如 `MySlgUI`），设置设计分辨率（如 1080×1920）

这会创建：
```
MySlgUI/
├── tower.project.json       # 项目配置
├── screens/                 # 所有 UI 界面
│   └── MainScreen.tower.json
├── components/              # 可复用组件
├── templates/               # 组件库模板
├── assets/                  # 图片资源
└── theme.json               # Design Token（主题色/字体/间距）
```

### 2.2 配置 Design Token（推荐）

在编辑器左栏点 **Theme** 标签，设置项目统一的：
- 颜色 Token（primary, secondary, gold, danger 等）
- 字体预设（title, body, caption）
- 按钮样式预设（primary, ghost, danger）

**所有设计师使用同一套 Token，确保视觉一致性。**

---

## 第三步：设计 UI（设计师日常工作）

### 3.1 新建界面

1. 编辑器左栏 **Files** → 右键 screens 文件夹 → New File
2. 命名如 `BattleHUD.tower.json`
3. 从左栏 **Hierarchy** 面板拖入组件：

| 组件 | 用途 |
|:-----|:-----|
| View | 容器（Flex 布局） |
| Text | 文本 |
| Image | 图片/精灵 |
| Button | 按钮（支持 ColorTint/SpriteSwap/Animation 三种过渡） |
| Input | 输入框 |
| Scroll | 滚动列表 |
| Toggle | 开关 |
| Slider | 滑块 |
| Dropdown | 下拉选择 |
| Progress | 进度条/血条 |

### 3.2 设置属性

- 右栏 **Properties** 面板设置布局、颜色、字体
- `src` 字段点 **...** 按钮打开 **Sprite Browser** 可视化选择图片
- 按钮选 SpriteSwap 模式后，分别设置 normal/hover/pressed/disabled 的精灵

### 3.3 命名规范（强制）

所有需要代码绑定的节点必须命名，规则：

| 组件类型 | 前缀 | 示例 |
|:---------|:-----|:-----|
| Button | btn | btnAttack, btnUpgrade |
| Text | txt | txtGold, txtPlayerName |
| Image | img | imgAvatar, imgIcon |
| Input | ipt | iptChat, iptSearch |
| Toggle | tog | togSound, togMusic |
| Slider | sld | sldVolume |
| Scroll | scr | scrItemList |
| Dropdown | dd | ddServer |

运行 `pnpm lint:naming` 自动检查，`--fix` 自动修正。

### 3.4 保存组件到组件库

选中一个设计好的子树 → 左栏 **Templates** → 点 **+** → 选分类 → 保存。
其他设计师搜索并一键插入。

---

## 第四步：编译为 Unity Prefab（开发者操作）

### 4.1 复制 JSON 到 Unity

将设计师产出的 `.tower.json` 文件复制到 Unity 项目的 `StreamingAssets/` 目录。

### 4.2 一键编译

在 Unity 中：

```
菜单 → TowerUI → Build All Prefabs
```

这会：
1. 扫描 StreamingAssets 下所有 `.tower.json`
2. 逐一编译为标准 UGUI Prefab
3. 输出到 `Assets/GeneratedPrefabs/`
4. 显示进度条，支持取消

### 4.3 在代码中使用 Prefab

```csharp
// 方式一：直接使用 Prefab（和手工制作的 Prefab 完全一样）
var prefab = Resources.Load<GameObject>("GeneratedPrefabs/BattleHUD");
var instance = Instantiate(prefab, canvas.transform);

// 方式二：通过 TowerUIBinder 快速绑定事件
var binder = instance.GetComponent<TowerUIBinder>();
binder.BindButton("btnAttack", () => OnAttack());
binder.SetText("txtGold", FormatNumber(gold));
binder.GetSlider("sldVolume").value = volume;
```

### 4.4 运行时 JSON 渲染（可选，用于热更新）

```csharp
// 不编译 Prefab，直接从 JSON 动态构建（支持热更新）
var renderer = canvas.AddComponent<TowerUIRenderer>();
renderer.SetDocumentPath("BattleHUD.tower.json");  // Editor 下自动热重载
```

---

## 第五步：迁移老项目（路径 B）

### 5.1 单个 Prefab 迁移

在编辑器中：
1. 右上角 → Import → Unity Prefab
2. 选择 `.prefab` 文件和 Unity 项目根目录
3. 自动转换为 `.tower.json` 并在编辑器中打开

### 5.2 批量迁移

```bash
# 在编辑器中：打开项目 → 右上角 Sync → 选择 Prefab 源目录
# 或命令行：
node tools/mirror-prefabs.mjs --source Assets/UI/Prefabs --target MyProject/screens
```

### 5.3 查看迁移进度

```bash
pnpm inventory --unity-dir Assets/UI/Prefabs --tower-dir MyProject/screens
```

输出：
```
╔══════════════════════════════════════════╗
║  Unity Prefabs:         1300            ║
║  Migrated:               800  ✓         ║
║  Remaining:              500  ✗         ║
║  Progress:               62%            ║
╚══════════════════════════════════════════╝
  [████████████████████████░░░░░░░░░░░░░░░░] 62%
```

---

## 第六步：接入 CI/CD（技术管理操作）

### 6.1 Git Pre-push Hook

```bash
# .husky/pre-push
pnpm ci
```

### 6.2 CI Pipeline（GitLab CI / Jenkins / GitHub Actions）

```yaml
# .gitlab-ci.yml 示例
tower-ui-check:
  script:
    - pnpm install
    - pnpm ci    # = validate + naming-lint + roundtrip-test + coverage-check
  only:
    changes:
      - "**/*.tower.json"
      - "tools/**"
      - "packages/unity-runtime/**"
```

### 6.3 可用的 CI 命令

| 命令 | 作用 | 失败时 |
|:-----|:-----|:-------|
| `pnpm validate` | 校验所有 .tower.json 的 schema 完整性 | 有缺字段/类型错误 |
| `pnpm validate --strict` | 额外检查无名按钮、空文本、缺图片 | 有潜在问题 |
| `pnpm lint:naming` | 检查节点命名规范（btn_/txt_/img_） | 有不规范命名 |
| `pnpm test:roundtrip` | 180 项属性往返测试 | 管道有数据丢失 |
| `pnpm coverage` | 管道组件/属性覆盖矩阵 | 有未覆盖的管道 |
| `pnpm ci` | 以上全部串行执行 | 任一失败即阻断 |

---

## 第七步：日常开发流程

### 设计师的一天

```
1. pnpm dev                          # 启动编辑器
2. 浏览器打开 http://localhost:3000/editor
3. 打开项目 → 打开/新建界面
4. 拖组件 → 调属性 → 选图片 → 应用主题预设
5. Ctrl+S 保存
6. 从组件库复用已有组件
7. git commit → CI 自动校验
```

### 开发者的一天

```
1. git pull                          # 拉取设计师提交的 .tower.json
2. Unity → TowerUI → Build All Prefabs  # 一键编译
3. 用 TowerUIBinder 绑定逻辑
4. 运行游戏测试
5. 如需热更新：用 TowerUIRenderer + documentPath
```

### 美术迁移的一天

```
1. pnpm inventory --unity-dir Assets/UI  # 查看进度
2. 编辑器中导入一批 Prefab
3. 在编辑器中微调（对齐、配色、命名）
4. 保存 → 验证 → 提交
```

---

## 常见问题

**Q: 编译出的 Prefab 有运行时依赖吗？**
A: 没有。编译出的是标准 UGUI Prefab（Image/Button/TMP_Text/ScrollRect 等原生组件），可以脱离 TowerGUI 独立运行。TowerUIBinder 是可选的便捷工具。

**Q: 已有的手工 Prefab 能继续用吗？**
A: 能。TowerGUI 不改变已有 Prefab，只是提供了一条新的生产管道。两者可以共存。

**Q: 设计师不会用命令行怎么办？**
A: 设计师只需要用浏览器编辑器。`pnpm dev` 由运维/技术负责人启动一次，团队内部署为共享服务即可。

**Q: 支持多人同时编辑同一个文件吗？**
A: 当前版本通过 Git 管理并发。每个界面是一个独立的 `.tower.json` 文件，不同设计师负责不同界面，通过 Git 合并即可。

**Q: 如何添加新的组件类型？**
A: 修改后运行 `pnpm coverage`，工具会自动告诉你 parser/generator/compiler/editor 四端哪些还没跟上。
