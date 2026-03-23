import React, { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import { useEditor, getNodeAtPathPublic, type UINode } from './state';

function unityRichTextToHtml(text: string): string {
  // 1. Resolve literal escape sequences (from Unity YAML: \n \r \t stored as-is)
  let s = text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');

  // 2. HTML-escape everything first
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 3. Restore supported Unity rich text tags → HTML
  // Basic formatting
  s = s
    .replace(/&lt;b&gt;/gi, '<b>').replace(/&lt;\/b&gt;/gi, '</b>')
    .replace(/&lt;i&gt;/gi, '<i>').replace(/&lt;\/i&gt;/gi, '</i>')
    .replace(/&lt;u&gt;/gi, '<u>').replace(/&lt;\/u&gt;/gi, '</u>')
    .replace(/&lt;s&gt;/gi, '<s>').replace(/&lt;\/s&gt;/gi, '</s>')
    .replace(/&lt;sub&gt;/gi, '<sub>').replace(/&lt;\/sub&gt;/gi, '</sub>')
    .replace(/&lt;sup&gt;/gi, '<sup>').replace(/&lt;\/sup&gt;/gi, '</sup>');
  // <color=#HEX> or <color=name>
  s = s
    .replace(/&lt;color=(#?[a-zA-Z0-9]+)&gt;/gi, '<span style="color:$1">')
    .replace(/&lt;\/color&gt;/gi, '</span>');
  // <size=N>
  s = s
    .replace(/&lt;size=(\d+)&gt;/gi, '<span style="font-size:$1px">')
    .replace(/&lt;\/size&gt;/gi, '</span>');
  // <alpha=#AA>
  s = s.replace(/&lt;alpha=(#?[0-9a-fA-F]+)&gt;/gi, (_m, a) => {
    const opacity = parseInt(a.replace('#', ''), 16) / 255;
    return `<span style="opacity:${opacity.toFixed(2)}">`;
  });
  // <mark=#RRGGBBAA>
  s = s
    .replace(/&lt;mark=(#?[0-9a-fA-F]+)&gt;/gi, '<mark style="background:$1">')
    .replace(/&lt;\/mark&gt;/gi, '</mark>');
  // <cspace=N> (character spacing)
  s = s
    .replace(/&lt;cspace=([\d.]+)&gt;/gi, '<span style="letter-spacing:$1px">')
    .replace(/&lt;\/cspace&gt;/gi, '</span>');
  // <line-height=N>
  s = s
    .replace(/&lt;line-height=([\d.]+)&gt;/gi, '<span style="line-height:$1px">')
    .replace(/&lt;\/line-height&gt;/gi, '</span>');

  // 4. Strip remaining unknown Unity tags (e.g. <material>, <quad>, <sprite>, <link>, <noparse>, <nobr>, etc.)
  s = s.replace(/&lt;\/?[a-zA-Z][a-zA-Z0-9-]*(?:=[^&]*)?\/?&gt;/g, '');

  // 5. Newlines → <br/>, tabs → spaces
  s = s.replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>').replace(/\r/g, '<br/>');
  s = s.replace(/\t/g, '&emsp;');

  return s;
}

function sanitizeCssVal(v: unknown): string | number | undefined {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return undefined;
    return v;
  }
  if (typeof v === 'string') {
    if (v.includes('NaN') || v.includes('Infinity') || v.includes('undefined')) return undefined;
    return v;
  }
  return undefined;
}

function findNodePath(el: HTMLElement, container: HTMLElement): string | null {
  let current: HTMLElement | null = el;
  while (current && current !== container) {
    const path = current.getAttribute('data-node-path');
    if (path) return path;
    current = current.parentElement;
  }
  if (el === container) {
    return container.getAttribute('data-node-path') || null;
  }
  return null;
}

type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

interface DragInfo {
  type: 'move' | 'resize';
  dir?: ResizeDir;
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  origWidth: number;
  origHeight: number;
}

function VisualOverlay({
  selectedRect,
  multiRects,
  hoverRect,
  guides,
  dragging,
  zoom,
  onResizeStart,
}: {
  selectedRect: DOMRect | null;
  multiRects: DOMRect[];
  hoverRect: DOMRect | null;
  guides: { type: 'h' | 'v'; pos: number }[];
  dragging: boolean;
  zoom: number;
  onResizeStart: (dir: ResizeDir, e: React.MouseEvent) => void;
}) {
  const inv = 1 / zoom;
  const handleSize = Math.max(8, 10 * inv);
  const borderW = Math.max(1.5, 2 * inv);

  return (
    <div className="canvas-overlay">
      {hoverRect && !dragging && (
        <div className="hover-outline" style={{
          left: hoverRect.x, top: hoverRect.y,
          width: hoverRect.width, height: hoverRect.height,
          borderWidth: Math.max(1, inv),
        }} />
      )}
      {multiRects.map((r, i) => (
        <div key={`multi-${i}`} className="multi-outline" style={{
          left: r.x, top: r.y, width: r.width, height: r.height,
          borderWidth: borderW,
        }} />
      ))}
      {selectedRect && (
        <>
          <div className="selected-outline" style={{
            left: selectedRect.x, top: selectedRect.y,
            width: selectedRect.width, height: selectedRect.height,
            borderWidth: borderW,
          }}>
            <div className="size-label" style={{ transform: `translateX(-50%) scale(${inv})`, transformOrigin: 'center top' }}>
              {Math.round(selectedRect.width)} &times; {Math.round(selectedRect.height)}
            </div>
          </div>
          {/* 8-direction resize handles */}
          {(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as ResizeDir[]).map(dir => {
            const sx = selectedRect.x, sy = selectedRect.y;
            const sw = selectedRect.width, sh = selectedRect.height;
            const hs = handleSize;
            let left = sx, top = sy, w = hs, h = hs, cursor = 'default';
            if (dir === 'n')  { left = sx + sw/2 - hs; top = sy - hs/2; w = hs*2; cursor = 'ns-resize'; }
            if (dir === 'ne') { left = sx + sw - hs/2; top = sy - hs/2; cursor = 'nesw-resize'; }
            if (dir === 'e')  { left = sx + sw - hs/2; top = sy + sh/2 - hs; h = hs*2; cursor = 'ew-resize'; }
            if (dir === 'se') { left = sx + sw - hs/2; top = sy + sh - hs/2; cursor = 'nwse-resize'; }
            if (dir === 's')  { left = sx + sw/2 - hs; top = sy + sh - hs/2; w = hs*2; cursor = 'ns-resize'; }
            if (dir === 'sw') { left = sx - hs/2; top = sy + sh - hs/2; cursor = 'nesw-resize'; }
            if (dir === 'w')  { left = sx - hs/2; top = sy + sh/2 - hs; h = hs*2; cursor = 'ew-resize'; }
            if (dir === 'nw') { left = sx - hs/2; top = sy - hs/2; cursor = 'nwse-resize'; }
            return (
              <div
                key={dir}
                className={`resize-handle resize-handle-${dir}`}
                style={{ left, top, width: w, height: h, cursor }}
                onMouseDown={(e) => onResizeStart(dir, e)}
              />
            );
          })}
        </>
      )}
      {guides.map((g, i) => (
        g.type === 'h'
          ? <div key={i} className="align-guide align-guide-h" style={{ top: g.pos, height: Math.max(1, inv) }} />
          : <div key={i} className="align-guide align-guide-v" style={{ left: g.pos, width: Math.max(1, inv) }} />
      ))}
    </div>
  );
}

function renderUINode(node: UINode | string, path: string, components?: Record<string, UINode>, key?: number): React.ReactNode {
  if (typeof node === 'string') return node;

  let resolved = node;
  if (node.type === '$ref' && (node as any).ref && components) {
    const def = components[(node as any).ref];
    if (def) {
      resolved = {
        type: def.type,
        props: { ...def.props, ...node.props },
        children: node.children && node.children.length > 0 ? node.children : def.children,
      };
    }
  }

  const { type, props: rawProps, children } = resolved;
  const style: React.CSSProperties = {};
  const dataAttrs: Record<string, string> = { 'data-node-path': path, 'data-type': type };

  const p = rawProps || {};

  if (p.position === 'absolute') style.position = 'absolute';
  else style.position = 'relative';

  if (p.left !== undefined) style.left = sanitizeCssVal(p.left);
  if (p.top !== undefined) style.top = sanitizeCssVal(p.top);
  if (p.right !== undefined) style.right = sanitizeCssVal(p.right);
  if (p.bottom !== undefined) style.bottom = sanitizeCssVal(p.bottom);
  if (p.width !== undefined) style.width = sanitizeCssVal(p.width);
  if (p.height !== undefined) style.height = sanitizeCssVal(p.height);
  if (p.minWidth !== undefined) style.minWidth = p.minWidth;
  if (p.minHeight !== undefined) style.minHeight = p.minHeight;
  if (p.maxWidth !== undefined) style.maxWidth = p.maxWidth;
  if (p.maxHeight !== undefined) style.maxHeight = p.maxHeight;

  if (p.flexDirection) style.flexDirection = p.flexDirection;
  if (p.justifyContent) style.justifyContent = p.justifyContent;
  if (p.alignItems) style.alignItems = p.alignItems;
  if (p.alignSelf) style.alignSelf = p.alignSelf as any;
  if (p.flex !== undefined) style.flex = p.flex;
  if (p.flexGrow !== undefined) style.flexGrow = p.flexGrow;
  if (p.flexShrink !== undefined) style.flexShrink = p.flexShrink;
  if (p.gap !== undefined) style.gap = p.gap;
  if (p.overflow) style.overflow = p.overflow;

  // Padding
  if (p.padding) {
    if (Array.isArray(p.padding)) {
      style.padding = p.padding.map((v: number) => v + 'px').join(' ');
    } else {
      style.padding = p.padding;
    }
  }
  if (p.paddingTop !== undefined) style.paddingTop = p.paddingTop;
  if (p.paddingRight !== undefined) style.paddingRight = p.paddingRight;
  if (p.paddingBottom !== undefined) style.paddingBottom = p.paddingBottom;
  if (p.paddingLeft !== undefined) style.paddingLeft = p.paddingLeft;

  // Margin
  if (p.margin !== undefined) style.margin = p.margin;
  if (p.marginTop !== undefined) style.marginTop = p.marginTop;
  if (p.marginRight !== undefined) style.marginRight = p.marginRight;
  if (p.marginBottom !== undefined) style.marginBottom = p.marginBottom;
  if (p.marginLeft !== undefined) style.marginLeft = p.marginLeft;

  // Background
  if (p.backgroundColor) style.backgroundColor = p.backgroundColor;
  if (p.backgroundImage) style.backgroundImage = `url(${p.backgroundImage})`;
  if (p.backgroundSize) style.backgroundSize = p.backgroundSize;
  if (p.backgroundPosition) style.backgroundPosition = p.backgroundPosition;
  if (p.backgroundRepeat) style.backgroundRepeat = p.backgroundRepeat;

  // Border
  if (p.borderWidth !== undefined) style.borderWidth = p.borderWidth;
  if (p.borderColor) style.borderColor = p.borderColor;
  if (p.borderStyle) style.borderStyle = p.borderStyle;
  if (p.borderWidth !== undefined && !p.borderStyle) style.borderStyle = 'solid';
  if (p.borderRadius !== undefined) style.borderRadius = p.borderRadius;
  if (p.borderTopWidth !== undefined) style.borderTopWidth = p.borderTopWidth;
  if (p.borderRightWidth !== undefined) style.borderRightWidth = p.borderRightWidth;
  if (p.borderBottomWidth !== undefined) style.borderBottomWidth = p.borderBottomWidth;
  if (p.borderLeftWidth !== undefined) style.borderLeftWidth = p.borderLeftWidth;

  // Effects
  if (p.opacity !== undefined) style.opacity = p.opacity;
  if (p.visible === false) { style.opacity = 0.3; style.outline = '1px dashed #555'; }
  if (p.zIndex !== undefined) style.zIndex = p.zIndex;
  if (p.boxShadow) style.boxShadow = p.boxShadow;
  if (p.backdropFilter) (style as any).backdropFilter = p.backdropFilter;

  // Cursor / pointer
  if (p.cursor) style.cursor = p.cursor;
  if (p.pointerEvents) style.pointerEvents = p.pointerEvents as any;

  // Transform
  if (p.scaleX !== undefined || p.scaleY !== undefined || p.rotation !== undefined) {
    const transforms: string[] = [];
    if (p.scaleX !== undefined || p.scaleY !== undefined) {
      transforms.push(`scale(${p.scaleX ?? 1}, ${p.scaleY ?? 1})`);
    }
    if (p.rotation) transforms.push(`rotate(${p.rotation}deg)`);
    style.transform = transforms.join(' ');
  }

  // Flex wrap
  if (p.flexWrap) style.flexWrap = p.flexWrap as any;

  if (type === 'ui-view') {
    style.display = 'flex';
    if (!p.flexDirection) style.flexDirection = 'column';
    if (!p.overflow) style.overflow = 'visible';
    if (p.tint && !p.backgroundColor) style.backgroundColor = p.tint;
    if (path === 'root') {
      if (!p.tint && !p.backgroundColor) style.backgroundColor = 'var(--root-bg)';
    } else {
      if (!p.tint && !p.backgroundColor) style.backgroundColor = 'transparent';
    }
    const childElements = children?.map((child, i) => renderUINode(child as UINode, `${path}.${i}`, components, i));
    return <div key={key} style={style} {...dataAttrs}>{childElements}</div>;
  }

  if (type === 'ui-text') {
    style.color = p.color || '#ffffff';
    if (p.fontSize) style.fontSize = p.fontSize;
    if (p.fontFamily) style.fontFamily = p.fontFamily;
    else style.fontFamily = 'system-ui, sans-serif';
    if (p.fontWeight) style.fontWeight = p.fontWeight;
    else if (p.bold) style.fontWeight = 'bold';
    if (p.italic) style.fontStyle = 'italic';
    if (p.align) style.textAlign = p.align;
    if (p.verticalAlign) {
      style.display = 'flex';
      style.alignItems = p.verticalAlign === 'middle' ? 'center' : p.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
      style.justifyContent = p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start';
    }
    if (p.lineHeight) style.lineHeight = typeof p.lineHeight === 'number' ? `${p.lineHeight}px` : p.lineHeight;
    if (p.letterSpacing) style.letterSpacing = p.letterSpacing;
    if (p.textDecoration) style.textDecoration = p.textDecoration;
    if (p.textShadow) style.textShadow = p.textShadow;
    if (p.textOutline) {
      const outColor = p.textOutline.color || '#000';
      const outW = p.textOutline.width || 1;
      (style as any).WebkitTextStroke = `${outW}px ${outColor}`;
    }
    style.whiteSpace = 'pre-wrap';
    style.wordBreak = 'break-word';
    style.overflow = 'visible';
    const html = unityRichTextToHtml(p.text || '');
    return <div key={key} style={style} {...dataAttrs} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (type === 'ui-image') {
    const hasSrc = !!p.src;
    const hasSlice = p.sliceLeft || p.sliceTop || p.sliceRight || p.sliceBottom;

    if (hasSrc && hasSlice) {
      // 9-slice rendering via border-image
      const sl = p.sliceTop || 0;
      const sr = p.sliceRight || 0;
      const sb = p.sliceBottom || 0;
      const sll = p.sliceLeft || 0;
      style.borderImage = `url(${p.src}) ${sl} ${sr} ${sb} ${sll} fill stretch`;
      style.borderImageWidth = `${sl}px ${sr}px ${sb}px ${sll}px`;
      style.borderStyle = 'solid';
      style.borderColor = 'transparent';
      if (p.tint) style.backgroundColor = p.tint;
    } else if (hasSrc) {
      style.backgroundImage = `url(${p.src})`;
      style.backgroundSize = p.objectFit || p.backgroundSize || '100% 100%';
      style.backgroundPosition = p.backgroundPosition || 'center';
      style.backgroundRepeat = 'no-repeat';
      if (p.tint) {
        style.backgroundColor = p.tint;
        (style as any).backgroundBlendMode = 'multiply';
      }
    } else {
      if (p.tint) style.backgroundColor = p.tint;
      else if (p.backgroundColor) style.backgroundColor = p.backgroundColor;
      else style.backgroundColor = '#2a2a3a';
      if (!p.borderWidth && !p.borderStyle) style.border = '2px dashed #555';
    }

    style.display = 'flex';
    style.alignItems = 'center';
    style.justifyContent = 'center';
    style.overflow = 'visible';
    const fillAmount = typeof p.fillAmount === 'number' ? p.fillAmount : 1;
    if (fillAmount < 1) {
      style.clipPath = `inset(0 ${((1 - fillAmount) * 100).toFixed(1)}% 0 0)`;
    }
    const hasChildren = children && children.length > 0;
    const childElements = children?.map((child, i) => renderUINode(child as UINode, `${path}.${i}`, components, i));
    return (
      <div key={key} style={style} {...dataAttrs}>
        {!hasSrc && !hasChildren && <span style={{ fontSize: 16, color: '#666' }}>🖼 image</span>}
        {childElements}
      </div>
    );
  }

  if (type === 'ui-button') {
    style.display = 'flex';
    style.alignItems = 'center';
    style.justifyContent = 'center';
    if (!p.backgroundColor && !p.tint) style.backgroundColor = '#2a5298';
    if (p.tint && !p.backgroundColor) style.backgroundColor = p.tint;
    if (!p.borderWidth && !p.borderStyle) style.border = '1px solid #4a7ac7';
    if (!p.borderRadius) style.borderRadius = '4px';
    style.color = p.color || '#fff';
    style.fontSize = p.fontSize || 14;
    if (!p.cursor) style.cursor = 'pointer';
    return <div key={key} style={style} {...dataAttrs}>{p.text || 'Button'}</div>;
  }

  if (type === 'ui-input') {
    if (!p.backgroundColor && !p.tint) style.backgroundColor = '#1a1a2e';
    if (p.tint && !p.backgroundColor) style.backgroundColor = p.tint;
    if (!p.borderWidth && !p.borderStyle) style.border = '1px solid #444';
    if (!p.borderRadius) style.borderRadius = '4px';
    style.color = p.color || '#ccc';
    style.fontSize = p.fontSize || 13;
    if (!p.padding && !p.paddingLeft) style.padding = '4px 8px';
    style.display = 'flex';
    style.alignItems = 'center';
    return <div key={key} style={style} {...dataAttrs}>{p.placeholder || p.value || 'input'}</div>;
  }

  if (type === 'ui-scroll') {
    style.overflow = p.overflow || 'auto';
    style.display = 'flex';
    style.flexDirection = p.horizontal ? 'row' : 'column';
    if (!p.borderWidth && !p.borderStyle) style.border = '2px dashed #446';
    if (!p.backgroundColor && !p.tint) style.backgroundColor = 'rgba(255,255,255,0.01)';
    if (p.tint && !p.backgroundColor) style.backgroundColor = p.tint;
    const childElements = children?.map((child, i) => renderUINode(child as UINode, `${path}.${i}`, components, i));
    const isEmpty = !children || children.length === 0;
    return (
      <div key={key} style={style} {...dataAttrs}>
        {isEmpty && <span style={{ fontSize: 14, color: '#555', alignSelf: 'center', marginTop: 8 }}>↕ scroll</span>}
        {childElements}
      </div>
    );
  }

  if (type === 'ui-toggle') {
    const checked = p.checked;
    const trackW = (p.width as number) || 60;
    const trackH = (p.height as number) || 32;
    const knobSize = trackH - 6;
    style.width = trackW;
    style.height = trackH;
    style.borderRadius = trackH / 2;
    style.backgroundColor = checked ? '#4caf50' : '#555';
    style.cursor = 'pointer';
    style.transition = 'background-color 0.2s';
    return (
      <div key={key} style={style} {...dataAttrs}>
        <div style={{
          position: 'absolute',
          left: checked ? trackW - knobSize - 3 : 3,
          top: 3,
          width: knobSize,
          height: knobSize,
          borderRadius: '50%',
          backgroundColor: '#fff',
          transition: 'left 0.2s',
        }} />
      </div>
    );
  }

  if (type === 'ui-slider') {
    const min = (p.min as number) ?? 0;
    const max = (p.max as number) ?? 1;
    const val = (p.value as number) ?? 0;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    const trackH = 6;
    const sliderH = (p.height as number) || 32;
    if (!p.backgroundColor && !p.tint) style.backgroundColor = 'transparent';
    if (p.tint) style.backgroundColor = p.tint;
    return (
      <div key={key} style={style} {...dataAttrs}>
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          top: (sliderH - trackH) / 2,
          height: trackH,
          borderRadius: trackH / 2,
          backgroundColor: '#444',
        }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: trackH / 2,
            backgroundColor: '#4da6ff',
          }} />
        </div>
        <div style={{
          position: 'absolute',
          left: `calc(${pct}% - 8px)`,
          top: (sliderH - 16) / 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: '#fff',
          border: '2px solid #4da6ff',
        }} />
      </div>
    );
  }

  if (type === 'ui-dropdown') {
    if (!p.backgroundColor && !p.tint) style.backgroundColor = '#1a1a2e';
    if (p.tint && !p.backgroundColor) style.backgroundColor = p.tint;
    if (!p.borderWidth && !p.borderStyle) style.border = '1px solid #444';
    if (!p.borderRadius) style.borderRadius = '4px';
    style.color = p.color || '#ccc';
    style.fontSize = p.fontSize || 14;
    style.display = 'flex';
    style.alignItems = 'center';
    style.justifyContent = 'space-between';
    if (!p.padding && !p.paddingLeft) style.padding = '4px 8px';
    const options = (p.options as string[]) || [];
    const selectedIdx = (p.value as number) ?? 0;
    const label = options[selectedIdx] || 'Select...';
    return (
      <div key={key} style={style} {...dataAttrs}>
        <span>{label}</span>
        <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.5 }}>&#9660;</span>
      </div>
    );
  }

  if (type === '$ref') {
    style.display = 'flex';
    style.flexDirection = 'column';
    style.border = '1px dashed #5a8';
    const childElements = children?.map((child, i) => renderUINode(child as UINode, `${path}.${i}`, components, i));
    return (
      <div key={key} style={style} {...dataAttrs}>
        <span style={{ fontSize: 9, color: '#5a8', position: 'absolute', top: 0, left: 0, padding: '1px 3px', background: 'rgba(0,0,0,0.5)' }}>
          ref:{(node as any).ref}
        </span>
        {childElements}
      </div>
    );
  }

  style.display = 'flex';
  style.flexDirection = 'column';
  style.border = '1px dashed #666';
  const childElements = children?.map((child, i) => renderUINode(child as UINode, `${path}.${i}`, components, i));
  return <div key={key} style={style} {...dataAttrs}>{childElements}</div>;
}

export function EditorCanvas() {
  const { state, dispatch } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [userZoom, setUserZoom] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);
  const [multiRects, setMultiRects] = useState<DOMRect[]>([]);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [guides, setGuides] = useState<{ type: 'h' | 'v'; pos: number }[]>([]);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const clipboardRef = useRef<UINode | null>(null);
  const [scopePath, setScopePath] = useState<string | null>(null);

  const { designWidth, designHeight } = state;

  const calcFitZoom = useCallback(() => {
    if (!viewportRef.current) return 0.5;
    const vw = viewportRef.current.clientWidth - 40;
    const vh = viewportRef.current.clientHeight - 40;
    return Math.min(vw / designWidth, vh / designHeight, 1);
  }, [designWidth, designHeight]);

  useLayoutEffect(() => {
    if (!userZoom) setZoom(calcFitZoom());
  }, [designWidth, designHeight, state.document, userZoom, calcFitZoom]);

  // Reset scope when document changes
  useEffect(() => { setScopePath(null); }, [state.document]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(() => {
      if (!userZoom) setZoom(calcFitZoom());
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [userZoom, calcFitZoom]);

  const effectiveZoom = zoom ?? 0.5;

  // Recalculate selection rects (primary + multi)
  const recalcSelected = useCallback(() => {
    if (!containerRef.current) {
      setSelectedRect(null);
      setMultiRects([]);
      return;
    }
    const cr = containerRef.current.getBoundingClientRect();
    const calcRect = (path: string): DOMRect | null => {
      const el = containerRef.current!.querySelector(`[data-node-path="${path}"]`) as HTMLElement;
      if (!el) return null;
      const er = el.getBoundingClientRect();
      return new DOMRect(
        (er.left - cr.left) / effectiveZoom,
        (er.top - cr.top) / effectiveZoom,
        er.width / effectiveZoom,
        er.height / effectiveZoom,
      );
    };

    if (state.selectedPath) {
      setSelectedRect(calcRect(state.selectedPath));
    } else {
      setSelectedRect(null);
    }

    const rects: DOMRect[] = [];
    for (const p of state.selectedPaths) {
      if (p === state.selectedPath) continue;
      const r = calcRect(p);
      if (r) rects.push(r);
    }
    setMultiRects(rects);
  }, [state.selectedPath, state.selectedPaths, state.document, effectiveZoom]);

  useEffect(() => { recalcSelected(); }, [recalcSelected]);

  // Given a deep node path and a scope, find the direct child of scope on that path
  const childPathInScope = useCallback((deepPath: string, scope: string | null): string => {
    const prefix = scope ? scope + '.' : 'root.';
    if (!deepPath.startsWith(prefix) && deepPath !== (scope || 'root')) {
      return deepPath;
    }
    if (deepPath === (scope || 'root')) return deepPath;
    const remainder = deepPath.slice(prefix.length);
    const firstDot = remainder.indexOf('.');
    return prefix + (firstDot >= 0 ? remainder.slice(0, firstDot) : remainder);
  }, []);

  // Click on content to select node at current scope level (Ctrl = multi-select)
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    if (spaceHeld || panning) return;
    if (!containerRef.current) return;
    const target = e.target as HTMLElement;
    const deepPath = findNodePath(target, containerRef.current);
    if (!deepPath) {
      dispatch({ type: 'SELECT_NODE', path: null });
      setScopePath(null);
      return;
    }
    // If clicking outside the current scope, exit scope
    if (scopePath && !deepPath.startsWith(scopePath + '.') && deepPath !== scopePath) {
      setScopePath(null);
    }
    const effectiveScope = (scopePath && (deepPath.startsWith(scopePath + '.') || deepPath === scopePath)) ? scopePath : null;
    const path = childPathInScope(deepPath, effectiveScope);
    dispatch({ type: 'SELECT_NODE', path, multi: e.ctrlKey || e.metaKey });
  }, [dispatch, spaceHeld, panning, scopePath, childPathInScope]);

  // Double-click: enter the selected node and select its child
  const handleContentDoubleClick = useCallback((e: React.MouseEvent) => {
    if (spaceHeld || panning) return;
    if (!containerRef.current || !state.selectedPath) return;
    const target = e.target as HTMLElement;
    const deepPath = findNodePath(target, containerRef.current);
    if (!deepPath) return;
    // Only drill in if the click is within (or on) the selected node
    if (!deepPath.startsWith(state.selectedPath + '.') && deepPath !== state.selectedPath) return;
    if (deepPath === state.selectedPath) {
      // Double-clicked exactly on the selected node with no deeper target — just enter scope
      setScopePath(state.selectedPath);
      return;
    }
    // Enter the selected node as scope and select its direct child
    setScopePath(state.selectedPath);
    const childPath = childPathInScope(deepPath, state.selectedPath);
    dispatch({ type: 'SELECT_NODE', path: childPath });
  }, [dispatch, state.selectedPath, spaceHeld, panning, childPathInScope]);

  // Hover on content to highlight node (scope-aware)
  const handleContentMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragInfo || !containerRef.current) return;
    const target = e.target as HTMLElement;
    const deepPath = findNodePath(target, containerRef.current);
    if (!deepPath) { setHoverRect(null); return; }
    const effectiveScope = (scopePath && (deepPath.startsWith(scopePath + '.') || deepPath === scopePath)) ? scopePath : null;
    const hoverPath = childPathInScope(deepPath, effectiveScope);
    const el = containerRef.current.querySelector(`[data-node-path="${hoverPath}"]`) as HTMLElement;
    if (!el) { setHoverRect(null); return; }
    const cr = containerRef.current.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setHoverRect(new DOMRect(
      (er.left - cr.left) / effectiveZoom,
      (er.top - cr.top) / effectiveZoom,
      er.width / effectiveZoom,
      er.height / effectiveZoom,
    ));
  }, [dragInfo, effectiveZoom, scopePath, childPathInScope]);

  const handleContentMouseLeave = useCallback(() => {
    setHoverRect(null);
  }, []);

  // Drop from ComponentPalette
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/tower-component')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/tower-component');
    if (!raw || !containerRef.current) return;
    e.preventDefault();
    try {
      const { type, defaults, hasChildren } = JSON.parse(raw);
      const target = e.target as HTMLElement;
      const dropPath = findNodePath(target, containerRef.current) || 'root';
      const node: UINode = {
        type,
        props: { ...defaults },
        children: hasChildren ? [] : undefined,
      };
      dispatch({ type: 'ADD_NODE', parentPath: dropPath, node });
    } catch { /* ignore */ }
  }, [dispatch]);

  // Move drag from content mousedown on selected element
  const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
    if (spaceHeld) return;
    if (!state.selectedPath || !state.document || !containerRef.current) return;
    const target = e.target as HTMLElement;
    const clickedPath = findNodePath(target, containerRef.current);
    if (clickedPath !== state.selectedPath) return;

    const node = getNodeAtPathPublic(state.document.root, state.selectedPath);
    if (!node) return;
    dispatch({ type: 'BATCH_START' });
    setDragInfo({
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origLeft: node.props?.left ?? 0,
      origTop: node.props?.top ?? 0,
      origWidth: node.props?.width ?? 0,
      origHeight: node.props?.height ?? 0,
    });
    e.preventDefault();
  }, [state.selectedPath, state.document]);

  // Resize from overlay handles
  const handleResizeStart = useCallback((dir: ResizeDir, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!state.selectedPath || !state.document) return;
    const node = getNodeAtPathPublic(state.document.root, state.selectedPath);
    if (!node) return;
    dispatch({ type: 'BATCH_START' });
    setDragInfo({
      type: 'resize',
      dir,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: node.props?.left ?? 0,
      origTop: node.props?.top ?? 0,
      origWidth: node.props?.width ?? 0,
      origHeight: node.props?.height ?? 0,
    });
  }, [state.selectedPath, state.document]);

  // Global drag handling
  useEffect(() => {
    if (!dragInfo) return;

    function onMove(e: MouseEvent) {
      if (!dragInfo || !state.selectedPath) return;
      let dx = (e.clientX - dragInfo.startX) / effectiveZoom;
      let dy = (e.clientY - dragInfo.startY) / effectiveZoom;

      // Shift = lock to horizontal or vertical axis
      if (e.shiftKey && dragInfo.type === 'move') {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }

      if (dragInfo.type === 'move') {
        const newLeft = Math.round(dragInfo.origLeft + dx);
        const newTop = Math.round(dragInfo.origTop + dy);
        dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key: 'left', value: newLeft });
        dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key: 'top', value: newTop });

        const w = dragInfo.origWidth;
        const h = dragInfo.origHeight;
        const centerX = newLeft + w / 2;
        const centerY = newTop + h / 2;
        const parentW = designWidth;
        const parentH = designHeight;
        const SNAP = 3;
        const g: { type: 'h' | 'v'; pos: number }[] = [];
        if (Math.abs(centerX - parentW / 2) < SNAP) g.push({ type: 'v', pos: parentW / 2 });
        if (Math.abs(centerY - parentH / 2) < SNAP) g.push({ type: 'h', pos: parentH / 2 });
        if (Math.abs(newLeft) < SNAP) g.push({ type: 'v', pos: 0 });
        if (Math.abs(newLeft + w - parentW) < SNAP) g.push({ type: 'v', pos: parentW });
        if (Math.abs(newTop) < SNAP) g.push({ type: 'h', pos: 0 });
        if (Math.abs(newTop + h - parentH) < SNAP) g.push({ type: 'h', pos: parentH });
        setGuides(g);
      } else if (dragInfo.type === 'resize') {
        let newW = dragInfo.origWidth;
        let newH = dragInfo.origHeight;
        let newL = dragInfo.origLeft;
        let newT = dragInfo.origTop;
        const dir = dragInfo.dir!;
        if (dir.includes('e')) newW = Math.max(10, Math.round(dragInfo.origWidth + dx));
        if (dir.includes('s')) newH = Math.max(10, Math.round(dragInfo.origHeight + dy));
        if (dir.includes('w')) { newW = Math.max(10, Math.round(dragInfo.origWidth - dx)); newL = Math.round(dragInfo.origLeft + dx); }
        if (dir.includes('n') && dir !== 'ne' && dir !== 'nw') { newH = Math.max(10, Math.round(dragInfo.origHeight - dy)); newT = Math.round(dragInfo.origTop + dy); }
        if (dir === 'ne') { newH = Math.max(10, Math.round(dragInfo.origHeight - dy)); newT = Math.round(dragInfo.origTop + dy); }
        if (dir === 'nw') { newH = Math.max(10, Math.round(dragInfo.origHeight - dy)); newT = Math.round(dragInfo.origTop + dy); }
        if (dir === 'n') { newH = Math.max(10, Math.round(dragInfo.origHeight - dy)); newT = Math.round(dragInfo.origTop + dy); }
        dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key: 'width', value: newW });
        dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key: 'height', value: newH });
        if (dir.includes('w') || dir.includes('n') || dir === 'n') {
          dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key: 'left', value: newL });
          dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key: 'top', value: newT });
        }
      }
    }

    function onUp() {
      setDragInfo(null);
      setGuides([]);
      dispatch({ type: 'BATCH_END' });
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragInfo, state.selectedPath, dispatch, effectiveZoom, designWidth, designHeight]);

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        setUserZoom(true);
        setZoom(z => Math.max(0.05, Math.min(3, (z ?? 0.5) - e.deltaY * 0.002)));
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Space key for panning, Escape to exit scope, Ctrl+C/V copy-paste
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.code === 'Escape' && scopePath) {
        e.preventDefault();
        const dotIdx = scopePath.lastIndexOf('.');
        setScopePath(dotIdx > 0 ? scopePath.slice(0, dotIdx) : null);
        dispatch({ type: 'SELECT_NODE', path: scopePath });
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && state.selectedPath && state.document) {
        e.preventDefault();
        const node = getNodeAtPathPublic(state.document.root, state.selectedPath);
        if (node) clipboardRef.current = JSON.parse(JSON.stringify(node));
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && clipboardRef.current && state.document) {
        e.preventDefault();
        const clone = JSON.parse(JSON.stringify(clipboardRef.current));
        if (clone.props) { clone.props.left = (clone.props.left || 0) + 20; clone.props.top = (clone.props.top || 0) + 20; }
        const parentPath = state.selectedPath || 'root';
        dispatch({ type: 'ADD_NODE', parentPath, node: clone });
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setPanning(false);
        panStart.current = null;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [scopePath, dispatch, state.selectedPath, state.document]);

  // Pan drag handling
  useEffect(() => {
    if (!panning) return;
    function onMove(e: MouseEvent) {
      if (!panStart.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPanX(panStart.current.px + dx);
      setPanY(panStart.current.py + dy);
    }
    function onUp() {
      setPanning(false);
      panStart.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panning]);

  const handleViewportMouseDown = useCallback((e: React.MouseEvent) => {
    if (spaceHeld) {
      e.preventDefault();
      e.stopPropagation();
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    }
  }, [spaceHeld, panX, panY]);

  const handleFitClick = useCallback(() => {
    setUserZoom(false);
    setZoom(calcFitZoom());
    setPanX(0);
    setPanY(0);
  }, [calcFitZoom]);

  if (!state.document) {
    return (
      <div className="editor-canvas">
        <div className="canvas-empty">
          No document loaded. Use toolbar to import or create one.
        </div>
      </div>
    );
  }

  return (
    <div className="editor-canvas" ref={canvasRef} style={spaceHeld ? { cursor: panning ? 'grabbing' : 'grab' } : undefined}>
      <div className="canvas-viewport" ref={viewportRef} onMouseDown={handleViewportMouseDown}>
        <div
          className="canvas-frame"
          style={{
            width: designWidth,
            height: designHeight,
            transform: `translate(${panX}px, ${panY}px) scale(${effectiveZoom})`,
            transformOrigin: 'center center',
          }}
        >
          <div
            ref={containerRef}
            className="canvas-content"
            style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
            onClick={handleContentClick}
            onDoubleClick={handleContentDoubleClick}
            onMouseMove={handleContentMouseMove}
            onMouseDown={handleContentMouseDown}
            onMouseLeave={handleContentMouseLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {renderUINode(state.document.root, 'root', state.document.components)}
          </div>
          <VisualOverlay
            selectedRect={selectedRect}
            multiRects={multiRects}
            hoverRect={hoverRect}
            guides={guides}
            dragging={!!dragInfo}
            zoom={effectiveZoom}
            onResizeStart={handleResizeStart}
          />
        </div>
      </div>
      <div className="canvas-zoom-bar">
        <button className="canvas-zoom-btn" onClick={handleFitClick} title="Fit to viewport">Fit</button>
        <button className="canvas-zoom-btn" onClick={() => { setUserZoom(true); setZoom(z => Math.min(3, (z ?? 0.5) * 1.25)); }} title="Zoom in">+</button>
        <button className="canvas-zoom-btn" onClick={() => { setUserZoom(true); setZoom(z => Math.max(0.05, (z ?? 0.5) * 0.8)); }} title="Zoom out">&minus;</button>
        <span className="canvas-zoom-label">{Math.round(effectiveZoom * 100)}%</span>
        <span className="canvas-zoom-label canvas-dim-label">{designWidth}&times;{designHeight}</span>
      </div>
    </div>
  );
}
