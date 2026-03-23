import type { IEngineAdapter, EngineNode } from '@tower-ui/core';
import { loadSprite, applySpriteWithSlice, loadSpriteFromAtlas } from '@tower-ui/core';
import { SoundManager } from '@tower-ui/core';

declare const CS: any;

interface CachedComponents {
  rt: any;
  image?: any;
  isText: boolean;
  cg?: any;
  eventReceiver?: any;
  eventHandlers?: Map<string, Function>;
  elementType: string;
}

const UIBridge = CS.TowerUI.UIBridge;

const ALIGN_MAP: Record<string, number> = {
  'left': 257,     // TMP TopLeft
  'center': 514,   // TMP MiddleCenter  
  'right': 516,    // TMP MiddleRight
};

const FILL_METHOD_MAP: Record<string, number> = {
  'horizontal': 0,
  'vertical': 1,
  'radial90': 2,
  'radial180': 3,
  'radial360': 4,
};

export class UnityAdapter implements IEngineAdapter {
  private root: any;
  private componentCache = new Map<number, CachedComponents>();

  constructor(canvasTransform: any) {
    this.root = canvasTransform.gameObject;
  }

  getRootContainer(): EngineNode {
    return this.root;
  }

  createElement(type: string): EngineNode {
    const parent = this.root.transform;
    let go: any;
    let isText = false;

    switch (type) {
      case 'ui-view':
        go = UIBridge.CreateWithImage(type, parent);
        break;
      case 'ui-text':
        go = UIBridge.CreateWithText(type, parent);
        isText = true;
        break;
      case 'ui-image':
        go = UIBridge.CreateWithImage(type, parent);
        break;
      case 'ui-button':
        go = UIBridge.CreateButton(type, parent);
        break;
      case 'ui-input':
        go = UIBridge.CreateInputField(type, parent);
        break;
      case 'ui-toggle':
        go = UIBridge.CreateToggle(type, parent);
        break;
      case 'ui-slider':
        go = UIBridge.CreateSlider(type, parent);
        break;
      case 'ui-progress':
        go = UIBridge.CreateProgress(type, parent);
        break;
      case 'ui-scroll':
        go = UIBridge.CreateScrollView(type, parent);
        break;
      default:
        go = UIBridge.CreateUIGameObject(type, parent);
        break;
    }

    if (go == null) {
      throw new Error(`[UnityAdapter] UIBridge failed to create element '${type}'`);
    }

    if (type === 'ui-view' || type === 'ui-image' || type === 'ui-button') {
      this.cacheImage(go);
    }

    if (type === 'ui-view') {
      const img = go.GetComponent('Image');
      if (img) UIBridge.SetColor(img, 1, 1, 1, 0);
    }

    this.cacheRT(go, isText, type);
    go.transform.SetParent(null, false);
    return go;
  }

  createText(text: string): EngineNode {
    const go = UIBridge.CreateWithText('ui-text', this.root.transform);
    if (go == null) {
      throw new Error(`[UnityAdapter] UIBridge failed to create text node`);
    }
    this.cacheRT(go, true, 'ui-text');
    UIBridge.SetText(go, text);
    go.transform.SetParent(null, false);
    return go;
  }

  appendChild(parent: EngineNode, child: EngineNode): void {
    if (parent == null || child == null) return;
    const parentCache = this.getCache(parent);
    if (parentCache?.elementType === 'ui-scroll') {
      const scroll = UIBridge.GetScrollRect(parent);
      if (scroll && scroll.content) {
        child.transform.SetParent(scroll.content.transform, false);
        return;
      }
    }
    child.transform.SetParent(parent.transform, false);
  }

  insertBefore(parent: EngineNode, child: EngineNode, before: EngineNode): void {
    if (parent == null || child == null) return;
    child.transform.SetParent(parent.transform, false);
    if (before != null) {
      const idx = before.transform.GetSiblingIndex();
      child.transform.SetSiblingIndex(idx);
    }
  }

  removeChild(_parent: EngineNode, child: EngineNode): void {
    if (child == null) return;
    this.clearCache(child);
    CS.UnityEngine.Object.Destroy(child);
  }

  clearChildren(container: EngineNode): void {
    if (container == null) return;
    const t = container.transform;
    for (let i = t.childCount - 1; i >= 0; i--) {
      const child = t.GetChild(i).gameObject;
      this.clearCache(child);
      CS.UnityEngine.Object.Destroy(child);
    }
  }

  scrollTo(node: EngineNode, x: number, y: number): void {
    if (node == null) return;
    UIBridge.SetScrollPosition(node, x, y);
  }

  getScrollContentSize(node: EngineNode): { width: number; height: number } {
    if (node == null) return { width: 0, height: 0 };
    const arr = UIBridge.GetScrollContentSize(node);
    return { width: arr?.[0] ?? 0, height: arr?.[1] ?? 0 };
  }

  applyProps(node: EngineNode, _oldProps: Record<string, any>, newProps: Record<string, any>, diff?: string[]): void {
    const keys = diff ?? Object.keys(newProps);
    const cached = this.getCache(node);
    if (!cached) return;

    for (const key of keys) {
      const val = newProps[key];
      if (val === undefined || key === 'children' || key === 'key' || key === 'ref') continue;
      this.applyProp(node, cached, key, val, newProps);
    }
  }

  updateText(node: EngineNode, text: string): void {
    UIBridge.SetText(node, text);
  }

  applyLayout(node: EngineNode, layout: { left: number; top: number; width: number; height: number }): void {
    const cached = this.getCache(node);
    if (!cached) return;
    UIBridge.SetPosition(cached.rt, layout.left, -layout.top);
    UIBridge.SetSize(cached.rt, layout.width, layout.height);
  }

  private applyProp(node: EngineNode, cached: CachedComponents, key: string, val: any, allProps: Record<string, any>): void {
    const type = cached.elementType;

    switch (key) {
      // Layout — handled by FlexLayout engine
      case 'width': case 'height': case 'flex': case 'flexDirection':
      case 'justifyContent': case 'alignItems': case 'alignSelf':
      case 'padding': case 'margin': case 'gap': case 'position':
      case 'top': case 'left': case 'right': case 'bottom':
      case 'flexGrow': case 'flexShrink': case 'flexBasis':
      case 'flexWrap': case 'alignContent': case 'rowGap': case 'columnGap':
      case 'minWidth': case 'minHeight': case 'maxWidth': case 'maxHeight':
      case 'aspectRatio':
        break;
      case 'overflow':
        if (cached.isText) {
          UIBridge.SetTextOverflow(node, val === 'wrap' || val === 'ellipsis', allProps.maxLines ?? 0);
        } else {
          UIBridge.SetOverflowHidden(node, val === 'hidden' || val === 'scroll');
        }
        break;

      // Visual
      case 'opacity':
        this.ensureCanvasGroup(node, cached).alpha = val;
        break;
      case 'visible':
        UIBridge.SetActive(node, val !== false);
        break;
      case 'zIndex':
        node.transform.SetSiblingIndex(val);
        break;

      // Transform
      case 'scaleX':
        UIBridge.SetScale(node.transform, val, node.transform.localScale.y, 1);
        break;
      case 'scaleY':
        UIBridge.SetScale(node.transform, node.transform.localScale.x, val, 1);
        break;
      case 'rotation':
        UIBridge.SetRotation(node.transform, 0, 0, val);
        break;
      case 'pivotX':
        UIBridge.SetPivot(cached.rt, val, cached.rt.pivot.y);
        break;
      case 'pivotY':
        UIBridge.SetPivot(cached.rt, cached.rt.pivot.x, 1 - val);
        break;

      // Text props
      case 'text':
        if (cached.isText) UIBridge.SetText(node, val);
        else if (type === 'ui-button') { const t = this.getButtonText(node); if (t) UIBridge.SetText(t, val); }
        break;
      case 'fontSize':
        if (cached.isText) UIBridge.SetFontSize(node, val);
        else if (type === 'ui-button') { const t = this.getButtonText(node); if (t) UIBridge.SetFontSize(t, val); }
        break;
      case 'color':
        if (cached.isText) {
          const c = parseColor(val);
          if (c) UIBridge.SetTextColor(node, c[0], c[1], c[2], c[3]);
        } else if (type === 'ui-button') {
          const c = parseColor(val);
          const t = this.getButtonText(node);
          if (c && t) UIBridge.SetTextColor(t, c[0], c[1], c[2], c[3]);
        }
        break;
      case 'align':
        if (cached.isText || type === 'ui-button') {
          const target = cached.isText ? node : this.getButtonText(node);
          if (target) {
            const alignVal = ALIGN_MAP[val] ?? 257;
            UIBridge.SetTextAlignment(target, alignVal);
          }
        }
        break;
      case 'bold':
        if (cached.isText) UIBridge.SetTextStyle(node, !!val, !!allProps.italic);
        break;
      case 'italic':
        if (cached.isText) UIBridge.SetTextStyle(node, !!allProps.bold, !!val);
        break;
      case 'maxLines':
        if (cached.isText) UIBridge.SetTextOverflow(node, true, val);
        break;
      // Image props
      case 'tint':
        if (cached.image) {
          const c = parseColor(val);
          if (c) UIBridge.SetColor(cached.image, c[0], c[1], c[2], c[3]);
        }
        break;
      case 'src':
        if (val && (type === 'ui-image' || type === 'ui-view')) {
          const atlas = allProps.atlas as string | undefined;
          const sprite = atlas
            ? loadSpriteFromAtlas(atlas, val)
            : loadSprite(val);
          if (sprite) {
            const sl = allProps.sliceLeft ?? 0;
            const sr = allProps.sliceRight ?? 0;
            const st = allProps.sliceTop ?? 0;
            const sb = allProps.sliceBottom ?? 0;
            applySpriteWithSlice(node, sprite, sl, sr, st, sb);
          }
        }
        break;
      case 'atlas':
        break;
      case 'sliceLeft': case 'sliceRight': case 'sliceTop': case 'sliceBottom':
        if (allProps.src) {
          const atlas2 = allProps.atlas as string | undefined;
          const sp = atlas2
            ? loadSpriteFromAtlas(atlas2, allProps.src)
            : loadSprite(allProps.src);
          if (sp) {
            applySpriteWithSlice(node, sp,
              allProps.sliceLeft ?? 0, allProps.sliceRight ?? 0,
              allProps.sliceTop ?? 0, allProps.sliceBottom ?? 0);
          }
        }
        break;
      case 'fillMethod':
        if (type === 'ui-image' || type === 'ui-view') {
          const method = FILL_METHOD_MAP[val] ?? 0;
          UIBridge.SetImageFill(node, method, allProps.fillAmount ?? 1, allProps.fillOrigin ?? 0);
        }
        break;
      case 'fillAmount':
        if (cached.image) {
          const method = FILL_METHOD_MAP[allProps.fillMethod] ?? 0;
          UIBridge.SetImageFill(node, method, val, allProps.fillOrigin ?? 0);
        }
        break;

      // Input props
      case 'value':
        if (type === 'ui-input') UIBridge.SetInputText(node, val);
        else if (type === 'ui-slider') UIBridge.SetSliderValue(node, val);
        else if (type === 'ui-progress') UIBridge.SetProgressValue(node, val, allProps.max ?? 100);
        break;
      case 'placeholder':
        if (type === 'ui-input') UIBridge.SetInputPlaceholder(node, val);
        break;
      case 'password':
        if (type === 'ui-input') UIBridge.SetInputPassword(node, !!val);
        break;
      case 'maxLength':
        if (type === 'ui-input') UIBridge.SetInputMaxLength(node, val);
        break;
      case 'readOnly':
        if (type === 'ui-input') UIBridge.SetInputReadOnly(node, !!val);
        break;

      // Toggle
      case 'checked':
        if (type === 'ui-toggle') UIBridge.SetToggleValue(node, !!val);
        break;

      // Slider
      case 'min':
        if (type === 'ui-slider') UIBridge.SetSliderRange(node, val, allProps.max ?? 1);
        break;
      case 'max':
        if (type === 'ui-slider') UIBridge.SetSliderRange(node, allProps.min ?? 0, val);
        else if (type === 'ui-progress') UIBridge.SetProgressValue(node, allProps.value ?? 0, val);
        break;
      case 'step':
        break;

      // Progress
      case 'barColor':
        if (type === 'ui-progress') {
          const c = parseColor(val);
          if (c) UIBridge.SetProgressBarColor(node, c[0], c[1], c[2], c[3]);
        }
        break;

      // Scroll
      case 'horizontal':
        if (type === 'ui-scroll') UIBridge.SetScrollDirection(node, !!val, allProps.vertical !== false);
        break;
      case 'vertical':
        if (type === 'ui-scroll') UIBridge.SetScrollDirection(node, !!allProps.horizontal, val !== false);
        break;

      case 'onScroll':
        if (type === 'ui-scroll' && typeof val === 'function') {
          this.bindScrollEvent(node, cached, val);
        }
        break;

      // Sound
      case 'clickSound':
        break;

      // Events
      case 'onClick':
        if (val && allProps.clickSound) {
          const soundPath = allProps.clickSound;
          const origHandler = val;
          this.bindEvent(node, cached, key, (e: any) => {
            SoundManager.play(soundPath);
            origHandler(e);
          });
        } else {
          this.bindEvent(node, cached, key, val);
        }
        break;
      case 'onPointerDown':
      case 'onPointerUp':
      case 'onPointerEnter':
      case 'onPointerExit':
        this.bindEvent(node, cached, key, val);
        break;

      case 'onChange':
        if (type === 'ui-input') this.bindInputChange(node, cached, val);
        else if (type === 'ui-toggle') this.bindToggleChange(node, cached, val);
        else if (type === 'ui-slider') this.bindSliderChange(node, cached, val);
        break;
      case 'onSubmit':
        if (type === 'ui-input') this.bindInputSubmit(node, cached, val);
        break;

      case 'interactive':
        if (cached.rt) {
          const cg = this.ensureCanvasGroup(node, cached);
          cg.blocksRaycasts = val !== false;
          cg.interactable = val !== false;
        }
        break;
      case 'disabled':
        if (cached.image) {
          const cg = this.ensureCanvasGroup(node, cached);
          cg.interactable = !val;
          cg.alpha = val ? 0.5 : 1;
        }
        break;
    }
  }

  // ── Event binding ───────────────────────────────────────────

  private getButtonText(node: EngineNode): any {
    if (node == null) return null;
    const t = node.transform;
    if (t.childCount > 0) return t.GetChild(0).gameObject;
    return null;
  }

  private ensureReceiver(node: EngineNode, cached: CachedComponents): any {
    if (!cached.eventReceiver) {
      const r = UIBridge.EnsureEventReceiver(node);
      if (r == null) return null;
      cached.eventReceiver = r;
    }
    if (!cached.eventHandlers) cached.eventHandlers = new Map();
    return cached.eventReceiver;
  }

  private bindEvent(node: EngineNode, cached: CachedComponents, propKey: string, handler: Function | null): void {
    const receiver = this.ensureReceiver(node, cached);
    if (!receiver) return;
    if (!cached.eventHandlers) cached.eventHandlers = new Map();

    if (handler) {
      cached.eventHandlers.set(propKey, handler);
    } else {
      cached.eventHandlers.delete(propKey);
    }

    const makeEvent = (type: string, extra?: any) => ({
      type, target: node, stopPropagation() {}, preventDefault() {}, ...extra,
    });

    switch (propKey) {
      case 'onClick':
        receiver.onPointerClick = handler
          ? (btn: number) => cached.eventHandlers?.get('onClick')?.(makeEvent('click', { button: btn }))
          : null;
        break;
      case 'onPointerDown':
        receiver.onPointerDown = handler
          ? (btn: number) => cached.eventHandlers?.get('onPointerDown')?.(makeEvent('pointerdown', { button: btn }))
          : null;
        break;
      case 'onPointerUp':
        receiver.onPointerUp = handler
          ? (btn: number) => cached.eventHandlers?.get('onPointerUp')?.(makeEvent('pointerup', { button: btn }))
          : null;
        break;
      case 'onPointerEnter':
        receiver.onPointerEnter = handler
          ? () => cached.eventHandlers?.get('onPointerEnter')?.(makeEvent('pointerenter'))
          : null;
        break;
      case 'onPointerExit':
        receiver.onPointerExit = handler
          ? () => cached.eventHandlers?.get('onPointerExit')?.(makeEvent('pointerexit'))
          : null;
        break;
    }
  }

  private bindInputChange(node: EngineNode, cached: CachedComponents, handler: Function | null): void {
    const receiver = this.ensureReceiver(node, cached);
    if (!receiver) return;
    receiver.BindInputEvents();
    receiver.onInputChange = handler ? (v: string) => handler(v) : null;
  }

  private bindInputSubmit(node: EngineNode, cached: CachedComponents, handler: Function | null): void {
    const receiver = this.ensureReceiver(node, cached);
    if (!receiver) return;
    receiver.BindInputEvents();
    receiver.onInputSubmit = handler ? (v: string) => handler(v) : null;
  }

  private bindToggleChange(node: EngineNode, cached: CachedComponents, handler: Function | null): void {
    const receiver = this.ensureReceiver(node, cached);
    if (!receiver) return;
    receiver.BindToggleEvents();
    receiver.onToggleChange = handler ? (v: boolean) => handler(v) : null;
  }

  private bindSliderChange(node: EngineNode, cached: CachedComponents, handler: Function | null): void {
    const receiver = this.ensureReceiver(node, cached);
    if (!receiver) return;
    receiver.BindSliderEvents();
    receiver.onSliderChange = handler ? (v: number) => handler(v) : null;
  }

  private bindScrollEvent(node: EngineNode, cached: CachedComponents, handler: Function | null): void {
    if (!handler) return;
    const scrollRect = UIBridge.GetScrollRect(node);
    if (!scrollRect) return;
    scrollRect.onValueChanged.AddListener((pos: any) => {
      try {
        const content = scrollRect.content;
        if (content) {
          const scrollX = -content.anchoredPosition.x;
          const scrollY = -content.anchoredPosition.y;
          handler(scrollX, scrollY);
        }
      } catch { /* safe */ }
    });
  }

  // ── Component caching ───────────────────────────────────────

  private getId(go: any): number {
    return go.GetInstanceID();
  }

  private cacheRT(go: any, isText: boolean, elementType: string): void {
    const id = this.getId(go);
    const existing = this.componentCache.get(id);
    const rt = go.transform;
    if (existing) {
      existing.rt = rt;
      existing.elementType = elementType;
    } else {
      this.componentCache.set(id, { rt, isText, elementType });
    }
  }

  private cacheImage(go: any): void {
    const id = this.getId(go);
    const img = go.GetComponent('Image');
    const existing = this.componentCache.get(id);
    if (existing) {
      existing.image = img;
    } else {
      this.componentCache.set(id, { rt: go.transform, image: img, isText: false, elementType: '' });
    }
  }

  private getCache(go: any): CachedComponents | undefined {
    return this.componentCache.get(this.getId(go));
  }

  private clearCache(go: any): void {
    this.componentCache.delete(this.getId(go));
  }

    private ensureCanvasGroup(go: any, cached: CachedComponents): any {
      if (!cached.cg) {
        cached.cg = UIBridge.EnsureCanvasGroup(go);
      }
      return cached.cg;
    }
}

function parseColor(val: string | undefined): [number, number, number, number] | null {
  if (!val) return null;
  if (val.startsWith('#')) {
    const hex = val.slice(1);
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        1,
      ];
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        parseInt(hex.slice(6, 8), 16) / 255,
      ];
    }
  }
  return null;
}
