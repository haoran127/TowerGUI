import type { IEngineAdapter } from '@tower-ui/core';

type DOMNode = HTMLElement | Text;

const FLEX_PROP_MAP: Record<string, string> = {
  flexDirection: 'flexDirection',
  justifyContent: 'justifyContent',
  alignItems: 'alignItems',
  alignSelf: 'alignSelf',
  alignContent: 'alignContent',
  flexWrap: 'flexWrap',
  flexGrow: 'flexGrow',
  flexShrink: 'flexShrink',
  flexBasis: 'flexBasis',
  gap: 'gap',
  rowGap: 'rowGap',
  columnGap: 'columnGap',
};

/**
 * WebAdapter — renders TowerUI components to HTML DOM with CSS Flexbox.
 * Used for browser-based preview (no Unity required).
 */
export class WebAdapter implements IEngineAdapter {
  private root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.style.position = 'relative';
    this.root.style.overflow = 'hidden';
  }

  getRootContainer(): DOMNode {
    return this.root;
  }

  createElement(type: string): DOMNode {
    const el = document.createElement('div');
    el.dataset.type = type;
    el.style.position = 'relative';
    el.style.boxSizing = 'border-box';
    el.style.display = 'flex';

    switch (type) {
      case 'ui-view':
        el.style.flexDirection = 'column';
        break;

      case 'ui-text':
        el.style.display = 'block';
        el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        el.style.fontSize = '16px';
        el.style.color = '#ffffff';
        el.style.whiteSpace = 'nowrap';
        el.style.userSelect = 'none';
        break;

      case 'ui-image':
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        break;

      case 'ui-button': {
        el.style.cursor = 'pointer';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.backgroundColor = '#3a3a50';
        el.style.color = '#ffffff';
        el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        el.style.fontSize = '14px';
        el.style.border = '1px solid #555';
        el.style.borderRadius = '4px';
        el.style.userSelect = 'none';
        el.addEventListener('mouseenter', () => { el.style.filter = 'brightness(1.2)'; });
        el.addEventListener('mouseleave', () => { el.style.filter = ''; });
        el.addEventListener('mousedown', () => { el.style.transform = 'scale(0.96)'; });
        el.addEventListener('mouseup', () => { el.style.transform = ''; });
        break;
      }

      case 'ui-input': {
        const input = document.createElement('input');
        input.type = 'text';
        input.style.width = '100%';
        input.style.height = '100%';
        input.style.backgroundColor = '#1a1a2e';
        input.style.color = '#ffffff';
        input.style.border = '1px solid #444';
        input.style.borderRadius = '4px';
        input.style.padding = '4px 10px';
        input.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        input.style.fontSize = '14px';
        input.style.outline = 'none';
        input.style.boxSizing = 'border-box';
        el.appendChild(input);
        (el as any).__input = input;
        break;
      }

      case 'ui-toggle': {
        el.style.cursor = 'pointer';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';
        el.style.userSelect = 'none';

        const box = document.createElement('div');
        box.style.width = '28px';
        box.style.height = '28px';
        box.style.borderRadius = '4px';
        box.style.border = '2px solid #555';
        box.style.backgroundColor = '#2a2a3e';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.flexShrink = '0';
        box.style.transition = 'background-color 0.15s';

        const check = document.createElement('div');
        check.style.width = '16px';
        check.style.height = '16px';
        check.style.borderRadius = '2px';
        check.style.backgroundColor = '#4caf50';
        check.style.display = 'none';

        box.appendChild(check);
        el.appendChild(box);
        (el as any).__toggleBox = box;
        (el as any).__toggleCheck = check;
        (el as any).__checked = false;

        el.addEventListener('click', () => {
          const checked = !(el as any).__checked;
          (el as any).__checked = checked;
          check.style.display = checked ? 'block' : 'none';
          const handler = (el as any).__onChange;
          if (handler) handler(checked);
        });
        break;
      }

      case 'ui-slider': {
        el.style.display = 'flex';
        el.style.alignItems = 'center';

        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = '100';
        range.value = '0';
        range.style.width = '100%';
        range.style.accentColor = '#4da6ff';
        el.appendChild(range);
        (el as any).__slider = range;
        break;
      }

      case 'ui-progress': {
        el.style.backgroundColor = '#2a2a3e';
        el.style.borderRadius = '4px';
        el.style.overflow = 'hidden';

        const bar = document.createElement('div');
        bar.style.height = '100%';
        bar.style.backgroundColor = '#4caf50';
        bar.style.width = '0%';
        bar.style.transition = 'width 0.3s ease';
        bar.style.borderRadius = '4px';
        el.appendChild(bar);
        (el as any).__progressBar = bar;
        break;
      }

      case 'ui-scroll': {
        el.style.overflow = 'auto';
        el.style.flexDirection = 'column';
        break;
      }
    }

    return el;
  }

  createText(text: string): DOMNode {
    return document.createTextNode(text);
  }

  appendChild(parent: DOMNode, child: DOMNode): void {
    if (parent instanceof HTMLElement) {
      parent.appendChild(child);
    }
  }

  insertBefore(parent: DOMNode, child: DOMNode, before: DOMNode): void {
    if (parent instanceof HTMLElement) {
      parent.insertBefore(child, before);
    }
  }

  removeChild(_parent: DOMNode, child: DOMNode): void {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
  }

  clearChildren(container: DOMNode): void {
    if (container instanceof HTMLElement) {
      container.innerHTML = '';
    }
  }

  updateText(node: DOMNode, text: string): void {
    if (node instanceof Text) {
      node.textContent = text;
    } else if (node instanceof HTMLElement && node.dataset.type === 'ui-text') {
      node.textContent = text;
    }
  }

  applyProps(node: DOMNode, _oldProps: Record<string, any>, newProps: Record<string, any>, diff?: string[]): void {
    if (!(node instanceof HTMLElement)) return;
    const keys = diff ?? Object.keys(newProps);
    const el = node;

    for (const key of keys) {
      const val = newProps[key];
      if (val === undefined || key === 'children' || key === 'key' || key === 'ref') continue;

      this.applyProp(el, key, val, newProps);
    }
  }

  applyLayout(_node: DOMNode, _layout: { left: number; top: number; width: number; height: number }): void {
    // No-op: WebAdapter uses CSS Flexbox natively, no custom layout needed.
  }

  private applyProp(el: HTMLElement, key: string, val: any, allProps: Record<string, any>): void {
    switch (key) {
      // Dimensions
      case 'width':
        el.style.width = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'height':
        el.style.height = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'minWidth':
        el.style.minWidth = `${val}px`;
        break;
      case 'minHeight':
        el.style.minHeight = `${val}px`;
        break;
      case 'maxWidth':
        el.style.maxWidth = `${val}px`;
        break;
      case 'maxHeight':
        el.style.maxHeight = `${val}px`;
        break;

      // Flexbox
      case 'flex':
        el.style.flex = String(val);
        break;
      case 'flexDirection':
      case 'justifyContent':
      case 'alignItems':
      case 'alignSelf':
      case 'alignContent':
      case 'flexWrap':
      case 'gap':
      case 'rowGap':
      case 'columnGap':
        (el.style as any)[FLEX_PROP_MAP[key] || key] = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'flexGrow':
        el.style.flexGrow = String(val);
        break;
      case 'flexShrink':
        el.style.flexShrink = String(val);
        break;
      case 'flexBasis':
        el.style.flexBasis = typeof val === 'number' ? `${val}px` : val;
        break;

      // Padding / Margin
      case 'padding':
        el.style.padding = parsePadding(val);
        break;
      case 'margin':
        el.style.margin = parsePadding(val);
        break;

      // Position
      case 'position':
        el.style.position = val;
        break;
      case 'top':
        el.style.top = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'left':
        el.style.left = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'right':
        el.style.right = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'bottom':
        el.style.bottom = typeof val === 'number' ? `${val}px` : val;
        break;

      // Visual
      case 'opacity':
        el.style.opacity = String(val);
        break;
      case 'visible':
        el.style.display = val === false ? 'none' : (el.dataset.type === 'ui-text' ? 'block' : 'flex');
        break;
      case 'zIndex':
        el.style.zIndex = String(val);
        break;
      case 'overflow':
        el.style.overflow = val;
        break;

      // Transform
      case 'scaleX':
      case 'scaleY':
      case 'rotation':
        this.applyTransform(el, allProps);
        break;
      case 'pivotX':
        el.style.transformOrigin = `${(val ?? 0.5) * 100}% ${((allProps.pivotY ?? 0.5)) * 100}%`;
        break;
      case 'pivotY':
        el.style.transformOrigin = `${((allProps.pivotX ?? 0.5)) * 100}% ${(val ?? 0.5) * 100}%`;
        break;

      // Color / Tint
      case 'tint':
        el.style.backgroundColor = val;
        break;
      case 'color':
        el.style.color = val;
        break;

      // Text
      case 'text':
        if (el.dataset.type === 'ui-text') {
          el.textContent = val;
        } else if (el.dataset.type === 'ui-button') {
          el.textContent = val;
        }
        break;
      case 'fontSize':
        el.style.fontSize = `${val}px`;
        break;
      case 'fontFamily':
        el.style.fontFamily = val;
        break;
      case 'bold':
        el.style.fontWeight = val ? 'bold' : 'normal';
        break;
      case 'italic':
        el.style.fontStyle = val ? 'italic' : 'normal';
        break;
      case 'align':
        el.style.textAlign = val;
        break;
      case 'maxLines': {
        el.style.display = '-webkit-box';
        (el.style as any)['-webkit-line-clamp'] = String(val);
        (el.style as any)['-webkit-box-orient'] = 'vertical';
        el.style.overflow = 'hidden';
        break;
      }

      // Image
      case 'src':
        el.style.backgroundImage = val ? `url(${val})` : '';
        if (val) {
          if (!el.style.backgroundSize) el.style.backgroundSize = '100% 100%';
          el.style.backgroundRepeat = 'no-repeat';
        }
        if (allProps.sliceLeft || allProps.sliceRight || allProps.sliceTop || allProps.sliceBottom) {
          el.style.borderImageSource = val ? `url(${val})` : '';
          el.style.borderImageSlice = `${allProps.sliceTop ?? 0} ${allProps.sliceRight ?? 0} ${allProps.sliceBottom ?? 0} ${allProps.sliceLeft ?? 0} fill`;
          el.style.borderImageWidth = `${allProps.sliceTop ?? 0}px ${allProps.sliceRight ?? 0}px ${allProps.sliceBottom ?? 0}px ${allProps.sliceLeft ?? 0}px`;
          el.style.backgroundImage = '';
        }
        break;
      case 'fillAmount':
        if (el.dataset.type === 'ui-progress') {
          const bar = (el as any).__progressBar;
          const max = allProps.max ?? 100;
          if (bar) bar.style.width = `${Math.min(100, (val / max) * 100)}%`;
        }
        break;

      // Input
      case 'value':
        if (el.dataset.type === 'ui-input') {
          const input = (el as any).__input;
          if (input) input.value = val;
        } else if (el.dataset.type === 'ui-slider') {
          const slider = (el as any).__slider;
          if (slider) slider.value = String(val);
        } else if (el.dataset.type === 'ui-progress') {
          const bar = (el as any).__progressBar;
          const max = allProps.max ?? 100;
          if (bar) bar.style.width = `${Math.min(100, (val / max) * 100)}%`;
        }
        break;
      case 'placeholder':
        if ((el as any).__input) (el as any).__input.placeholder = val;
        break;
      case 'password':
        if ((el as any).__input) (el as any).__input.type = val ? 'password' : 'text';
        break;
      case 'maxLength':
        if ((el as any).__input) (el as any).__input.maxLength = val;
        break;
      case 'readOnly':
        if ((el as any).__input) (el as any).__input.readOnly = val;
        break;

      // Toggle
      case 'checked':
        if (el.dataset.type === 'ui-toggle') {
          (el as any).__checked = !!val;
          const check = (el as any).__toggleCheck;
          if (check) check.style.display = val ? 'block' : 'none';
        }
        break;

      // Slider
      case 'min':
        if ((el as any).__slider) (el as any).__slider.min = String(val);
        break;
      case 'max':
        if ((el as any).__slider) (el as any).__slider.max = String(val);
        if (el.dataset.type === 'ui-progress') {
          const bar = (el as any).__progressBar;
          const v = allProps.value ?? 0;
          if (bar) bar.style.width = `${Math.min(100, (v / val) * 100)}%`;
        }
        break;

      // Progress bar color
      case 'barColor':
        if ((el as any).__progressBar) (el as any).__progressBar.style.backgroundColor = val;
        break;

      // Scroll
      case 'horizontal':
        el.style.overflowX = val ? 'auto' : 'hidden';
        break;
      case 'vertical':
        el.style.overflowY = val !== false ? 'auto' : 'hidden';
        break;

      // Interaction
      case 'interactive':
        el.style.pointerEvents = val === false ? 'none' : 'auto';
        break;
      case 'disabled':
        el.style.pointerEvents = val ? 'none' : 'auto';
        el.style.opacity = val ? '0.5' : (allProps.opacity != null ? String(allProps.opacity) : '1');
        break;

      // Events
      case 'onClick':
        (el as any).__onClick = val;
        el.onclick = val ? () => val({ type: 'click', target: el, stopPropagation() {}, preventDefault() {} }) : null;
        break;
      case 'onPointerDown':
        el.onmousedown = val ? () => val({ type: 'pointerdown', target: el, stopPropagation() {}, preventDefault() {} }) : null;
        break;
      case 'onPointerUp':
        el.onmouseup = val ? () => val({ type: 'pointerup', target: el, stopPropagation() {}, preventDefault() {} }) : null;
        break;
      case 'onPointerEnter':
        el.onmouseenter = val ? () => val({ type: 'pointerenter', target: el, stopPropagation() {}, preventDefault() {} }) : null;
        break;
      case 'onPointerExit':
        el.onmouseleave = val ? () => val({ type: 'pointerexit', target: el, stopPropagation() {}, preventDefault() {} }) : null;
        break;
      case 'onChange':
        if (el.dataset.type === 'ui-input' && (el as any).__input) {
          (el as any).__input.oninput = val ? (e: Event) => val((e.target as HTMLInputElement).value) : null;
        } else if (el.dataset.type === 'ui-toggle') {
          (el as any).__onChange = val;
        } else if (el.dataset.type === 'ui-slider' && (el as any).__slider) {
          (el as any).__slider.oninput = val ? (e: Event) => val(Number((e.target as HTMLInputElement).value)) : null;
        }
        break;

      // Sound (no-op in web preview, could use Web Audio)
      case 'clickSound':
        break;

      case 'verticalAlign':
        if (el.dataset.type === 'ui-text') {
          if (val === 'middle') {
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            if (el.style.textAlign === 'center') el.style.justifyContent = 'center';
            else if (el.style.textAlign === 'right') el.style.justifyContent = 'flex-end';
          } else if (val === 'bottom') {
            el.style.display = 'flex';
            el.style.alignItems = 'flex-end';
          }
        }
        break;

      // Handled elsewhere or no-op
      case 'atlas': case 'sliceLeft': case 'sliceRight': case 'sliceTop': case 'sliceBottom':
      case 'scale9Grid': case 'fillMethod': case 'fillOrigin': case 'flipX': case 'flipY':
      case 'preserveAspect': case 'step': case 'elastic': case 'inertia':
      case 'scrollbarVisibility': case 'onScroll': case 'onSubmit': case 'onFocus': case 'onBlur':
      case 'placeholderColor': case 'multiline': case 'lineHeight':
      case 'bgColor': case 'aspectRatio':
        break;
    }
  }

  private applyTransform(el: HTMLElement, props: Record<string, any>): void {
    const sx = props.scaleX ?? 1;
    const sy = props.scaleY ?? 1;
    const rot = props.rotation ?? 0;
    const parts: string[] = [];
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
    if (rot !== 0) parts.push(`rotate(${rot}deg)`);
    el.style.transform = parts.join(' ');
  }
}

function parsePadding(val: number | [number, number] | [number, number, number, number]): string {
  if (typeof val === 'number') return `${val}px`;
  if (Array.isArray(val)) {
    if (val.length === 2) return `${val[0]}px ${val[1]}px`;
    if (val.length === 4) return `${val[0]}px ${val[1]}px ${val[2]}px ${val[3]}px`;
  }
  return '0px';
}
