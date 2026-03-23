import React, { useCallback, useState } from 'react';
import { useEditor, getNodeAtPathPublic, type UINode, type DataBindInfo } from './state';
import { SpritePickerField } from './SpriteBrowser';

const LAYOUT_PROPS = [
  'width', 'height', 'left', 'top', 'right', 'bottom',
  'position', 'flexDirection', 'justifyContent', 'alignItems', 'alignSelf',
  'flex', 'flexGrow', 'flexShrink', 'flexWrap',
  'gap', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'overflow',
];

const BACKGROUND_PROPS = [
  'tint', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
];

const BORDER_PROPS = [
  'borderRadius',
  'borderWidth', 'borderColor', 'borderStyle',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
];

const EFFECT_PROPS = [
  'opacity', 'visible', 'zIndex', 'boxShadow', 'backdropFilter',
];

const TRANSFORM_PROPS = [
  'scaleX', 'scaleY', 'rotation', 'pivotX', 'pivotY',
];

const TEXT_PROPS = [
  'text', 'i18nKey', 'fontSize', 'color', 'fontFamily', 'fontWeight',
  'align', 'verticalAlign', 'lineHeight', 'letterSpacing',
  'textDecoration', 'textShadow', 'textOutline',
  'bold', 'italic', 'maxLines',
];

const IMAGE_PROPS = [
  'src', 'sliceLeft', 'sliceTop', 'sliceRight', 'sliceBottom',
  'fillMethod', 'fillAmount', 'fillOrigin', 'preserveAspect', 'objectFit',
];

const INPUT_PROPS = [
  'placeholder', 'value', 'maxLength',
];

const TOGGLE_PROPS = [
  'checked',
];

const SLIDER_PROPS = [
  'min', 'max', 'value', 'wholeNumbers',
];

const DROPDOWN_PROPS = [
  'options', 'value', 'disabled',
];

const BUTTON_PROPS = [
  'text', 'fontSize', 'color', 'tint', 'src', 'disabled',
  '_transition', '_normalColor', '_highlightedColor', '_pressedColor', '_disabledColor',
  '_highlightedSprite', '_pressedSprite', '_disabledSprite',
];

const IMAGE_TYPE_PROPS = [
  '_imageType',
];

const INTERACTION_PROPS = [
  'name', 'cursor', 'pointerEvents',
];

const ENUM_VALUES: Record<string, string[]> = {
  position: ['relative', 'absolute'],
  flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
  justifyContent: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
  alignItems: ['flex-start', 'center', 'flex-end', 'stretch'],
  alignSelf: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'],
  flexWrap: ['nowrap', 'wrap', 'wrap-reverse'],
  overflow: ['visible', 'hidden', 'scroll', 'auto'],
  align: ['left', 'center', 'right'],
  verticalAlign: ['top', 'middle', 'bottom'],
  borderStyle: ['none', 'solid', 'dashed', 'dotted'],
  backgroundSize: ['auto', 'cover', 'contain'],
  backgroundPosition: ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'],
  backgroundRepeat: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'],
  objectFit: ['cover', 'contain', 'fill', 'none'],
  fillMethod: ['horizontal', 'vertical', 'radial90', 'radial180', 'radial360'],
  fillOrigin: ['left', 'right', 'top', 'bottom'],
  _transition: ['1', '2', '0', '3'],
  _imageType: ['0', '1', '2', '3'],
  cursor: ['default', 'pointer', 'move', 'text', 'not-allowed', 'grab'],
  pointerEvents: ['auto', 'none'],
  textDecoration: ['none', 'underline', 'line-through'],
  fontWeight: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
};

const QUICK_LABELS: Record<string, Record<string, string>> = {
  flexDirection: { 'row': '→', 'column': '↓', 'row-reverse': '←', 'column-reverse': '↑' },
  justifyContent: { 'flex-start': '⇤', 'center': '⇔', 'flex-end': '⇥', 'space-between': '⇿', 'space-around': '∻', 'space-evenly': '≡' },
  alignItems: { 'flex-start': '⇤', 'center': '⇔', 'flex-end': '⇥', 'stretch': '⟷' },
  flexWrap: { 'nowrap': '—', 'wrap': '↩', 'wrap-reverse': '↪' },
  position: { 'relative': 'rel', 'absolute': 'abs' },
  _transition: { '0': 'None', '1': 'Color', '2': 'Sprite', '3': 'Anim' },
  _imageType: { '0': 'Simple', '1': 'Sliced', '2': 'Tiled', '3': 'Filled' },
  align: { 'left': '⇤', 'center': '⇔', 'right': '⇥' },
  borderStyle: { 'none': '✕', 'solid': '—', 'dashed': '- -', 'dotted': '···' },
  overflow: { 'visible': '⤢', 'hidden': '⊟', 'scroll': '↕', 'auto': 'A' },
};

const SLIDER_RANGES: Record<string, [number, number, number]> = {
  opacity: [0, 1, 0.01],
  scaleX: [0, 3, 0.1],
  scaleY: [0, 3, 0.1],
  rotation: [-360, 360, 1],
  pivotX: [0, 1, 0.1],
  pivotY: [0, 1, 0.1],
  fontSize: [8, 72, 1],
  borderRadius: [0, 50, 1],
  borderWidth: [0, 10, 1],
  fillAmount: [0, 1, 0.01],
  lineHeight: [0.5, 3, 0.1],
  letterSpacing: [-5, 20, 0.5],
};

function PropField({ label, value, onChange }: {
  label: string;
  value: any;
  onChange: (val: any) => void;
}) {
  if (label === 'textOutline' || label === 'options') {
    return null;
  }

  const enumVals = ENUM_VALUES[label];
  const quickLabels = QUICK_LABELS[label];

  if (enumVals && quickLabels) {
    return (
      <div className="prop-row">
        <label className="prop-label">{label}</label>
        <div className="prop-quick-row">
          {enumVals.map(v => (
            <button
              key={v}
              className={`prop-quick-btn${value === v ? ' active' : ''}`}
              onClick={() => onChange(value === v ? undefined : v)}
              title={v}
            >
              {quickLabels[v] || v.replace('flex-', '').slice(0, 4)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (enumVals) {
    return (
      <div className="prop-row">
        <label className="prop-label">{label}</label>
        <select
          className="prop-input prop-select"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {enumVals.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    );
  }

  if (typeof value === 'boolean' || label === 'bold' || label === 'italic' || label === 'visible' || label === 'checked' || label === 'disabled' || label === 'preserveAspect' || label === 'wholeNumbers') {
    return (
      <div className="prop-row">
        <label className="prop-label">{label}</label>
        <input
          type="checkbox"
          className="prop-checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    );
  }

  if (isColorProp(label)) {
    const strVal = value ?? '';
    const hexVal = (typeof strVal === 'string' && strVal.startsWith('#')) ? strVal.slice(0, 7) : '#888888';
    return (
      <div className="prop-row">
        <label className="prop-label">{label}</label>
        <div className="prop-color-group">
          <input
            type="color"
            className="prop-color"
            value={hexVal}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className="prop-input prop-color-text"
            value={strVal}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </div>
      </div>
    );
  }

  if (typeof value === 'number' || isNumericProp(label)) {
    const sliderRange = SLIDER_RANGES[label];
    return (
      <div className="prop-row">
        <label className="prop-label">{label}</label>
        <div className="prop-number-group">
          {sliderRange && (
            <input
              type="range"
              className="prop-slider"
              min={sliderRange[0]}
              max={sliderRange[1]}
              step={sliderRange[2]}
              value={value ?? sliderRange[0]}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          )}
          <input
            type="number"
            className="prop-input prop-number"
            value={value ?? ''}
            step={sliderRange ? sliderRange[2] : undefined}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v === '' ? undefined : Number(v));
            }}
          />
        </div>
      </div>
    );
  }

  const isSpriteProp = /^(src|_highlightedSprite|_pressedSprite|_selectedSprite|_disabledSprite|backgroundImage)$/.test(label);
  if (isSpriteProp) {
    return <SpritePickerField value={value ?? ''} propName={label} onChange={(v) => onChange(v || undefined)} />;
  }

  return (
    <div className="prop-row">
      <label className="prop-label">{label}</label>
      <input
        type="text"
        className="prop-input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

function isNumericProp(name: string): boolean {
  return /^(width|height|left|top|right|bottom|gap|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|margin|marginTop|marginRight|marginBottom|marginLeft|fontSize|opacity|zIndex|flex|flexGrow|flexShrink|scaleX|scaleY|rotation|pivotX|pivotY|minWidth|minHeight|maxWidth|maxHeight|borderRadius|borderWidth|borderTopWidth|borderRightWidth|borderBottomWidth|borderLeftWidth|lineHeight|letterSpacing|sliceLeft|sliceTop|sliceRight|sliceBottom|fillAmount|maxLines|maxLength|min|max)$/.test(name);
}

function isColorProp(name: string): boolean {
  return /^(color|tint|backgroundColor|borderColor)$/.test(name);
}

function PropSection({ title, propNames, node, path }: {
  title: string;
  propNames: string[];
  node: UINode;
  path: string;
}) {
  const { dispatch } = useEditor();
  const props = node.props || {};
  const relevantProps = propNames.filter(p => props[p] !== undefined || shouldShow(p, node.type));

  const handleChange = useCallback((key: string, value: any) => {
    dispatch({ type: 'UPDATE_NODE_PROP', path, key, value });
  }, [path, dispatch]);

  if (relevantProps.length === 0) return null;

  return (
    <div className="prop-section">
      <div className="prop-section-title">{title}</div>
      {relevantProps.map(p => (
        <PropField
          key={p}
          label={p}
          value={props[p]}
          onChange={(val) => handleChange(p, val)}
        />
      ))}
    </div>
  );
}

function shouldShow(prop: string, nodeType: string): boolean {
  const always = ['width', 'height', 'left', 'top', 'position', 'visible', 'opacity', 'name'];
  if (always.includes(prop)) return true;

  const containerProps = ['flexDirection', 'justifyContent', 'alignItems', 'gap', 'padding', 'overflow', 'flexWrap'];
  const bgProps = ['tint', 'backgroundColor', 'borderRadius'];
  const borderProps = ['borderRadius', 'borderWidth', 'borderColor', 'borderStyle'];

  if (nodeType === 'ui-view') {
    if (containerProps.includes(prop)) return true;
    if (bgProps.includes(prop)) return true;
    if (borderProps.includes(prop)) return true;
  }
  if (nodeType === 'ui-text' && TEXT_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-image' && IMAGE_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-image' && IMAGE_TYPE_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-image' && bgProps.includes(prop)) return true;
  if (nodeType === 'ui-button' && BUTTON_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-button' && TEXT_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-button' && ['borderRadius', 'borderWidth', 'borderColor', 'borderStyle'].includes(prop)) return true;
  if (nodeType === 'ui-input' && INPUT_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-input' && ['fontSize', 'color', 'tint', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle'].includes(prop)) return true;
  if (nodeType === 'ui-scroll' && containerProps.includes(prop)) return true;
  if (nodeType === 'ui-scroll' && bgProps.includes(prop)) return true;
  if (nodeType === 'ui-toggle' && TOGGLE_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-toggle' && bgProps.includes(prop)) return true;
  if (nodeType === 'ui-slider' && SLIDER_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-slider' && bgProps.includes(prop)) return true;
  if (nodeType === 'ui-dropdown' && DROPDOWN_PROPS.includes(prop)) return true;
  if (nodeType === 'ui-dropdown' && bgProps.includes(prop)) return true;
  if (nodeType === 'ui-dropdown' && ['fontSize', 'color'].includes(prop)) return true;
  return false;
}

function AlignmentToolbar({ node, path }: { node: UINode; path: string }) {
  const { state, dispatch } = useEditor();
  const isRoot = path === 'root';
  const isMulti = state.selectedPaths.length > 1;

  const getNodes = useCallback((): { path: string; node: UINode }[] => {
    if (!state.document) return [];
    return state.selectedPaths
      .map(p => ({ path: p, node: getNodeAtPathPublic(state.document!.root, p) }))
      .filter((x): x is { path: string; node: UINode } => x.node !== null);
  }, [state.selectedPaths, state.document]);

  const parentPath = getParentPath(path);
  const parentNode = parentPath !== null && state.document
    ? getNodeAtPathPublic(state.document.root, parentPath)
    : null;
  const parentW = parentNode?.props?.width;
  const parentH = parentNode?.props?.height;

  // Single-select: align to parent
  const alignSingle = useCallback((key: string, value: number) => {
    dispatch({ type: 'UPDATE_NODE_PROP', path, key, value });
  }, [path, dispatch]);

  // Multi-select: align relative to each other
  const alignMulti = useCallback((mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
    const nodes = getNodes();
    if (nodes.length < 2) return;
    const lefts = nodes.map(n => n.node.props?.left ?? 0);
    const tops = nodes.map(n => n.node.props?.top ?? 0);
    const rights = nodes.map((n, i) => lefts[i] + (n.node.props?.width ?? 0));
    const bottoms = nodes.map((n, i) => tops[i] + (n.node.props?.height ?? 0));

    if (mode === 'left') {
      const minL = Math.min(...lefts);
      nodes.forEach(n => dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'left', value: minL }));
    } else if (mode === 'right') {
      const maxR = Math.max(...rights);
      nodes.forEach(n => {
        const w = n.node.props?.width ?? 0;
        dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'left', value: maxR - w });
      });
    } else if (mode === 'centerH') {
      const minL = Math.min(...lefts);
      const maxR = Math.max(...rights);
      const center = (minL + maxR) / 2;
      nodes.forEach(n => {
        const w = n.node.props?.width ?? 0;
        dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'left', value: Math.round(center - w / 2) });
      });
    } else if (mode === 'top') {
      const minT = Math.min(...tops);
      nodes.forEach(n => dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'top', value: minT }));
    } else if (mode === 'bottom') {
      const maxB = Math.max(...bottoms);
      nodes.forEach(n => {
        const h = n.node.props?.height ?? 0;
        dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'top', value: maxB - h });
      });
    } else if (mode === 'centerV') {
      const minT = Math.min(...tops);
      const maxB = Math.max(...bottoms);
      const center = (minT + maxB) / 2;
      nodes.forEach(n => {
        const h = n.node.props?.height ?? 0;
        dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'top', value: Math.round(center - h / 2) });
      });
    }
  }, [getNodes, dispatch]);

  const distributeMulti = useCallback((axis: 'h' | 'v') => {
    const nodes = getNodes();
    if (nodes.length < 3) return;
    if (axis === 'h') {
      const sorted = [...nodes].sort((a, b) => (a.node.props?.left ?? 0) - (b.node.props?.left ?? 0));
      const minL = sorted[0].node.props?.left ?? 0;
      const lastNode = sorted[sorted.length - 1];
      const maxR = (lastNode.node.props?.left ?? 0) + (lastNode.node.props?.width ?? 0);
      const totalW = sorted.reduce((s, n) => s + (n.node.props?.width ?? 0), 0);
      const gap = (maxR - minL - totalW) / (sorted.length - 1);
      let x = minL;
      for (const n of sorted) {
        dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'left', value: Math.round(x) });
        x += (n.node.props?.width ?? 0) + gap;
      }
    } else {
      const sorted = [...nodes].sort((a, b) => (a.node.props?.top ?? 0) - (b.node.props?.top ?? 0));
      const minT = sorted[0].node.props?.top ?? 0;
      const lastNode = sorted[sorted.length - 1];
      const maxB = (lastNode.node.props?.top ?? 0) + (lastNode.node.props?.height ?? 0);
      const totalH = sorted.reduce((s, n) => s + (n.node.props?.height ?? 0), 0);
      const gap = (maxB - minT - totalH) / (sorted.length - 1);
      let y = minT;
      for (const n of sorted) {
        dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: 'top', value: Math.round(y) });
        y += (n.node.props?.height ?? 0) + gap;
      }
    }
  }, [getNodes, dispatch]);

  const matchSize = useCallback((dim: 'width' | 'height') => {
    const nodes = getNodes();
    if (nodes.length < 2) return;
    const maxVal = Math.max(...nodes.map(n => n.node.props?.[dim] ?? 0));
    nodes.forEach(n => dispatch({ type: 'UPDATE_NODE_PROP', path: n.path, key: dim, value: maxVal }));
  }, [getNodes, dispatch]);

  const setEqualGap = useCallback((gap: number) => {
    if (!parentPath || !state.document) return;
    dispatch({ type: 'UPDATE_NODE_PROP', path: parentPath, key: 'gap', value: gap });
  }, [parentPath, state.document, dispatch]);

  if (isRoot && !isMulti) return null;

  // Multi-selection mode
  if (isMulti) {
    return (
      <div className="prop-section">
        <div className="prop-section-title">Align ({state.selectedPaths.length} selected)</div>
        <div className="prop-row">
          <label className="prop-label">Align</label>
          <div className="align-btn-row">
            <button className="align-btn" onClick={() => alignMulti('left')} title="Align left edges">⇤</button>
            <button className="align-btn" onClick={() => alignMulti('centerH')} title="Align centers horizontally">⇔</button>
            <button className="align-btn" onClick={() => alignMulti('right')} title="Align right edges">⇥</button>
            <span className="align-sep" />
            <button className="align-btn" onClick={() => alignMulti('top')} title="Align top edges">⤒</button>
            <button className="align-btn" onClick={() => alignMulti('centerV')} title="Align centers vertically">⇕</button>
            <button className="align-btn" onClick={() => alignMulti('bottom')} title="Align bottom edges">⤓</button>
          </div>
        </div>
        <div className="prop-row">
          <label className="prop-label">Distribute</label>
          <div className="align-btn-row">
            <button className="align-btn" onClick={() => distributeMulti('h')} title="Distribute horizontally (3+ nodes)">⟷ H</button>
            <button className="align-btn" onClick={() => distributeMulti('v')} title="Distribute vertically (3+ nodes)">↕ V</button>
          </div>
        </div>
        <div className="prop-row">
          <label className="prop-label">Match</label>
          <div className="align-btn-row">
            <button className="align-btn" onClick={() => matchSize('width')} title="Match width to largest">W=Max</button>
            <button className="align-btn" onClick={() => matchSize('height')} title="Match height to largest">H=Max</button>
          </div>
        </div>
      </div>
    );
  }

  // Single-selection mode: align to parent
  const nodeW = node.props?.width ?? 0;
  const nodeH = node.props?.height ?? 0;

  return (
    <div className="prop-section">
      <div className="prop-section-title">Align & Spacing</div>
      <div className="prop-row">
        <label className="prop-label">In parent</label>
        <div className="align-btn-row">
          <button className="align-btn" onClick={() => alignSingle('left', 0)} title="Align left in parent">⇤</button>
          <button className="align-btn" onClick={() => parentW && alignSingle('left', Math.round((parentW - nodeW) / 2))} title="Center in parent H">⇔</button>
          <button className="align-btn" onClick={() => parentW && alignSingle('left', parentW - nodeW)} title="Align right in parent">⇥</button>
          <span className="align-sep" />
          <button className="align-btn" onClick={() => alignSingle('top', 0)} title="Align top in parent">⤒</button>
          <button className="align-btn" onClick={() => parentH && alignSingle('top', Math.round((parentH - nodeH) / 2))} title="Center in parent V">⇕</button>
          <button className="align-btn" onClick={() => parentH && alignSingle('top', parentH - nodeH)} title="Align bottom in parent">⤓</button>
        </div>
      </div>
      <div className="prop-row">
        <label className="prop-label">Size</label>
        <div className="align-btn-row">
          <button className="align-btn" onClick={() => parentW && alignSingle('width', parentW)} title="Fill parent width">W=P</button>
          <button className="align-btn" onClick={() => parentH && alignSingle('height', parentH)} title="Fill parent height">H=P</button>
        </div>
      </div>
      <div className="prop-row">
        <label className="prop-label">Parent gap</label>
        <div className="align-btn-row">
          {[0, 4, 8, 12, 16, 24].map(g => (
            <button key={g} className="align-btn" onClick={() => setEqualGap(g)} title={`Set parent gap to ${g}px`}>
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function getParentPath(path: string): string | null {
  if (!path || path === 'root') return null;
  const parts = path.replace(/^root\.?/, '').split('.').filter(Boolean);
  if (parts.length === 0) return null;
  parts.pop();
  return parts.length > 0 ? 'root.' + parts.join('.') : 'root';
}

const DEFAULT_ROLE_FOR_TYPE: Record<string, DataBindInfo['role']> = {
  'ui-text': 'display',
  'ui-image': 'display',
  'ui-progress': 'display',
  'ui-button': 'event',
  'ui-toggle': 'event',
  'ui-input': 'display',
  'ui-slider': 'display',
  'ui-scroll': 'list',
};

const DEFAULT_PROTO_FOR_TYPE: Record<string, DataBindInfo['protoType']> = {
  'ui-text': 'string',
  'ui-image': 'string',
  'ui-progress': 'float',
  'ui-slider': 'float',
  'ui-input': 'string',
};

const PROTO_TYPES: DataBindInfo['protoType'][] = ['string', 'int32', 'int64', 'float', 'double', 'bool', 'bytes'];

function DataBindSection({ node, path }: { node: UINode; path: string }) {
  const { dispatch } = useEditor();
  const db = node.dataBind;
  const [expanded, setExpanded] = useState(!!db);

  const suggestedRole = DEFAULT_ROLE_FOR_TYPE[node.type] || 'display';
  const suggestedProto = DEFAULT_PROTO_FOR_TYPE[node.type] || 'string';
  const nameHint = node.props?.name || '';

  const enableBind = useCallback(() => {
    const newBind: DataBindInfo = { role: suggestedRole };
    if (suggestedRole === 'display') {
      newBind.field = nameHint || 'field';
      newBind.protoType = suggestedProto;
    } else if (suggestedRole === 'event') {
      newBind.event = nameHint ? `on${nameHint.replace(/^btn/i, '')}` : 'onClick';
    } else if (suggestedRole === 'list') {
      newBind.field = nameHint || 'items';
      newBind.itemType = 'Item';
    }
    dispatch({ type: 'UPDATE_NODE_DATABIND', path, dataBind: newBind });
    setExpanded(true);
  }, [dispatch, path, suggestedRole, suggestedProto, nameHint]);

  const disableBind = useCallback(() => {
    dispatch({ type: 'UPDATE_NODE_DATABIND', path, dataBind: undefined });
    setExpanded(false);
  }, [dispatch, path]);

  const updateField = useCallback((key: keyof DataBindInfo, value: any) => {
    const newBind = { ...db!, [key]: value || undefined };
    dispatch({ type: 'UPDATE_NODE_DATABIND', path, dataBind: newBind });
  }, [dispatch, path, db]);

  return (
    <div className="prop-section">
      <div className="prop-section-title" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        Data Binding {db ? '●' : '○'} <span style={{ float: 'right', fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <>
          {!db ? (
            <div className="prop-row">
              <button className="align-btn" style={{ width: '100%' }} onClick={enableBind}>
                + Enable Data Binding ({suggestedRole})
              </button>
            </div>
          ) : (
            <>
              <div className="prop-row">
                <label className="prop-label">role</label>
                <select className="prop-input prop-select" value={db.role} onChange={e => updateField('role', e.target.value)}>
                  <option value="display">display</option>
                  <option value="event">event</option>
                  <option value="list">list</option>
                </select>
              </div>

              {db.role === 'display' && (
                <>
                  <div className="prop-row">
                    <label className="prop-label">field</label>
                    <input className="prop-input" value={db.field || ''} onChange={e => updateField('field', e.target.value)} placeholder="e.g. playerName" />
                  </div>
                  <div className="prop-row">
                    <label className="prop-label">protoType</label>
                    <select className="prop-input prop-select" value={db.protoType || 'string'} onChange={e => updateField('protoType', e.target.value)}>
                      {PROTO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </>
              )}

              {db.role === 'event' && (
                <div className="prop-row">
                  <label className="prop-label">event</label>
                  <input className="prop-input" value={db.event || ''} onChange={e => updateField('event', e.target.value)} placeholder="e.g. onBuy" />
                </div>
              )}

              {db.role === 'list' && (
                <>
                  <div className="prop-row">
                    <label className="prop-label">field</label>
                    <input className="prop-input" value={db.field || ''} onChange={e => updateField('field', e.target.value)} placeholder="e.g. items" />
                  </div>
                  <div className="prop-row">
                    <label className="prop-label">itemType</label>
                    <input className="prop-input" value={db.itemType || ''} onChange={e => updateField('itemType', e.target.value)} placeholder="e.g. ItemInfo" />
                  </div>
                </>
              )}

              <div className="prop-row">
                <button className="align-btn" style={{ width: '100%', color: '#e55' }} onClick={disableBind}>
                  Remove Data Binding
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TextOutlineEditor({ node, path }: { node: UINode; path: string }) {
  const { dispatch } = useEditor();
  const outline = (node.props?.textOutline as { color?: string; width?: number }) || {};

  const update = useCallback((key: string, val: any) => {
    const next = { ...outline, [key]: val };
    if (!next.color && !next.width) {
      dispatch({ type: 'UPDATE_NODE_PROP', path, key: 'textOutline', value: undefined });
    } else {
      dispatch({ type: 'UPDATE_NODE_PROP', path, key: 'textOutline', value: next });
    }
  }, [dispatch, path, outline]);

  return (
    <div className="prop-section">
      <div className="prop-section-title">Text Outline</div>
      <div className="prop-row">
        <label className="prop-label">color</label>
        <div className="prop-color-group">
          <input type="color" className="prop-color" value={outline.color || '#000000'} onChange={e => update('color', e.target.value)} />
          <input type="text" className="prop-input prop-color-text" value={outline.color || ''} onChange={e => update('color', e.target.value || undefined)} />
        </div>
      </div>
      <div className="prop-row">
        <label className="prop-label">width</label>
        <input type="number" className="prop-input prop-number" value={outline.width ?? 1} min={0} step={0.5} onChange={e => update('width', Number(e.target.value))} />
      </div>
    </div>
  );
}

function DropdownOptionsEditor({ node, path }: { node: UINode; path: string }) {
  const { dispatch } = useEditor();
  const options: string[] = (node.props?.options as string[]) || [];

  const updateOptions = useCallback((newOpts: string[]) => {
    dispatch({ type: 'UPDATE_NODE_PROP', path, key: 'options', value: newOpts });
  }, [dispatch, path]);

  return (
    <div className="prop-section">
      <div className="prop-section-title">Dropdown Options</div>
      {options.map((opt, i) => (
        <div key={i} className="prop-row" style={{ gap: 4 }}>
          <label className="prop-label" style={{ minWidth: 20 }}>{i}</label>
          <input
            type="text"
            className="prop-input"
            value={opt}
            onChange={e => {
              const next = [...options];
              next[i] = e.target.value;
              updateOptions(next);
            }}
          />
          <button
            className="align-btn"
            style={{ padding: '2px 6px', color: '#e55' }}
            onClick={() => updateOptions(options.filter((_, j) => j !== i))}
            title="Remove"
          >&times;</button>
        </div>
      ))}
      <div className="prop-row">
        <button className="align-btn" style={{ width: '100%' }} onClick={() => updateOptions([...options, `Option ${options.length + 1}`])}>
          + Add Option
        </button>
      </div>
    </div>
  );
}

export function PropsPanel() {
  const { state, dispatch } = useEditor();

  if (!state.document || !state.selectedPath) {
    return (
      <div className="panel props-panel">
        <div className="panel-header">Properties</div>
        <div className="panel-empty">Select a node to edit</div>
      </div>
    );
  }

  const node = getNodeAtPathPublic(state.document.root, state.selectedPath);
  if (!node) {
    return (
      <div className="panel props-panel">
        <div className="panel-header">Properties</div>
        <div className="panel-empty">Node not found</div>
      </div>
    );
  }

  return (
    <div className="panel props-panel">
      <div className="panel-header">
        Properties
        <span className="panel-subtitle">&lt;{node.type}&gt;</span>
      </div>
      <div className="props-content">
        <div className="prop-section">
          <div className="prop-section-title">Info</div>
          <div className="prop-row">
            <label className="prop-label">type</label>
            <span className="prop-value-static">{node.type}</span>
          </div>
          <div className="prop-row">
            <label className="prop-label">path</label>
            <span className="prop-value-static">{state.selectedPath}</span>
          </div>
          <PropField label="name" value={node.props?.name} onChange={(v) => dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath!, key: 'name', value: v })} />
        </div>
        <AlignmentToolbar node={node} path={state.selectedPath} />
        <PropSection title="Layout" propNames={LAYOUT_PROPS} node={node} path={state.selectedPath} />
        <PropSection title="Background" propNames={BACKGROUND_PROPS} node={node} path={state.selectedPath} />
        <PropSection title="Border" propNames={BORDER_PROPS} node={node} path={state.selectedPath} />
        <PropSection title="Effects" propNames={EFFECT_PROPS} node={node} path={state.selectedPath} />
        <PropSection title="Transform" propNames={TRANSFORM_PROPS} node={node} path={state.selectedPath} />
        {(node.type === 'ui-text') && (
          <PropSection title="Text" propNames={TEXT_PROPS} node={node} path={state.selectedPath} />
        )}
        {(node.type === 'ui-button') && (
          <>
            <PropSection title="Button" propNames={BUTTON_PROPS} node={node} path={state.selectedPath} />
            <PropSection title="Text" propNames={TEXT_PROPS} node={node} path={state.selectedPath} />
          </>
        )}
        {(node.type === 'ui-image') && (
          <>
            <PropSection title="Image" propNames={IMAGE_PROPS} node={node} path={state.selectedPath} />
            <PropSection title="Image Type" propNames={IMAGE_TYPE_PROPS} node={node} path={state.selectedPath} />
          </>
        )}
        {(node.type === 'ui-input') && (
          <PropSection title="Input" propNames={INPUT_PROPS} node={node} path={state.selectedPath} />
        )}
        {(node.type === 'ui-toggle') && (
          <PropSection title="Toggle" propNames={TOGGLE_PROPS} node={node} path={state.selectedPath} />
        )}
        {(node.type === 'ui-slider') && (
          <PropSection title="Slider" propNames={SLIDER_PROPS} node={node} path={state.selectedPath} />
        )}
        {(node.type === 'ui-dropdown') && (
          <>
            <PropSection title="Dropdown" propNames={DROPDOWN_PROPS} node={node} path={state.selectedPath} />
            <DropdownOptionsEditor node={node} path={state.selectedPath} />
          </>
        )}
        {(node.type === 'ui-text' || node.type === 'ui-button') && node.props?.textOutline && (
          <TextOutlineEditor node={node} path={state.selectedPath} />
        )}
        <PropSection title="Interaction" propNames={INTERACTION_PROPS} node={node} path={state.selectedPath} />
        <DataBindSection node={node} path={state.selectedPath} />
      </div>
    </div>
  );
}
