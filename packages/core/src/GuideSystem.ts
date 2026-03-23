import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';

export interface GuideStep {
  id: string;
  /** Target node name to highlight */
  target: string;
  /** Tooltip text to show */
  text: string;
  /** Tooltip position relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** If true, user must tap the target to proceed (otherwise tap anywhere) */
  requireTarget?: boolean;
  /** Delay before showing this step (ms) */
  delay?: number;
  /** Custom action when step is shown */
  onShow?: () => void;
  /** Custom action when step is completed */
  onComplete?: () => void;
  /** Skip condition — if returns true, skip this step */
  skipIf?: () => boolean;
}

export interface GuideConfig {
  id: string;
  steps: GuideStep[];
  /** Called when all steps complete */
  onFinish?: () => void;
  /** Called if guide is skipped */
  onSkip?: () => void;
  /** If true, allow user to skip the entire guide */
  skippable?: boolean;
}

export interface GuideState {
  active: boolean;
  guideId: string | null;
  currentStep: number;
  totalSteps: number;
  step: GuideStep | null;
}

export interface GuideManagerAPI {
  state: GuideState;
  /** Start a guide sequence */
  startGuide(config: GuideConfig): void;
  /** Advance to next step */
  nextStep(): void;
  /** Skip the entire guide */
  skipGuide(): void;
  /** Check if a guide has been completed (persisted via callback) */
  isCompleted(guideId: string): boolean;
  /** Mark a guide as completed */
  markCompleted(guideId: string): void;
}

const GuideManagerCtx = createContext<GuideManagerAPI | null>(null);

export function useGuideManager(): GuideManagerAPI {
  const ctx = useContext(GuideManagerCtx);
  if (!ctx) throw new Error('useGuideManager must be used within GuideManagerProvider');
  return ctx;
}

interface InternalGuideState {
  config: GuideConfig | null;
  stepIndex: number;
  completed: Set<string>;
}

export function GuideManagerProvider({
  children,
  onSaveCompleted,
  initialCompleted,
}: {
  children: React.ReactNode;
  onSaveCompleted?: (guideId: string) => void;
  initialCompleted?: string[];
}) {
  const [internal, setInternal] = useState<InternalGuideState>({
    config: null,
    stepIndex: 0,
    completed: new Set(initialCompleted || []),
  });

  const delayTimer = useRef<any>(null);

  const currentStep = useMemo((): GuideStep | null => {
    if (!internal.config) return null;
    const { steps } = internal.config;
    let idx = internal.stepIndex;
    while (idx < steps.length) {
      if (steps[idx].skipIf?.()) {
        idx++;
        continue;
      }
      return steps[idx];
    }
    return null;
  }, [internal.config, internal.stepIndex]);

  const guideState: GuideState = useMemo(() => ({
    active: internal.config !== null && currentStep !== null,
    guideId: internal.config?.id || null,
    currentStep: internal.stepIndex,
    totalSteps: internal.config?.steps.length || 0,
    step: currentStep,
  }), [internal, currentStep]);

  const startGuide = useCallback((config: GuideConfig) => {
    if (internal.completed.has(config.id)) return;
    setInternal(prev => ({ ...prev, config, stepIndex: 0 }));
  }, [internal.completed]);

  const finishGuide = useCallback(() => {
    const config = internal.config;
    setInternal(prev => ({
      ...prev,
      config: null,
      stepIndex: 0,
      completed: new Set([...prev.completed, config?.id || '']),
    }));
    config?.onFinish?.();
    if (config?.id) onSaveCompleted?.(config.id);
  }, [internal.config, onSaveCompleted]);

  const nextStep = useCallback(() => {
    if (!internal.config) return;
    currentStep?.onComplete?.();
    const nextIdx = internal.stepIndex + 1;
    if (nextIdx >= internal.config.steps.length) {
      finishGuide();
      return;
    }
    setInternal(prev => ({ ...prev, stepIndex: nextIdx }));
  }, [internal, currentStep, finishGuide]);

  const skipGuide = useCallback(() => {
    if (!internal.config) return;
    internal.config.onSkip?.();
    finishGuide();
  }, [internal.config, finishGuide]);

  const isCompleted = useCallback((guideId: string): boolean => {
    return internal.completed.has(guideId);
  }, [internal.completed]);

  const markCompleted = useCallback((guideId: string) => {
    setInternal(prev => ({
      ...prev,
      completed: new Set([...prev.completed, guideId]),
    }));
    onSaveCompleted?.(guideId);
  }, [onSaveCompleted]);

  useEffect(() => {
    if (currentStep?.delay && currentStep.delay > 0) {
      delayTimer.current = setTimeout(() => {
        currentStep.onShow?.();
      }, currentStep.delay);
      return () => clearTimeout(delayTimer.current);
    }
    currentStep?.onShow?.();
  }, [currentStep]);

  const api: GuideManagerAPI = useMemo(() => ({
    state: guideState,
    startGuide, nextStep, skipGuide, isCompleted, markCompleted,
  }), [guideState, startGuide, nextStep, skipGuide, isCompleted, markCompleted]);

  return React.createElement(GuideManagerCtx.Provider, { value: api }, children);
}

/**
 * Unity-side guide overlay component.
 * Use with TowerUIBinder to find and highlight target nodes.
 *
 * In your game's root component:
 * - Render GuideOverlay when guideState.active
 * - GuideOverlay creates a full-screen mask with a hole at the target position
 */
export interface GuideOverlayProps {
  step: GuideStep;
  onTap: () => void;
  onSkip?: () => void;
  skippable?: boolean;
  targetRect?: { x: number; y: number; width: number; height: number };
}

export function useGuideStep(): GuideStep | null {
  const { state } = useGuideManager();
  return state.step;
}
