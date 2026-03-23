/** Engine-side node handle — opaque to core, concrete in adapters */
export type EngineNode = any;

export interface UIEvent {
  type: string;
  target: EngineNode;
  currentTarget: EngineNode;
  timestamp: number;
  stopPropagation(): void;
  preventDefault(): void;
}

export interface UINodeProps {
  key?: string | number;
  ref?: any;
  children?: any;

  // Layout (Flexbox)
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
  alignContent?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'space-between' | 'space-around';
  padding?: number | [number, number] | [number, number, number, number];
  margin?: number | [number, number] | [number, number, number, number];
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  position?: 'relative' | 'absolute';
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  overflow?: 'visible' | 'hidden' | 'scroll';
  aspectRatio?: number;

  // Visual
  opacity?: number;
  visible?: boolean;
  zIndex?: number;

  // Transform
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  pivotX?: number;
  pivotY?: number;

  // Sound
  clickSound?: string;

  // Interaction
  interactive?: boolean;
  onClick?: (e: UIEvent) => void;
  onPointerDown?: (e: UIEvent) => void;
  onPointerUp?: (e: UIEvent) => void;
  onPointerEnter?: (e: UIEvent) => void;
  onPointerExit?: (e: UIEvent) => void;
}

export interface TextProps {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  maxLines?: number;
  overflow?: 'truncate' | 'ellipsis' | 'wrap';
  lineHeight?: number;
}

export interface ImageProps {
  src?: string;
  atlas?: string;
  color?: string;
  tint?: string;
  scale9Grid?: [number, number, number, number];
  sliceLeft?: number;
  sliceRight?: number;
  sliceTop?: number;
  sliceBottom?: number;
  fillMethod?: 'none' | 'horizontal' | 'vertical' | 'radial90' | 'radial180' | 'radial360';
  fillAmount?: number;
  fillOrigin?: number;
  flipX?: boolean;
  flipY?: boolean;
  preserveAspect?: boolean;
}

export interface InputProps {
  value?: string;
  placeholder?: string;
  placeholderColor?: string;
  maxLength?: number;
  password?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface ButtonProps {
  text?: string;
  disabled?: boolean;
  onClick?: (e: UIEvent) => void;
}

export interface ScrollProps {
  horizontal?: boolean;
  vertical?: boolean;
  elastic?: boolean;
  inertia?: boolean;
  scrollbarVisibility?: 'always' | 'auto' | 'never';
  onScroll?: (x: number, y: number) => void;
}

export interface ToggleProps {
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export interface SliderProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
}

export interface ProgressProps {
  value?: number;
  max?: number;
  barColor?: string;
  bgColor?: string;
}

export interface ListProps {
  itemCount: number;
  itemHeight: number | ((index: number) => number);
  renderItem: (index: number) => any;
  overscan?: number;
}

/** Built-in intrinsic element map for JSX */
export interface TowerIntrinsicElements {
  'ui-view': UINodeProps & Pick<ImageProps, 'src' | 'atlas' | 'tint' | 'sliceLeft' | 'sliceRight' | 'sliceTop' | 'sliceBottom'>;
  'ui-text': UINodeProps & TextProps;
  'ui-image': UINodeProps & ImageProps;
  'ui-input': UINodeProps & InputProps;
  'ui-button': UINodeProps & ButtonProps;
  'ui-scroll': UINodeProps & ScrollProps;
  'ui-toggle': UINodeProps & ToggleProps;
  'ui-slider': UINodeProps & SliderProps;
  'ui-progress': UINodeProps & ProgressProps;
  'ui-list': UINodeProps & ListProps;
}
