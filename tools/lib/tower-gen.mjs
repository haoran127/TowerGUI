/**
 * Shared Tower Document generator library.
 * Extracted from json-to-tsx.mjs for reuse in mirror-prefabs.mjs and CLI.
 */

// ── Unity ChildAlignment enum ───────────────────────────────────────────────

export const CHILD_ALIGN = {
  0: { align: 'flex-start', justify: 'flex-start' },
  1: { align: 'center', justify: 'flex-start' },
  2: { align: 'flex-end', justify: 'flex-start' },
  3: { align: 'flex-start', justify: 'center' },
  4: { align: 'center', justify: 'center' },
  5: { align: 'flex-end', justify: 'center' },
  6: { align: 'flex-start', justify: 'flex-end' },
  7: { align: 'center', justify: 'flex-end' },
  8: { align: 'flex-end', justify: 'flex-end' },
};

export function tmpAlignToCSS(hAlign) {
  return { 1: 'left', 2: 'center', 4: 'right', 8: 'left' }[hAlign] || 'left';
}

export function tmpVAlignToCSS(vAlign) {
  return { 256: 'top', 512: 'middle', 1024: 'bottom' }[vAlign] || 'top';
}

export function round(v) {
  return Math.round(v * 10) / 10;
}

export function pctPx(pct, px) {
  if (!Number.isFinite(pct)) pct = 0;
  if (!Number.isFinite(px)) px = 0;
  if (pct === 0) return round(px);
  if (Math.abs(px) < 0.5) return `${round(pct * 100)}%`;
  const rpx = round(px);
  if (rpx === 0) return `${round(pct * 100)}%`;
  if (rpx < 0) return `calc(${round(pct * 100)}% - ${-rpx}px)`;
  return `calc(${round(pct * 100)}% + ${rpx}px)`;
}

// ── RectTransform → absolute position Props ─────────────────────────────────

export function rectToAbsoluteProps(rect) {
  if (!rect) return {};
  const { anchorMin, anchorMax, pos, size, pivot, scale } = rect;
  if (!anchorMin || !anchorMax || !pos || !size || !pivot) return {};

  const [ax, ay] = anchorMin;
  const [bx, by] = anchorMax;
  const [px, py] = pos;
  const [sw, sh] = size;
  const [pvx, pvy] = pivot;

  const offsetMinX = px - pvx * sw;
  const offsetMinY = py - pvy * sh;
  const offsetMaxX = px + (1 - pvx) * sw;
  const offsetMaxY = py + (1 - pvy) * sh;

  const props = { position: 'absolute' };
  const sameX = Math.abs(ax - bx) < 0.001;
  const sameY = Math.abs(ay - by) < 0.001;

  if (sameX) {
    props.width = round(sw);
    const leftPct = ax;
    const leftPx = offsetMinX;
    if (leftPct === 0) props.left = round(leftPx);
    else if (leftPct === 1) props.right = round(-offsetMaxX);
    else props.left = pctPx(leftPct, leftPx);
  } else {
    props.left = pctPx(ax, offsetMinX);
    props.right = pctPx(1 - bx, -offsetMaxX);
  }

  if (sameY) {
    props.height = round(sh);
    const topPct = 1 - by;
    const topPx = -offsetMaxY;
    if (by === 1) props.top = round(topPx);
    else if (by === 0) props.bottom = round(-offsetMinY);
    else props.top = pctPx(topPct, topPx);
  } else {
    props.top = pctPx(1 - by, -offsetMaxY);
    props.bottom = pctPx(ay, offsetMinY);
  }

  if (scale && !(scale[0] === 1 && scale[1] === 1 && scale[2] === 1)) {
    if (scale[0] === 0 && scale[1] === 0) props.visible = false;
    else {
      if (scale[0] !== 1) props.scaleX = round(scale[0]);
      if (scale[1] !== 1) props.scaleY = round(scale[1]);
    }
  }

  if (pvx !== 0.5 || pvy !== 0.5) { props.pivotX = pvx; props.pivotY = pvy; }
  return props;
}

// ── RectTransform → flex child Props ────────────────────────────────────────

export function rectToFlexChildProps(node) {
  const rect = node.rect;
  const props = {};
  if (!rect) return props;
  const [sw, sh] = rect.size || [0, 0];

  const le = getComp(node, 'LayoutElement');
  if (le) {
    if (le.preferredWidth > 0) props.width = round(le.preferredWidth);
    else if (sw > 0) props.width = round(sw);
    if (le.preferredHeight > 0) props.height = round(le.preferredHeight);
    else if (sh > 0) props.height = round(sh);
    if (le.minWidth > 0) props.minWidth = round(le.minWidth);
    if (le.minHeight > 0) props.minHeight = round(le.minHeight);
    if (le.flexibleWidth > 0) props.flexGrow = round(le.flexibleWidth);
    if (le.flexibleHeight > 0) props.flexGrow = round(le.flexibleHeight);
  } else {
    if (sw > 0) props.width = round(sw);
    if (sh > 0) props.height = round(sh);
  }

  const { scale } = rect;
  if (scale && !(scale[0] === 1 && scale[1] === 1 && scale[2] === 1)) {
    if (scale[0] === 0 && scale[1] === 0) props.visible = false;
    else {
      if (scale[0] !== 1) props.scaleX = round(scale[0]);
      if (scale[1] !== 1) props.scaleY = round(scale[1]);
    }
  }
  return props;
}

// ── Node helpers ─────────────────────────────────────────────────────────────

export function getComp(node, type) {
  if (!node.components) return null;
  return node.components.find(c => c.type === type) || null;
}

export function hasComp(node, type) {
  return getComp(node, type) !== null;
}

export function parentHasLayout(node) {
  return hasComp(node, 'HorizontalLayoutGroup') ||
         hasComp(node, 'VerticalLayoutGroup') ||
         hasComp(node, 'LayoutGroup') ||
         hasComp(node, 'GridLayoutGroup');
}

export function childIgnoresLayout(node) {
  const le = getComp(node, 'LayoutElement');
  return le && le.ignoreLayout;
}

export function hasVisualContent(node) {
  if (!node || !node.components) return false;
  return node.components.some(
    c => c.type === 'Image' || c.type === 'RawImage'
      || c.type === 'TMP_Text' || c.type === 'Text'
      || c.type === 'Button' || c.type === 'Toggle'
      || c.type === 'Slider' || c.type === 'InputField'
      || c.type === 'Dropdown' || c.type === 'TMP_Dropdown'
      || c.type === 'Scrollbar'
  );
}

export function isGarbageText(text) {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  if (/^m_\w+/.test(t)) return true;
  if (/^propertyPath:/.test(t)) return true;
  if (/^[a-z_]+\s*:\s*\d+$/.test(t)) return true;
  return false;
}

export function decodeUnicodeEscapes(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function hexColorToShort(color) {
  if (!color) return null;
  if (color.length === 9 && color.endsWith('ff')) return color.substring(0, 7);
  if (color === '#ffffff00') return null;
  return color.substring(0, 7);
}

// ── Shared prop builder ─────────────────────────────────────────────────────

export function buildNodeProps(node, isFlexChild, spriteMap = {}) {
  const props = isFlexChild
    ? rectToFlexChildProps(node)
    : rectToAbsoluteProps(node.rect);

  const imgComp = getComp(node, 'Image');
  const rawImgComp = getComp(node, 'RawImage');
  const img = imgComp || rawImgComp;
  if (img) {
    const color = hexColorToShort(img.color);
    if (color && color !== '#ffffff') props.tint = color;
    if (img.spriteGuid && spriteMap[img.spriteGuid]) {
      props.src = spriteMap[img.spriteGuid];
    } else if (img.spriteGuid) {
      props._spriteGuid = img.spriteGuid;
      if (!color || color === '#ffffff') props.tint = '#d0d0d0';
    }
    if (rawImgComp && rawImgComp.textureGuid) {
      props._textureGuid = rawImgComp.textureGuid;
      props._rawImage = true;
    }
    // Image.Type: 0=Simple, 1=Sliced, 2=Tiled, 3=Filled
    if (img.imageType === 1) props._sliced = true;
    if (img.imageType === 2) props._tiled = true;
    if (img.imageType === 3) props._filled = true;
    if (img.imageType !== undefined && img.imageType !== 0) props._imageType = img.imageType;
    if (img.fillAmount !== undefined && img.fillAmount < 1) props.fillAmount = round(img.fillAmount);
    if (img.fillMethod !== undefined && img.fillMethod !== 4) {
      props.fillMethod = img.fillMethod;
      props._fillMethod = img.fillMethod;
    }
    if (img.fillOrigin !== undefined && img.fillOrigin !== 0) props.fillOrigin = img.fillOrigin;
    if (img.fillClockwise === false) props._fillClockwise = false;
    if (img.preserveAspect) props.preserveAspect = true;
  }

  const outline = getComp(node, 'Outline');
  if (outline) {
    props.textOutline = {};
    if (outline.effectColor) props.textOutline.color = hexColorToShort(outline.effectColor);
    if (outline.effectDistance) props.textOutline.width = round(Math.abs(outline.effectDistance[0] || 1));
  }
  const shadow = getComp(node, 'Shadow');
  if (shadow && !outline) {
    props.textShadow = {};
    if (shadow.effectColor) props.textShadow.color = hexColorToShort(shadow.effectColor);
    if (shadow.effectDistance) {
      props.textShadow.offsetX = round(shadow.effectDistance[0] || 1);
      props.textShadow.offsetY = round(shadow.effectDistance[1] || -1);
    }
  }

  const toggleGroup = getComp(node, 'ToggleGroup');
  if (toggleGroup) {
    props._toggleGroup = true;
    if (toggleGroup.allowSwitchOff) props._toggleGroupAllowOff = true;
  }

  const hlg = getComp(node, 'HorizontalLayoutGroup');
  const vlg = getComp(node, 'VerticalLayoutGroup') || getComp(node, 'LayoutGroup');
  const glg = getComp(node, 'GridLayoutGroup');

  if (hlg) {
    props.flexDirection = 'row';
    if (hlg.spacing) props.gap = round(hlg.spacing);
    const align = CHILD_ALIGN[hlg.childAlignment] || {};
    if (align.align && align.align !== 'flex-start') props.alignItems = align.align;
    if (align.justify && align.justify !== 'flex-start') props.justifyContent = align.justify;
    if (hlg.padding) {
      const p = hlg.padding;
      const pt = Math.max(0, p.top || 0), pr = Math.max(0, p.right || 0);
      const pb = Math.max(0, p.bottom || 0), pl = Math.max(0, p.left || 0);
      if (pt || pr || pb || pl) props.padding = [pt, pr, pb, pl];
    }
  }

  if (vlg) {
    props.flexDirection = 'column';
    if (vlg.spacing) props.gap = round(vlg.spacing);
    const align = CHILD_ALIGN[vlg.childAlignment] || {};
    if (align.align && align.align !== 'flex-start') props.alignItems = align.align;
    if (align.justify && align.justify !== 'flex-start') props.justifyContent = align.justify;
    if (vlg.padding) {
      const p = vlg.padding;
      const pt = Math.max(0, p.top || 0), pr = Math.max(0, p.right || 0);
      const pb = Math.max(0, p.bottom || 0), pl = Math.max(0, p.left || 0);
      if (pt || pr || pb || pl) props.padding = [pt, pr, pb, pl];
    }
  }

  if (glg) {
    props.flexDirection = 'row';
    props.flexWrap = 'wrap';
    if (glg.spacing) {
      if (glg.spacing.x) props.columnGap = round(glg.spacing.x);
      if (glg.spacing.y) props.rowGap = round(glg.spacing.y);
    }
    if (glg.cellSize) {
      props._gridCellWidth = round(glg.cellSize.x || 0);
      props._gridCellHeight = round(glg.cellSize.y || 0);
    }
    if (glg.constraint === 1 && glg.constraintCount > 0) {
      props._gridConstraint = 'column';
      props._gridConstraintCount = glg.constraintCount;
    } else if (glg.constraint === 2 && glg.constraintCount > 0) {
      props._gridConstraint = 'row';
      props._gridConstraintCount = glg.constraintCount;
    }
  }

  const csf = getComp(node, 'ContentSizeFitter');
  if (csf) {
    if (csf.horizontalFit === 1) props._csfHorizontal = 'min';
    else if (csf.horizontalFit === 2) { props._csfHorizontal = 'preferred'; props.width = undefined; }
    if (csf.verticalFit === 1) props._csfVertical = 'min';
    else if (csf.verticalFit === 2) { props._csfVertical = 'preferred'; props.height = undefined; }
  }

  const arf = getComp(node, 'AspectRatioFitter');
  if (arf) {
    props._aspectMode = arf.aspectMode ?? 0;
    if (arf.aspectRatio) props._aspectRatio = round(arf.aspectRatio);
  }

  const cg = getComp(node, 'CanvasGroup');
  if (cg) {
    if (cg.alpha !== undefined && cg.alpha < 1) props.opacity = round(cg.alpha);
    if (cg.interactable === false) props._canvasGroupInteractable = false;
    if (cg.blocksRaycasts === false) props._canvasGroupBlocksRaycasts = false;
  }

  // LayoutElement
  const layoutElem = getComp(node, 'LayoutElement');
  if (layoutElem) {
    const le = {};
    if (layoutElem.ignoreLayout) le.ignoreLayout = true;
    if (layoutElem.minWidth >= 0) le.minWidth = round(layoutElem.minWidth);
    if (layoutElem.minHeight >= 0) le.minHeight = round(layoutElem.minHeight);
    if (layoutElem.preferredWidth >= 0) le.preferredWidth = round(layoutElem.preferredWidth);
    if (layoutElem.preferredHeight >= 0) le.preferredHeight = round(layoutElem.preferredHeight);
    if (layoutElem.flexibleWidth >= 0) le.flexibleWidth = round(layoutElem.flexibleWidth);
    if (layoutElem.flexibleHeight >= 0) le.flexibleHeight = round(layoutElem.flexibleHeight);
    if (Object.keys(le).length > 0) props._layoutElement = le;
  }

  // Shadow/Outline as internal props for compiler reconstruction
  const outlineComp = getComp(node, 'Outline');
  if (outlineComp) {
    props._outline = {
      color: outlineComp.effectColor || '#000000ff',
      distanceX: outlineComp.effectDistance ? round(outlineComp.effectDistance[0]) : 1,
      distanceY: outlineComp.effectDistance ? round(outlineComp.effectDistance[1]) : -1,
    };
  }
  const shadowComp = getComp(node, 'Shadow');
  if (shadowComp && !outlineComp) {
    props._shadow = {
      color: shadowComp.effectColor || '#000000ff',
      distanceX: shadowComp.effectDistance ? round(shadowComp.effectDistance[0]) : 1,
      distanceY: shadowComp.effectDistance ? round(shadowComp.effectDistance[1]) : -1,
    };
  }

  const imageMask = getComp(node, 'Mask');
  const rectMask = getComp(node, 'RectMask2D');
  if (imageMask) {
    props.overflow = 'hidden';
    props._maskImage = true;
    if (imageMask.showMaskGraphic === false) props._maskShowGraphic = false;
  } else if (rectMask) {
    props.overflow = 'hidden';
  }

  return props;
}

// ── cleanProps ──────────────────────────────────────────────────────────────

const PRESERVED_INTERNAL = new Set([
  '_scripts', '_sliced', '_tiled', '_filled', '_spriteGuid', '_textureGuid',
  '_gridCellWidth', '_gridCellHeight', '_gridConstraint', '_gridConstraintCount',
  '_csfHorizontal', '_csfVertical', '_aspectMode', '_aspectRatio',
  '_rawImage', '_material', '_materialParams', '_maskImage', '_maskShowGraphic', '_renderTarget',
  '_transition', '_normalColor', '_highlightedColor', '_pressedColor', '_selectedColor', '_disabledColor',
  '_colorMultiplier', '_fadeDuration',
  '_highlightedSprite', '_pressedSprite', '_selectedSprite', '_disabledSprite',
  '_animTriggers',
  '_imageType', '_fillMethod', '_fillClockwise',
  '_shadow', '_outline',
  '_canvasGroupInteractable', '_canvasGroupBlocksRaycasts',
  '_layoutElement',
  '_textOverflow', '_fontAssetGuid',
]);

export function cleanProps(props) {
  if (!props) return undefined;
  const result = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('_') && !PRESERVED_INTERNAL.has(k)) continue;
    if (v !== undefined && v !== null) result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ── Tower Document Generator ────────────────────────────────────────────────

export class TowerGenerator {
  constructor(tree, spriteMap = {}) {
    this.tree = tree;
    this.spriteMap = spriteMap;
    this.sprites = {};
  }

  generate() {
    const root = this.buildNode(this.tree, false, true);
    const [dw, dh] = this.inferDesignSize();

    const doc = {
      $schema: 'tower-ui',
      version: '1.0',
      meta: {
        name: this.tree.name || 'Untitled',
        designWidth: round(dw),
        designHeight: round(dh),
        source: `prefab:${this.tree.name}`,
      },
      root: root || { type: 'ui-view', props: { width: round(dw), height: round(dh) } },
    };

    if (doc.root) {
      if (!doc.root.props) doc.root.props = {};
      if (!doc.root.props.width || doc.root.props.width === 0) doc.root.props.width = round(dw);
      if (!doc.root.props.height || doc.root.props.height === 0) doc.root.props.height = round(dh);
    }

    if (Object.keys(this.sprites).length > 0) {
      doc.assets = { sprites: this.sprites };
    }

    const animations = this._collectAnimators(this.tree);
    if (animations.length > 0) {
      doc.meta.animations = animations;
    }

    return doc;
  }

  inferDesignSize() {
    const rect = this.tree.rect;
    if (rect?.size) {
      const [w, h] = rect.size;
      if (w > 0 && h > 0) return [w, h];
    }
    if (hasComp(this.tree, 'Canvas')) return [1080, 1920];
    if (this.tree.children) {
      for (const child of this.tree.children) {
        if (!child.active) continue;
        const r = child.rect;
        if (r?.size && r.size[0] > 0 && r.size[1] > 0) return r.size;
      }
    }
    return [1080, 1920];
  }

  buildNode(node, insideLayout, isRoot = false) {
    if (!node) return null;

    const isInactive = !node.active;
    const children = node.children || [];
    const hasVisualComponent = node.components && node.components.some(
      c => c.type === 'Image' || c.type === 'RawImage' || c.type === 'TMP_Text' || c.type === 'Text'
        || c.type === 'Button' || c.type === 'Toggle' || c.type === 'Slider' || c.type === 'InputField'
    );
    const allChildren = children.filter(c => c.active || hasVisualContent(c) || (c.children && c.children.length > 0));
    if (isInactive && allChildren.length === 0 && !hasVisualComponent) return null;
    const activeChildren = allChildren;

    const isFlexChild = insideLayout && !childIgnoresLayout(node);
    const props = isRoot ? this._buildRootProps(node) : buildNodeProps(node, isFlexChild, this.spriteMap);
    if (isInactive) props.visible = false;

    if (hasComp(node, 'Canvas') && props.visible === false) delete props.visible;

    const text = getComp(node, 'TMP_Text') || getComp(node, 'Text');
    const img = getComp(node, 'Image') || getComp(node, 'RawImage');
    const scroll = getComp(node, 'ScrollRect');
    const thisHasLayout = parentHasLayout(node);

    if (props.src) {
      const key = props.src.replace(/\.\w+$/, '').split('/').pop();
      if (!this.sprites[key]) this.sprites[key] = { path: props.src };
    }

    const btn = getComp(node, 'Button');
    const toggle = getComp(node, 'Toggle');
    const slider = getComp(node, 'Slider');
    const dropdown = getComp(node, 'Dropdown') || getComp(node, 'TMP_Dropdown');
    const inputField = getComp(node, 'InputField') || getComp(node, 'TMP_InputField');

    if (text && activeChildren.length === 0) return this._buildTextNode(node, text, props);

    if (inputField) {
      if (inputField.text) props.value = inputField.text;
      if (inputField.characterLimit > 0) props.maxLength = inputField.characterLimit;
      if (inputField.contentType === 7) props.password = true;
      props.name = props.name || node.name;
      return { type: 'ui-input', props: cleanProps(props) };
    }

    if (slider) {
      props.min = slider.minValue ?? 0;
      props.max = slider.maxValue ?? 1;
      props.value = slider.value ?? 0;
      props.name = props.name || node.name;
      return { type: 'ui-slider', props: cleanProps(props) };
    }

    if (toggle) {
      props.checked = toggle.isOn || false;
      props.name = props.name || node.name;
      return { type: 'ui-toggle', props: cleanProps(props) };
    }

    if (dropdown) {
      props.name = props.name || node.name;
      if (dropdown.value !== undefined) props.value = dropdown.value;
      if (dropdown.interactable === false) props.disabled = true;
      if (dropdown.options && dropdown.options.length > 0) props.options = dropdown.options;
      return { type: 'ui-dropdown', props: cleanProps(props) };
    }

    if (btn) {
      let btnText = text;
      if (!btnText) {
        btnText = this._findDescendantText(node, 2);
      }
      if (btnText) {
        const raw = decodeUnicodeEscapes(btnText.text || '');
        if (!isGarbageText(raw)) props.text = raw;
        if (btnText.fontSize) props.fontSize = btnText.fontSize;
      }
      if (btn.interactable === false) props.disabled = true;
      props.name = props.name || node.name;

      // Button transition mode: 0=None, 1=ColorTint, 2=SpriteSwap, 3=Animation
      if (btn.transition !== undefined && btn.transition !== 1) props._transition = btn.transition;
      if (btn.transition === 1 || btn.transition === undefined) {
        // ColorTint - only store non-default colors
        if (btn.normalColor && btn.normalColor !== '#ffffffff') props._normalColor = btn.normalColor;
        if (btn.highlightedColor && btn.highlightedColor !== '#f5f5f5ff') props._highlightedColor = btn.highlightedColor;
        if (btn.pressedColor && btn.pressedColor !== '#c8c8c8ff') props._pressedColor = btn.pressedColor;
        if (btn.selectedColor) props._selectedColor = btn.selectedColor;
        if (btn.disabledColor && btn.disabledColor !== '#c8c8c880') props._disabledColor = btn.disabledColor;
        if (btn.fadeDuration && btn.fadeDuration !== 0.1) props._fadeDuration = btn.fadeDuration;
      }
      if (btn.transition === 2) {
        if (btn.highlightedSprite) props._highlightedSprite = btn.highlightedSprite;
        if (btn.pressedSprite) props._pressedSprite = btn.pressedSprite;
        if (btn.selectedSprite) props._selectedSprite = btn.selectedSprite;
        if (btn.disabledSprite) props._disabledSprite = btn.disabledSprite;
      }
      if (btn.transition === 3 && btn.animTriggers) {
        props._animTriggers = btn.animTriggers;
      }

      const childNodes = activeChildren.map(c => this.buildNode(c, thisHasLayout)).filter(Boolean);
      return { type: 'ui-button', props: cleanProps(props), children: childNodes.length > 0 ? childNodes : undefined };
    }

    if (scroll) {
      if (scroll.horizontal) props.horizontal = true;
      if (scroll.vertical !== false) props.vertical = true;
      const childNodes = activeChildren.map(c => this.buildNode(c, thisHasLayout)).filter(Boolean);
      return { type: 'ui-scroll', props: cleanProps(props), children: childNodes.length > 0 ? childNodes : undefined };
    }

    const monoBehaviours = node.components
      ? node.components.filter(c => c.type === 'MonoBehaviour' && (c.scriptGuid || c.fields))
      : [];
    if (monoBehaviours.length > 0) {
      props._scripts = monoBehaviours.map(mb => {
        const entry = { guid: mb.scriptGuid };
        if (mb.fields) entry.fields = mb.fields;
        return entry;
      });
    }

    const isLeafImage = activeChildren.length === 0 && !text && img && (props.src || props._spriteGuid || props._rawImage);
    const type = isLeafImage ? 'ui-image' : 'ui-view';
    const childNodes = activeChildren.map(c => this.buildNode(c, thisHasLayout)).filter(Boolean);

    if (text && activeChildren.length > 0) {
      const rawText = decodeUnicodeEscapes(text.text || '');
      if (!isGarbageText(rawText)) {
        const textProps = {};
        if (text.fontSize) textProps.fontSize = text.fontSize;
        const clr = hexColorToShort(text.color);
        if (clr && clr !== '#ffffff') textProps.color = clr;
        textProps.text = rawText;
        childNodes.unshift({ type: 'ui-text', props: textProps });
      }
    }

    return { type, props: cleanProps(props), children: childNodes.length > 0 ? childNodes : undefined };
  }

  _buildRootProps(node) {
    const rect = node.rect;
    const props = {};
    if (rect?.size) {
      const [w, h] = rect.size;
      if (w > 0) props.width = round(w);
      if (h > 0) props.height = round(h);
    }
    const img = getComp(node, 'Image') || getComp(node, 'RawImage');
    if (img) {
      const color = hexColorToShort(img.color);
      if (color && color !== '#ffffff') props.tint = color;
      if (img.spriteGuid && this.spriteMap[img.spriteGuid]) {
        props.src = this.spriteMap[img.spriteGuid];
      } else if (img.spriteGuid) {
        props._spriteGuid = img.spriteGuid;
        if (!color || color === '#ffffff') props.tint = '#d0d0d0';
      }
    }
    const cg = getComp(node, 'CanvasGroup');
    if (cg && cg.alpha !== undefined && cg.alpha < 1) props.opacity = round(cg.alpha);
    const mask = getComp(node, 'Mask') || getComp(node, 'RectMask2D');
    if (mask) props.overflow = 'hidden';
    return props;
  }

  _buildTextNode(node, text, baseProps) {
    let rawText = decodeUnicodeEscapes(text.text || '');
    if (rawText.startsWith('"') && rawText.endsWith('"')) rawText = rawText.slice(1, -1);
    if (isGarbageText(rawText)) return null;

    const props = { ...baseProps };
    if (text.fontSize) props.fontSize = text.fontSize;
    const color = hexColorToShort(text.color);
    if (color && color !== '#ffffff') props.color = color;
    const fontStyle = text.fontStyle || 0;
    if (fontStyle & 1) props.bold = true;
    if (fontStyle & 2) props.italic = true;
    if (text.hAlign) {
      const align = tmpAlignToCSS(text.hAlign);
      if (align !== 'left') props.align = align;
    }
    // Vertical alignment
    if (text.vAlign) {
      const va = tmpVAlignToCSS(text.vAlign);
      if (va !== 'top') props.verticalAlign = va;
    }
    // Text wrapping & overflow
    if (text.wordWrap === false) props.wordWrap = false;
    if (text.overflow && text.overflow !== 0) props._textOverflow = text.overflow;
    if (text.lineSpacing && text.lineSpacing !== 0) props.lineSpacing = text.lineSpacing;
    // Auto-size
    if (text.autoSize) {
      props.autoSize = true;
      if (text.fontSizeMin) props.fontSizeMin = text.fontSizeMin;
      if (text.fontSizeMax) props.fontSizeMax = text.fontSizeMax;
    }
    // RichText (default true, only record if false)
    if (text.richText === false) props.richText = false;
    // Font asset reference
    if (text.fontAssetGuid) props._fontAssetGuid = text.fontAssetGuid;
    // Max lines
    if (text.maxLines && text.maxLines > 0) props.maxLines = text.maxLines;

    props.text = rawText;
    return { type: 'ui-text', props: cleanProps(props) };
  }

  _findDescendantText(node, maxDepth) {
    if (maxDepth <= 0) return null;
    for (const child of (node.children || [])) {
      const ct = child.components
        ? child.components.find(c => c.type === 'TMP_Text' || c.type === 'Text')
        : null;
      if (ct && ct.text && ct.text.trim()) return ct;
      const deeper = this._findDescendantText(child, maxDepth - 1);
      if (deeper) return deeper;
    }
    return null;
  }

  _collectAnimators(node, results = []) {
    if (!node) return results;
    const anim = getComp(node, 'Animator');
    if (anim) {
      results.push({
        node: node.name,
        controllerGuid: anim.controllerGuid || null,
        enabled: anim.enabled !== false,
      });
    }
    if (node.children) {
      for (const child of node.children) {
        this._collectAnimators(child, results);
      }
    }
    return results;
  }
}
