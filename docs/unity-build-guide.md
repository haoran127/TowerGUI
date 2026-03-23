# TowerGUI Unity 构建指南

## 前置要求

- Unity 2021.3+ (LTS 推荐)
- Puerts 2.x (V8 或 QuickJS 后端)
- Node.js 18+
- pnpm 8+

## 1. JS Bundle 打包

```bash
cd apps/unity-demo/TsProject
pnpm install
pnpm build          # 生成 output/main.mjs
```

打包后的 `main.mjs` 需要放入 Unity 可加载的位置：

| 加载方式 | 放置路径 | 说明 |
|---------|---------|------|
| Resources | `Assets/Resources/puerts/main.mjs.txt` | 简单但不支持热更 |
| StreamingAssets | `Assets/StreamingAssets/js/main.mjs` | 可热更，需自定义 Loader |
| Addressables | 任意路径，通过 label 加载 | 推荐生产环境 |

## 2. 资源配置

### Sprite 资源
- 放入 `Assets/Resources/UI/` 目录
- 或使用 SpriteAtlas 打包后通过 `AssetManager.LoadSpriteFromAtlas()` 加载
- Sprite Import Settings: `Sprite Mode = Single`, `Read/Write = false`, `Generate Mip Maps = false`

### 字体资源
- TMP 字体：`Assets/Resources/Fonts/` 下的 `.asset` (SDF Font)
- 确保包含中文字符集（推荐使用 Dynamic SDF）

### 音效资源
- 放入 `Assets/Resources/Audio/` 目录
- Import Settings: `Load In Background = true`, `Compression Format = Vorbis`

## 3. 场景配置

1. 创建空 Scene
2. 添加空 GameObject，挂载以下组件：
   - `TowerUIBoot` — JS 引擎启动器
   - `TowerHMR` — (开发环境) WebSocket 热重载客户端
   - `UnityMainThread` — 主线程回调调度器

3. 确保场景中有一个 Canvas（TowerGUI 运行时会自动创建 UGUI 元素）

## 4. Puerts 代码生成

```bash
# 在 Unity Editor 中执行
Puerts → Generate Code
```

生成的 Wrapper 代码确保 C# 类型可在 JS 中正确访问。

## 5. IL2CPP 构建注意事项

### link.xml

在 `Assets/` 下创建 `link.xml` 防止代码被裁剪：

```xml
<linker>
  <assembly fullname="TowerUI.Runtime" preserve="all"/>
  <assembly fullname="Puerts" preserve="all"/>
  <assembly fullname="Unity.TextMeshPro" preserve="all"/>
  <assembly fullname="UnityEngine.UI" preserve="all"/>
</linker>
```

### asmdef 配置

确保 `TowerUI.Runtime.asmdef` 引用了：
- `Unity.TextMeshPro`
- `UnityEngine.UI`
- `Puerts`

### 构建设置

- **Scripting Backend**: IL2CPP
- **API Compatibility Level**: .NET Standard 2.1
- **Managed Stripping Level**: Low (避免 Puerts 反射失败)
- **C++ Compiler Configuration**: Release

## 6. 开发流程

```
1. 启动 dev server:     pnpm dev
2. Unity Editor 运行场景
3. TowerHMR 自动连接 ws://localhost:3000/__editor
4. 修改 TSX → 自动打包 → WebSocket 通知 → Unity 重载 JS
```

### 调试技巧

- Unity Console 中 `[TowerUI]` 前缀的日志来自 JS 运行时
- `[TowerHMR]` 前缀表示热重载事件
- Chrome DevTools 可通过 Puerts 的 V8 Inspector 连接调试 JS

## 7. 生产构建 Checklist

- [ ] `pnpm build` 生成 release 版本的 main.mjs
- [ ] 移除 `TowerHMR` 组件或确保条件编译 (`DEVELOPMENT_BUILD`)
- [ ] SpriteAtlas 正确打包，验证加载
- [ ] 字体包含所有目标语言字符集
- [ ] link.xml 包含所有必要 assembly
- [ ] Managed Stripping Level 设为 Low
- [ ] 真机测试 iOS/Android 各一轮
- [ ] 内存 Profiler 确认无 JS 内存泄漏
