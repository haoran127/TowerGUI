using UnityEngine;
using UnityEngine.UI;
using System;
using System.Collections;
using System.Collections.Generic;

namespace TowerUI
{
    [Serializable]
    public class GuideStep
    {
        public string id;
        public string targetNodeName;
        public string text;
        public GuideTooltipPosition tooltipPosition = GuideTooltipPosition.Bottom;
        public bool requireTargetClick = true;
        public float delaySeconds;
        [Tooltip("If set, skip this step")]
        public string skipConditionKey;
    }

    public enum GuideTooltipPosition { Top, Bottom, Left, Right, Center }

    /// <summary>
    /// Full-screen guide overlay with mask hole and tooltip.
    /// Finds target by name via TowerUIBinder, punches a hole in the mask,
    /// shows instructional text, and waits for user interaction.
    /// </summary>
    public class TowerGuideOverlay : MonoBehaviour
    {
        [SerializeField] private Image _maskImage;
        [SerializeField] private RectTransform _highlightFrame;
        [SerializeField] private RectTransform _tooltipPanel;
        [SerializeField] private TMPro.TMP_Text _tooltipText;
        [SerializeField] private Button _skipButton;
        [SerializeField] private Button _nextButton;
        [SerializeField] private float _highlightPadding = 20f;
        [SerializeField] private Color _maskColor = new Color(0, 0, 0, 0.7f);

        public Action<string> onStepCompleted;
        public Action<string> onGuideCompleted;
        public Action<string> onGuideSkipped;
        public Func<string, bool> checkSkipCondition;

        private List<GuideStep> _steps;
        private string _guideId;
        private int _currentStep;
        private TowerUIBinder _binder;
        private Canvas _canvas;
        private bool _active;

        private void Awake()
        {
            _canvas = GetComponentInParent<Canvas>();
            if (_skipButton != null) _skipButton.onClick.AddListener(Skip);
            if (_nextButton != null) _nextButton.onClick.AddListener(NextStep);
            gameObject.SetActive(false);
        }

        /// <summary>
        /// Start a guide sequence.
        /// </summary>
        public void StartGuide(string guideId, List<GuideStep> steps, TowerUIBinder binder)
        {
            _guideId = guideId;
            _steps = steps;
            _binder = binder;
            _currentStep = 0;
            _active = true;
            gameObject.SetActive(true);

            if (_maskImage != null) _maskImage.color = _maskColor;
            ShowCurrentStep();
        }

        public void NextStep()
        {
            if (!_active || _steps == null) return;

            onStepCompleted?.Invoke(_steps[_currentStep].id);
            _currentStep++;

            while (_currentStep < _steps.Count)
            {
                var step = _steps[_currentStep];
                if (!string.IsNullOrEmpty(step.skipConditionKey) && checkSkipCondition != null && checkSkipCondition(step.skipConditionKey))
                {
                    _currentStep++;
                    continue;
                }
                break;
            }

            if (_currentStep >= _steps.Count)
            {
                FinishGuide();
                return;
            }

            ShowCurrentStep();
        }

        public void Skip()
        {
            if (!_active) return;
            _active = false;
            gameObject.SetActive(false);
            onGuideSkipped?.Invoke(_guideId);
        }

        private void FinishGuide()
        {
            _active = false;
            gameObject.SetActive(false);
            onGuideCompleted?.Invoke(_guideId);
        }

        private void ShowCurrentStep()
        {
            if (_currentStep >= _steps.Count) return;
            var step = _steps[_currentStep];

            if (step.delaySeconds > 0)
            {
                StartCoroutine(DelayedShow(step));
                return;
            }

            ShowStepImmediate(step);
        }

        private IEnumerator DelayedShow(GuideStep step)
        {
            if (_highlightFrame != null) _highlightFrame.gameObject.SetActive(false);
            if (_tooltipPanel != null) _tooltipPanel.gameObject.SetActive(false);
            yield return new WaitForSeconds(step.delaySeconds);
            ShowStepImmediate(step);
        }

        private void ShowStepImmediate(GuideStep step)
        {
            RectTransform targetRT = FindTarget(step.targetNodeName);

            if (targetRT != null && _highlightFrame != null)
            {
                _highlightFrame.gameObject.SetActive(true);
                PositionHighlight(targetRT);
            }
            else if (_highlightFrame != null)
            {
                _highlightFrame.gameObject.SetActive(false);
            }

            if (_tooltipText != null) _tooltipText.text = step.text;
            if (_tooltipPanel != null)
            {
                _tooltipPanel.gameObject.SetActive(true);
                if (targetRT != null) PositionTooltip(targetRT, step.tooltipPosition);
            }

            if (step.requireTargetClick && targetRT != null)
            {
                var btn = targetRT.GetComponent<Button>();
                if (btn != null)
                {
                    btn.onClick.AddListener(OnTargetClicked);
                }
            }
        }

        private void OnTargetClicked()
        {
            if (!_active || _steps == null || _currentStep >= _steps.Count) return;

            var step = _steps[_currentStep];
            RectTransform targetRT = FindTarget(step.targetNodeName);
            if (targetRT != null)
            {
                var btn = targetRT.GetComponent<Button>();
                if (btn != null) btn.onClick.RemoveListener(OnTargetClicked);
            }

            NextStep();
        }

        private RectTransform FindTarget(string name)
        {
            if (_binder == null || string.IsNullOrEmpty(name)) return null;
            var go = _binder.FindNode(name);
            return go != null ? go.GetComponent<RectTransform>() : null;
        }

        private void PositionHighlight(RectTransform target)
        {
            Vector3[] worldCorners = new Vector3[4];
            target.GetWorldCorners(worldCorners);

            var canvasRT = _canvas.GetComponent<RectTransform>();
            Vector2 min, max;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                canvasRT, RectTransformUtility.WorldToScreenPoint(_canvas.worldCamera, worldCorners[0]),
                _canvas.worldCamera, out min);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                canvasRT, RectTransformUtility.WorldToScreenPoint(_canvas.worldCamera, worldCorners[2]),
                _canvas.worldCamera, out max);

            Vector2 center = (min + max) / 2f;
            Vector2 size = new Vector2(
                Mathf.Abs(max.x - min.x) + _highlightPadding * 2,
                Mathf.Abs(max.y - min.y) + _highlightPadding * 2
            );

            _highlightFrame.anchoredPosition = center;
            _highlightFrame.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, size.x);
            _highlightFrame.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, size.y);
        }

        private void PositionTooltip(RectTransform target, GuideTooltipPosition position)
        {
            Vector3[] worldCorners = new Vector3[4];
            target.GetWorldCorners(worldCorners);
            var canvasRT = _canvas.GetComponent<RectTransform>();

            Vector2 min, max;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                canvasRT, RectTransformUtility.WorldToScreenPoint(_canvas.worldCamera, worldCorners[0]),
                _canvas.worldCamera, out min);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                canvasRT, RectTransformUtility.WorldToScreenPoint(_canvas.worldCamera, worldCorners[2]),
                _canvas.worldCamera, out max);

            Vector2 center = (min + max) / 2f;
            float halfH = Mathf.Abs(max.y - min.y) / 2f + 20f;
            float halfW = Mathf.Abs(max.x - min.x) / 2f + 20f;

            switch (position)
            {
                case GuideTooltipPosition.Top:
                    _tooltipPanel.anchoredPosition = new Vector2(center.x, max.y + 60f);
                    break;
                case GuideTooltipPosition.Bottom:
                    _tooltipPanel.anchoredPosition = new Vector2(center.x, min.y - 60f);
                    break;
                case GuideTooltipPosition.Left:
                    _tooltipPanel.anchoredPosition = new Vector2(min.x - halfW - 80f, center.y);
                    break;
                case GuideTooltipPosition.Right:
                    _tooltipPanel.anchoredPosition = new Vector2(max.x + halfW + 80f, center.y);
                    break;
                case GuideTooltipPosition.Center:
                    _tooltipPanel.anchoredPosition = center;
                    break;
            }
        }

        public bool IsActive => _active;
        public int CurrentStepIndex => _currentStep;
        public int TotalSteps => _steps?.Count ?? 0;
        public string CurrentGuideId => _guideId;
    }
}
