using UnityEngine;
using UnityEngine.UI;
using System;
using System.Collections;
using System.Collections.Generic;

namespace TowerUI
{
    public enum TowerTransitionType
    {
        None,
        FadeIn,
        FadeOut,
        SlideInLeft,
        SlideInRight,
        SlideInUp,
        SlideInDown,
        ScaleIn,
        ScaleOut,
        BounceIn,
    }

    public enum TowerAnimationType
    {
        None,
        Pulse,
        Shake,
        Breathe,
        Spin,
        Float,
    }

    [Serializable]
    public class TowerTransitionConfig
    {
        public TowerTransitionType type = TowerTransitionType.None;
        public float duration = 0.3f;
        public float delay = 0f;
        public TowerEaseType ease = TowerEaseType.EaseOutCubic;
    }

    [Serializable]
    public class TowerAnimationConfig
    {
        public TowerAnimationType type = TowerAnimationType.None;
        public float duration = 1f;
        public float amplitude = 1f;
        public bool loop = true;
    }

    public enum TowerEaseType
    {
        Linear,
        EaseInQuad,
        EaseOutQuad,
        EaseInOutQuad,
        EaseInCubic,
        EaseOutCubic,
        EaseInOutCubic,
        EaseOutBack,
        EaseOutBounce,
        EaseOutElastic,
    }

    /// <summary>
    /// Reads transition/animation declarations from JSON and drives them at runtime.
    /// Attach to the same GameObject as TowerUIBinder. No DOTween dependency — pure coroutine.
    /// </summary>
    public class TowerAnimator : MonoBehaviour
    {
        private TowerUIBinder _binder;

        void Awake()
        {
            _binder = GetComponent<TowerUIBinder>();
        }

        public void PlayTransition(string nodeName, TowerTransitionConfig config, Action onComplete = null)
        {
            if (config == null || config.type == TowerTransitionType.None) { onComplete?.Invoke(); return; }
            var go = _binder?.FindNode(nodeName);
            if (go == null) { onComplete?.Invoke(); return; }
            StartCoroutine(RunTransition(go, config, onComplete));
        }

        public Coroutine PlayAnimation(string nodeName, TowerAnimationConfig config)
        {
            if (config == null || config.type == TowerAnimationType.None) return null;
            var go = _binder?.FindNode(nodeName);
            if (go == null) return null;
            return StartCoroutine(RunAnimation(go, config));
        }

        public void PlayTransition(GameObject go, TowerTransitionConfig config, Action onComplete = null)
        {
            if (config == null || config.type == TowerTransitionType.None) { onComplete?.Invoke(); return; }
            StartCoroutine(RunTransition(go, config, onComplete));
        }

        private IEnumerator RunTransition(GameObject go, TowerTransitionConfig cfg, Action onComplete)
        {
            if (cfg.delay > 0f) yield return new WaitForSeconds(cfg.delay);

            var rt = go.GetComponent<RectTransform>();
            var cg = go.GetComponent<CanvasGroup>() ?? go.AddComponent<CanvasGroup>();
            Vector3 origPos = rt.anchoredPosition3D;
            Vector3 origScale = rt.localScale;

            Vector3 startPos = origPos;
            Vector3 startScale = origScale;
            float startAlpha = 1f;
            float endAlpha = 1f;
            Vector3 endPos = origPos;
            Vector3 endScale = origScale;

            switch (cfg.type)
            {
                case TowerTransitionType.FadeIn:
                    startAlpha = 0f; endAlpha = 1f; break;
                case TowerTransitionType.FadeOut:
                    startAlpha = 1f; endAlpha = 0f; break;
                case TowerTransitionType.SlideInLeft:
                    startPos = origPos + Vector3.left * 300f; break;
                case TowerTransitionType.SlideInRight:
                    startPos = origPos + Vector3.right * 300f; break;
                case TowerTransitionType.SlideInUp:
                    startPos = origPos + Vector3.up * 300f; break;
                case TowerTransitionType.SlideInDown:
                    startPos = origPos + Vector3.down * 300f; break;
                case TowerTransitionType.ScaleIn:
                    startScale = Vector3.zero; startAlpha = 0f; endAlpha = 1f; break;
                case TowerTransitionType.ScaleOut:
                    endScale = Vector3.zero; endAlpha = 0f; break;
                case TowerTransitionType.BounceIn:
                    startScale = Vector3.one * 0.3f; startAlpha = 0f; endAlpha = 1f;
                    cfg.ease = TowerEaseType.EaseOutBack; break;
            }

            float t = 0f;
            cg.alpha = startAlpha;
            rt.anchoredPosition3D = startPos;
            rt.localScale = startScale;

            while (t < cfg.duration)
            {
                t += Time.deltaTime;
                float p = Mathf.Clamp01(t / cfg.duration);
                float e = ApplyEase(p, cfg.ease);
                cg.alpha = Mathf.Lerp(startAlpha, endAlpha, e);
                rt.anchoredPosition3D = Vector3.Lerp(startPos, endPos, e);
                rt.localScale = Vector3.Lerp(startScale, endScale, e);
                yield return null;
            }

            cg.alpha = endAlpha;
            rt.anchoredPosition3D = endPos;
            rt.localScale = endScale;
            onComplete?.Invoke();
        }

        private IEnumerator RunAnimation(GameObject go, TowerAnimationConfig cfg)
        {
            var rt = go.GetComponent<RectTransform>();
            var cg = go.GetComponent<CanvasGroup>();
            Vector3 origPos = rt.anchoredPosition3D;
            Vector3 origScale = rt.localScale;
            float origAlpha = cg != null ? cg.alpha : 1f;

            do
            {
                float t = 0f;
                while (t < cfg.duration)
                {
                    t += Time.deltaTime;
                    float p = Mathf.Clamp01(t / cfg.duration);
                    float sin = Mathf.Sin(p * Mathf.PI * 2f);
                    float amp = cfg.amplitude;

                    switch (cfg.type)
                    {
                        case TowerAnimationType.Pulse:
                            float s = 1f + sin * 0.05f * amp;
                            rt.localScale = origScale * s;
                            break;
                        case TowerAnimationType.Shake:
                            rt.anchoredPosition3D = origPos + new Vector3(
                                UnityEngine.Random.Range(-2f, 2f) * amp,
                                UnityEngine.Random.Range(-2f, 2f) * amp, 0f);
                            break;
                        case TowerAnimationType.Breathe:
                            if (cg == null) cg = go.AddComponent<CanvasGroup>();
                            cg.alpha = Mathf.Lerp(0.5f, 1f, (sin + 1f) * 0.5f);
                            break;
                        case TowerAnimationType.Spin:
                            rt.localEulerAngles = new Vector3(0, 0, -p * 360f * amp);
                            break;
                        case TowerAnimationType.Float:
                            rt.anchoredPosition3D = origPos + Vector3.up * sin * 10f * amp;
                            break;
                    }
                    yield return null;
                }

                rt.anchoredPosition3D = origPos;
                rt.localScale = origScale;
                if (cg != null) cg.alpha = origAlpha;
                rt.localEulerAngles = Vector3.zero;

            } while (cfg.loop);
        }

        public static float ApplyEase(float t, TowerEaseType ease)
        {
            switch (ease)
            {
                case TowerEaseType.Linear: return t;
                case TowerEaseType.EaseInQuad: return t * t;
                case TowerEaseType.EaseOutQuad: return t * (2f - t);
                case TowerEaseType.EaseInOutQuad: return t < 0.5f ? 2f * t * t : -1f + (4f - 2f * t) * t;
                case TowerEaseType.EaseInCubic: return t * t * t;
                case TowerEaseType.EaseOutCubic: float f = t - 1f; return f * f * f + 1f;
                case TowerEaseType.EaseInOutCubic: return t < 0.5f ? 4f * t * t * t : (t - 1f) * (2f * t - 2f) * (2f * t - 2f) + 1f;
                case TowerEaseType.EaseOutBack: float c1 = 1.70158f; float c3 = c1 + 1f; float f2 = t - 1f; return 1f + c3 * f2 * f2 * f2 + c1 * f2 * f2;
                case TowerEaseType.EaseOutBounce: return EaseOutBounce(t);
                case TowerEaseType.EaseOutElastic:
                    if (t <= 0f) return 0f; if (t >= 1f) return 1f;
                    return Mathf.Pow(2f, -10f * t) * Mathf.Sin((t * 10f - 0.75f) * (2f * Mathf.PI / 3f)) + 1f;
                default: return t;
            }
        }

        private static float EaseOutBounce(float x)
        {
            const float n1 = 7.5625f;
            const float d1 = 2.75f;
            if (x < 1f / d1) return n1 * x * x;
            if (x < 2f / d1) { x -= 1.5f / d1; return n1 * x * x + 0.75f; }
            if (x < 2.5f / d1) { x -= 2.25f / d1; return n1 * x * x + 0.9375f; }
            x -= 2.625f / d1; return n1 * x * x + 0.984375f;
        }

        public static TowerTransitionType ParseTransitionType(string name)
        {
            if (string.IsNullOrEmpty(name)) return TowerTransitionType.None;
            switch (name.ToLower().Replace("-", "").Replace("_", ""))
            {
                case "fadein": return TowerTransitionType.FadeIn;
                case "fadeout": return TowerTransitionType.FadeOut;
                case "slideinleft": return TowerTransitionType.SlideInLeft;
                case "slideinright": return TowerTransitionType.SlideInRight;
                case "slideinup": return TowerTransitionType.SlideInUp;
                case "slideindown": return TowerTransitionType.SlideInDown;
                case "scalein": return TowerTransitionType.ScaleIn;
                case "scaleout": return TowerTransitionType.ScaleOut;
                case "bouncein": return TowerTransitionType.BounceIn;
                default: return TowerTransitionType.None;
            }
        }

        public static TowerAnimationType ParseAnimationType(string name)
        {
            if (string.IsNullOrEmpty(name)) return TowerAnimationType.None;
            switch (name.ToLower().Replace("-", "").Replace("_", ""))
            {
                case "pulse": return TowerAnimationType.Pulse;
                case "shake": return TowerAnimationType.Shake;
                case "breathe": return TowerAnimationType.Breathe;
                case "spin": return TowerAnimationType.Spin;
                case "float": return TowerAnimationType.Float;
                default: return TowerAnimationType.None;
            }
        }
    }
}
