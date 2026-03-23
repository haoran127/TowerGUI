# TowerGUI API 参考

## 组件 (Components)

### `<ui-view>`
容器元素，支持 Flexbox 布局和背景色。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| width | number | - | 宽度(px) |
| height | number | - | 高度(px) |
| flexDirection | enum | column | row / column / row-reverse / column-reverse |
| justifyContent | enum | flex-start | 主轴对齐 |
| alignItems | enum | stretch | 交叉轴对齐 |
| gap | number | 0 | 子元素间距 |
| padding | number | 0 | 内边距 |
| position | enum | relative | relative / absolute |
| left/top/right/bottom | number | - | 绝对定位偏移 |
| tint | color | - | 背景色 |
| opacity | number | 1 | 透明度 0-1 |
| visible | boolean | true | 是否显示 |
| overflow | enum | visible | visible / hidden / scroll |

### `<ui-text>`
文本显示元素。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| text | string | **必填** | 文本内容 |
| fontSize | number | 16 | 字号 |
| color | color | #ffffff | 文本颜色 |
| align | enum | left | left / center / right |
| bold | boolean | false | 粗体 |
| italic | boolean | false | 斜体 |
| maxLines | number | - | 最大行数 |

### `<ui-image>`
图片显示元素。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| src | string | - | 图片资源路径 |
| tint | color | - | 着色 |
| scale9Grid | string | - | 9-slice 参数 "top,right,bottom,left" |
| fillMethod | enum | - | horizontal / vertical / radial90 / radial180 / radial360 |
| fillAmount | number | 1 | 填充量 0-1 |

### `<ui-button>`
可点击按钮。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| text | string | - | 按钮文本 |
| fontSize | number | 16 | 字号 |
| color | color | - | 文本颜色 |
| disabled | boolean | false | 禁用状态 |
| onClick | callback | - | 点击回调 |

### `<ui-input>`
文本输入框。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | string | - | 当前值 |
| placeholder | string | - | 占位文本 |
| password | boolean | false | 密码模式 |
| maxLength | number | - | 最大长度 |
| onChange | callback | - | 值变更回调 |

### `<ui-toggle>`
开关。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| checked | boolean | false | 选中状态 |
| onChange | callback | - | 变更回调 |

### `<ui-slider>`
滑块。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | number | 0 | 当前值 |
| min | number | 0 | 最小值 |
| max | number | 1 | 最大值 |
| step | number | - | 步进值 |
| onChange | callback | - | 变更回调 |

### `<ui-progress>`
进度条。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | number | 0 | 当前值 |
| max | number | 100 | 最大值 |
| barColor | color | - | 进度条颜色 |

### `<ui-scroll>`
滚动容器。

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| horizontal | boolean | false | 水平滚动 |
| vertical | boolean | true | 垂直滚动 |

## Hooks API

### `useSprite(path)`
同步加载 Sprite 资源。

```tsx
const { asset, loading, error } = useSprite("Icons/gold");
```

### `useSpriteAsync(key)`
异步加载 Sprite（Addressables）。

```tsx
const { asset, loading, error } = useSpriteAsync("Icons/gold");
```

### `useStore(store, selector?)`
订阅数据 Store。

```tsx
const playerName = useStore(gameStore, s => s.player.name);
```

### `useAnimation(config)`
创建动画。

```tsx
const anim = useAnimation({ from: 0, to: 1, duration: 300 });
```

## Data Binding API

### DataBindInfo 类型

```typescript
interface DataBindInfo {
  role: 'display' | 'event' | 'list';
  field?: string;         // display: proto 字段名
  protoType?: string;     // display: string/int32/float/bool/bytes
  event?: string;         // event: 事件名
  itemType?: string;      // list: 列表项类型名
}
```

### C# DataBridge

```csharp
DataBridge.Push("player.name", "Hero");
DataBridge.PushRaw("stats", "{\"hp\":100}");
DataBridge.BeginBatch();
// ... multiple Push calls
DataBridge.EndBatch();
```

## CLI 命令

| 命令 | 用法 |
|------|------|
| `create` | `tower-ui create <name> [--dir <path>]` |
| `dev` | `tower-ui dev [entry] [--port N] [--width W] [--height H]` |
| `generate` | `tower-ui generate <description> -o <file>` |
| `modify` | `tower-ui modify <file> <description>` |
| `from-image` | `tower-ui from-image <image> -o <file>` |
| `validate` | `tower-ui validate <json-file>` |
| `import` | `tower-ui import <dir> --from fairygui --out <file>` |
| `export` | `tower-ui export <file> --to tsx --out <dir>` |
| `schema` | `tower-ui schema` |

## 工具链

| 工具 | 说明 |
|------|------|
| `tools/mirror-prefabs.mjs` | 增量同步 Unity Prefab → .tower.json |
| `tools/tower-to-proto.mjs` | 从 dataBind 标注生成 .proto |
| `tools/tower-to-proxy.mjs` | 生成 C# UI 代理类 |
| `tools/build-sprite-map.mjs` | 构建 Sprite GUID → 路径映射 |
| `tools/fairy-to-tsx.mjs` | FairyGUI → .tower.json |
