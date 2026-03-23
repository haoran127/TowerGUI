export { render } from './render';
export type { RenderOptions, TowerUIRoot } from './render';
export { createReconciler } from './reconciler';
export { LayoutManager } from './LayoutManager';
export { renderDocument, documentToElement } from './json-renderer';
export { FlexNode } from './FlexLayout';
export type { FlexStyle, FlexSize, LayoutResult } from './FlexLayout';
export { useUIScaler, useToggle, setUIScalerInfo } from './hooks';
export type { UIScalerInfo } from './hooks';

// Animation
export { Easing, resolveEasing } from './easing';
export type { EasingFn, EasingName } from './easing';
export { TweenEngine, tweenEngine } from './TweenEngine';
export type { TweenConfig, TweenHandle, TweenState } from './TweenEngine';
export {
  useTween, useSpring, usePathAnimation, useTransition,
  useFadeIn, useFadeOut, useSlideIn, useScaleIn, useBounceIn,
  useShake, usePulse, useRotateIn,
} from './animation';
export type {
  UseTweenConfig, UseTweenReturn, UseSpringConfig,
  PathPoint, UsePathConfig, UsePathReturn,
  TransitionStep, UseTransitionConfig, UseTransitionReturn,
  PresetConfig,
} from './animation';

// Gestures
export { useLongPress, useSwipe, usePinch, useRotation } from './gestures';
export type {
  LongPressConfig, LongPressHandlers,
  SwipeDirection, SwipeConfig, SwipeHandlers,
  PinchConfig, PinchState,
  RotationConfig, RotationState,
} from './gestures';

// Drag & Drop
export { DragDropProvider, useDrag, useDrop, useDragDropState } from './dragdrop';
export type { DragData, DropResult, UseDragConfig, UseDragReturn, UseDropConfig, UseDropReturn } from './dragdrop';

// Controller / Gear / HitTest
export { useController, useGear, useGearStyle, hitTestRect, hitTestCircle, hitTestPolygon, rectIntersects } from './controller';
export type { ControllerState, GearValues, GearStyle, Rect, Circle, Point } from './controller';

// Window Manager
export { WindowManagerProvider, useWindowManager } from './WindowManager';
export type { WindowConfig, WindowState, WindowManagerAPI } from './WindowManager';
export { GameWindow } from './GameWindow';
export type { GameWindowProps } from './GameWindow';

// Rich Text
export { ubbToTMP, htmlToTMP, stripTags, parseRichText, formatChat, extractMentions, registerEmojis } from './richtext';
export type { RichTextLink, ParsedRichText, RichTextOptions, LinkType } from './richtext';

// Components
export {
  PopupMenu, ComboBox, TreeView, VirtualList,
  BagGrid, SkillBar, ChatPanel, HpBar, BuffIcon,
  DamageNumber, GameTooltip, TabBar,
} from './components';
export type {
  MenuItem, PopupMenuProps,
  ComboBoxOption, ComboBoxProps,
  TreeNode, TreeViewProps,
  VirtualListProps, VirtualListHandle,
  BagGridItem, BagGridProps,
  SkillSlot, SkillBarProps,
  ChatMessage, ChatChannel, ChatPanelProps,
  HpBarProps, BuffIconProps,
  DamageNumberProps, GameTooltipProps,
  TabBarProps,
} from './components';

// Performance
export { NodePool } from './NodePool';
export { useAsyncRender, useBatchUpdate } from './AsyncRender';
export type { AsyncRenderConfig, AsyncRenderState } from './AsyncRender';
export { UpdateCoalescer, SubCanvasManager, sortForBatching } from './CanvasOptimizer';
export type { UpdateStats, BatchHint } from './CanvasOptimizer';
export { runStressReport, measure, LeakDetector } from './stresstest';
export type { StressTestResult } from './stresstest';

// DevTools
export { DevTools } from './devtools';
export type { DevNode, PerfSnapshot } from './devtools';

// i18n
export { I18nProvider, useI18n } from './i18n';
export type { I18nConfig, LocaleMessages } from './i18n';

// Asset Loading
export { loadSprite, loadSpriteFromAtlas, applySpriteWithSlice, loadAudio, useSprite, preloadSprites, getCacheStats, clearCache } from './AssetLoader';
export type { AssetState } from './AssetLoader';

// Sound
export { SoundManager } from './SoundManager';

// Store / State Management
export { createStore, useGameState, useDispatch, useBatch } from './store';
export type { GameStore, GameAction, Selector, Listener, Reducer, SetFn } from './store';

// Data Bridge (C# → JS Store)
export { connectStore } from './DataReceiver';

// Focus / Navigation
export { FocusManager, FocusProvider, useFocusManager, useFocusable, useFocusedId } from './FocusManager';
export type { FocusableEntry, NavigationDirection, FocusManagerAPI } from './FocusManager';

// Input / Safe Area / Scale
export { connectInput, getSafeArea, useSafeArea, getScreenInfo, calculateScale, useScale } from './InputAdapter';
export type { SafeAreaInsets, ScreenInfo, ScaleMode, ScaleConfig } from './InputAdapter';

// Filters
export { Filters } from './filters';

// MovieClip
export { useMovieClip } from './MovieClip';
export type { MovieClipConfig, MovieClipReturn } from './MovieClip';

// Screen Transitions
export { useScreenTransition, TransitionPresets } from './transition';
export type { TransitionType, TransitionStyle, ScreenTransitionReturn } from './transition';

// Profiler
export { Profiler, profiler } from './Profiler';
export type { ProfileFrame, ProfilerAPI } from './Profiler';

// Countdown
export { useCountdown } from './useCountdown';
export type { CountdownConfig, CountdownReturn } from './useCountdown';

// Screen Manager
export { ScreenManagerProvider, useScreenManager } from './ScreenManager';
export type { ScreenConfig, ScreenEntry, ScreenManagerAPI } from './ScreenManager';

// Number / Time / Resource formatting
export { formatNumber, formatDuration, formatCountdown, formatResource, formatPercent, formatPower, formatTimeAgo, formatCoord } from './formatUtils';

// Guide / Tutorial System
export { GuideManagerProvider, useGuideManager, useGuideStep } from './GuideSystem';
export type { GuideStep, GuideConfig, GuideState, GuideOverlayProps, GuideManagerAPI } from './GuideSystem';

// Badge / Red Dot
export { badgeStore, useBadge, useBadgeActions } from './badge';

// Toast / Notification
export { toastManager, useToast } from './toast';
export type { ToastItem, ToastType, ToastOptions } from './toast';

// Network
export { http, get, post, put, del, wsConnect, useHttp, useWebSocket } from './NetworkBridge';
export type { HttpResponse, RequestOptions, WsConnection, WsCallbacks, UseHttpReturn, UseWsReturn } from './NetworkBridge';

// Async Asset Loading (Addressables)
export { loadSpriteAsync, loadAudioAsync, releaseAsset, setUseAddressables, useSpriteAsync } from './AssetLoader';

import './jsx';
export type { IEngineAdapter } from './IEngineAdapter';
export type {
  EngineNode,
  UIEvent,
  UINodeProps,
  TextProps,
  ImageProps,
  InputProps,
  ButtonProps,
  ScrollProps,
  ToggleProps,
  SliderProps,
  ProgressProps,
  ListProps,
  TowerIntrinsicElements,
} from './types';
