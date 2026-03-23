# TowerGUI 迁移指南

## 从 FairyGUI 迁移

### 概述

FairyGUI 使用 XML 描述 UI，TowerGUI 使用 JSON (.tower.json)。

### 自动转换

```bash
# 单个包转换
npx tower-ui import <fairygui-dir> --from fairygui --out <output.tower.json>

# 通过编辑器
File → Import FairyGUI → 选择 FairyGUI 包目录
```

### 概念映射

| FairyGUI | TowerGUI | 说明 |
|----------|----------|------|
| GComponent | ui-view | 容器 |
| GImage | ui-image | 图片 |
| GTextField / GRichTextField | ui-text | 文本 |
| GButton | ui-button | 按钮 |
| GTextInput | ui-input | 输入框 |
| GSlider | ui-slider | 滑块 |
| GProgressBar | ui-progress | 进度条 |
| GList | ui-scroll + children | 列表 |
| Controller | 状态管理 (useStore) | 需手动迁移 |
| Transition | useAnimation | 需手动调整 |

### 注意事项

1. FairyGUI 的 Controller 逻辑需要手动迁移为 React 状态管理
2. Transition 动画需要用 `useAnimation` 重写
3. 自定义组件对应 TowerGUI 的组件模板（Templates）
4. 位图字体需要重新配置
5. 九宫格参数会自动转换为 `scale9Grid`

---

## 从 Unity Prefab 迁移

### 概述

将现有 UGUI Prefab 转换为 .tower.json，保留布局和属性。

### 批量同步（推荐）

```bash
# 增量同步所有 Prefab
node tools/mirror-prefabs.mjs \
  --source <unity-project>/Assets/UI/Prefabs \
  --target <tower-project>/screens

# 通过编辑器
File → Sync Prefabs → 配置源目录 → Start Sync
```

### 组件映射

| UGUI | TowerGUI | 自动转换 |
|------|----------|---------|
| RectTransform | ui-view (position/size) | ✅ |
| Image | ui-image | ✅ |
| RawImage | ui-view (tint) | ✅ |
| Text (Legacy) | ui-text | ✅ |
| TextMeshPro | ui-text | ✅ |
| Button | ui-button | ✅ |
| Toggle | ui-toggle | ✅ |
| Slider | ui-slider | ✅ |
| InputField / TMP_InputField | ui-input | ✅ |
| ScrollRect | ui-scroll | ✅ |
| HorizontalLayoutGroup | flexDirection: row | ✅ |
| VerticalLayoutGroup | flexDirection: column | ✅ |
| GridLayoutGroup | flexWrap + gap | ✅ |
| CanvasGroup (alpha) | opacity | ✅ |
| Mask / RectMask2D | overflow: hidden | ✅ |
| Animator | meta.animations (元数据) | ✅ |
| Dropdown | (需手动调整) | ⚠️ |

### 嵌套 Prefab

转换器支持嵌套 Prefab 引用的递归解析：

1. 确保提供完整的 Unity Assets 目录作为 `--project` 参数
2. `.meta` 文件中的 GUID 用于定位嵌套引用
3. 无法定位的嵌套 Prefab 会生成占位节点 `[Nested:xxxx...]`

### Sprite 资源

```bash
# 构建 Sprite 映射
node tools/build-sprite-map.mjs \
  --assets <Assets-root> \
  --json-dir <tower-project>/screens \
  --out-dir <tower-project>/sprites
```

### 迁移步骤

1. `Sync Prefabs` 批量转换所有 Prefab
2. `build-sprite-map` 处理图片资源
3. 在编辑器中逐个打开检查，调整布局
4. 添加 dataBind 标注
5. 生成协议和代理类

---

## 协议对接

### 概述

TowerGUI 支持从 UI 文档自动生成 Protobuf 协议和 C# 代理类，实现 UI ↔ 服务器数据的自动绑定。

### 工作流

```
编辑器标注 dataBind → Generate Protocol → .proto + .cs
                                           ↓
服务器使用 .proto 定义接口 ← → C# Proxy 调用 DataBridge.Push
                                           ↓
                                    JS Store → UI 自动更新
```

### 步骤

#### 1. 在编辑器中标注 dataBind

选择节点 → Properties → Data Binding：

- **display**: 文本/图片等展示节点，设置 `field` 和 `protoType`
- **event**: 按钮等交互节点，设置 `event` 名称
- **list**: 列表容器，设置 `field` 和 `itemType`

#### 2. 生成协议代码

```bash
# CLI
node tools/tower-to-proto.mjs --dir <screens-dir> -o <proto-output>
node tools/tower-to-proxy.mjs --dir <screens-dir> -o <proxy-output> --namespace MyGame.UI

# 编辑器
File → Generate Protocol
```

#### 3. 生成的文件

**Proto 文件** (`{Screen}.proto`):
```protobuf
syntax = "proto3";
package tower.mainScreen;

message MainScreenData {
  string playerName = 1;
  int32 playerLevel = 2;
  repeated MainScreenItemsItem items = 3;
}

message MainScreenOnBuyReq {}
message MainScreenOnBuyResp {
  int32 code = 1;
  string message = 2;
}
```

**C# Proxy** (`{Screen}Proxy.cs`):
```csharp
public partial class MainScreenProxy : MonoBehaviour {
    private TMP_Text _txtPlayerName;
    private Button _btnBuy;

    public void Bind(Transform root) { ... }
    public void FillFromServer(MainScreenData data) { ... }
    protected virtual void On_onBuy() { ... }
}
```

#### 4. C# 侧使用

```csharp
var proxy = gameObject.AddComponent<MainScreenProxy>();
proxy.Bind(uiRoot);

// 从服务器接收数据后
proxy.FillFromServer(serverData);
```

#### 5. 与 DataBridge 结合

Proxy 的 `FillFromServer` 内部也可以通过 `DataBridge.Push` 更新 JS Store，实现 React UI 自动刷新。
