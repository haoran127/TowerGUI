using UnityEngine;

namespace TowerUI
{
    /// <summary>
    /// Adjusts a RectTransform to respect the device safe area (notch / home indicator).
    /// Attach to a root UI panel or the TowerUI root object.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public class TowerSafeArea : MonoBehaviour
    {
        private RectTransform _rt;
        private Rect _lastSafeArea;
        private Vector2Int _lastScreenSize;

        void Awake()
        {
            _rt = GetComponent<RectTransform>();
            ApplySafeArea();
        }

        void Update()
        {
            if (Screen.safeArea != _lastSafeArea ||
                Screen.width != _lastScreenSize.x ||
                Screen.height != _lastScreenSize.y)
            {
                ApplySafeArea();
            }
        }

        void ApplySafeArea()
        {
            var safeArea = Screen.safeArea;
            _lastSafeArea = safeArea;
            _lastScreenSize = new Vector2Int(Screen.width, Screen.height);

            if (Screen.width <= 0 || Screen.height <= 0) return;

            var anchorMin = safeArea.position;
            var anchorMax = safeArea.position + safeArea.size;
            anchorMin.x /= Screen.width;
            anchorMin.y /= Screen.height;
            anchorMax.x /= Screen.width;
            anchorMax.y /= Screen.height;

            _rt.anchorMin = anchorMin;
            _rt.anchorMax = anchorMax;
            _rt.offsetMin = Vector2.zero;
            _rt.offsetMax = Vector2.zero;
        }
    }
}
