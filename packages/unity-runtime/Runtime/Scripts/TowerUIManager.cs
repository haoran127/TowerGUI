using UnityEngine;
using System;
using System.Collections.Generic;

namespace TowerUI
{
    public enum UILayer
    {
        Background = 0,
        Main = 100,
        Popup = 200,
        Modal = 300,
        Guide = 400,
        Toast = 500,
    }

    public interface ITowerScreen
    {
        string ScreenId { get; }
        void OnShow(object data);
        void OnHide();
        void OnDestroy();
    }

    public class TowerUIManager : MonoBehaviour
    {
        public static TowerUIManager Instance { get; private set; }

        [SerializeField] private Transform[] _layerRoots;
        [SerializeField] private GameObject _modalBlocker;

        private readonly Stack<ScreenEntry> _screenStack = new();
        private readonly List<PopupEntry> _popups = new();
        private readonly Queue<PopupRequest> _popupQueue = new();
        private readonly Dictionary<string, GameObject> _prefabCache = new();
        private int _nextSortOrder = 1;

        private struct ScreenEntry
        {
            public string id;
            public GameObject go;
            public ITowerScreen screen;
            public object data;
        }

        private struct PopupEntry
        {
            public string id;
            public GameObject go;
            public ITowerScreen screen;
            public bool modal;
            public int sortOrder;
        }

        private struct PopupRequest
        {
            public string prefabPath;
            public object data;
            public bool modal;
            public int priority;
        }

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            if (_layerRoots == null || _layerRoots.Length == 0)
                SetupDefaultLayers();
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        private void SetupDefaultLayers()
        {
            var canvas = GetComponentInParent<Canvas>();
            if (canvas == null) return;

            var names = Enum.GetNames(typeof(UILayer));
            _layerRoots = new Transform[names.Length];

            for (int i = 0; i < names.Length; i++)
            {
                var layerGo = new GameObject($"Layer_{names[i]}");
                var rt = layerGo.AddComponent<RectTransform>();
                rt.SetParent(canvas.transform, false);
                rt.anchorMin = Vector2.zero;
                rt.anchorMax = Vector2.one;
                rt.offsetMin = Vector2.zero;
                rt.offsetMax = Vector2.zero;
                _layerRoots[i] = rt;
            }
        }

        private Transform GetLayer(UILayer layer)
        {
            int idx = 0;
            var values = Enum.GetValues(typeof(UILayer));
            for (int i = 0; i < values.Length; i++)
            {
                if ((UILayer)values.GetValue(i) == layer) { idx = i; break; }
            }
            if (_layerRoots != null && idx < _layerRoots.Length) return _layerRoots[idx];
            return transform;
        }

        // --- Screen Stack ---

        public GameObject PushScreen(string prefabPath, object data = null)
        {
            if (_screenStack.Count > 0)
            {
                var top = _screenStack.Peek();
                top.go.SetActive(false);
                top.screen?.OnHide();
            }

            var go = InstantiateUI(prefabPath, GetLayer(UILayer.Main));
            var screen = go.GetComponent<ITowerScreen>();
            screen?.OnShow(data);

            _screenStack.Push(new ScreenEntry { id = prefabPath, go = go, screen = screen, data = data });
            return go;
        }

        public void PopScreen()
        {
            if (_screenStack.Count <= 1) return;

            var old = _screenStack.Pop();
            old.screen?.OnHide();
            old.screen?.OnDestroy();
            Destroy(old.go);

            if (_screenStack.Count > 0)
            {
                var top = _screenStack.Peek();
                top.go.SetActive(true);
                top.screen?.OnShow(top.data);
            }
        }

        public void PopToRoot()
        {
            while (_screenStack.Count > 1) PopScreen();
        }

        public void ReplaceScreen(string prefabPath, object data = null)
        {
            if (_screenStack.Count > 0)
            {
                var old = _screenStack.Pop();
                old.screen?.OnHide();
                old.screen?.OnDestroy();
                Destroy(old.go);
            }
            PushScreen(prefabPath, data);
        }

        public bool CanGoBack => _screenStack.Count > 1;
        public int StackDepth => _screenStack.Count;

        public string CurrentScreenId
        {
            get => _screenStack.Count > 0 ? _screenStack.Peek().id : null;
        }

        // --- Popup / Modal ---

        public GameObject ShowPopup(string prefabPath, object data = null, bool modal = false, int priority = 0)
        {
            bool hasModal = false;
            foreach (var p in _popups)
                if (p.modal) { hasModal = true; break; }

            if (hasModal && !modal)
            {
                _popupQueue.Enqueue(new PopupRequest
                {
                    prefabPath = prefabPath, data = data, modal = modal, priority = priority
                });
                return null;
            }

            return ShowPopupImmediate(prefabPath, data, modal);
        }

        private GameObject ShowPopupImmediate(string prefabPath, object data, bool modal)
        {
            var layer = modal ? UILayer.Modal : UILayer.Popup;
            var go = InstantiateUI(prefabPath, GetLayer(layer));
            var screen = go.GetComponent<ITowerScreen>();

            var canvas = go.GetComponent<Canvas>();
            if (canvas == null) canvas = go.AddComponent<Canvas>();
            canvas.overrideSorting = true;
            canvas.sortingOrder = _nextSortOrder++;
            if (go.GetComponent<GraphicRaycaster>() == null)
                go.AddComponent<GraphicRaycaster>();

            screen?.OnShow(data);

            _popups.Add(new PopupEntry
            {
                id = prefabPath, go = go, screen = screen, modal = modal, sortOrder = canvas.sortingOrder
            });

            UpdateModalBlocker();
            return go;
        }

        public void ClosePopup(string id)
        {
            for (int i = _popups.Count - 1; i >= 0; i--)
            {
                if (_popups[i].id == id || _popups[i].go.name == id)
                {
                    var entry = _popups[i];
                    entry.screen?.OnHide();
                    entry.screen?.OnDestroy();
                    Destroy(entry.go);
                    _popups.RemoveAt(i);
                    break;
                }
            }
            UpdateModalBlocker();
            ProcessPopupQueue();
        }

        public void ClosePopup(GameObject go)
        {
            for (int i = _popups.Count - 1; i >= 0; i--)
            {
                if (_popups[i].go == go)
                {
                    var entry = _popups[i];
                    entry.screen?.OnHide();
                    entry.screen?.OnDestroy();
                    Destroy(entry.go);
                    _popups.RemoveAt(i);
                    break;
                }
            }
            UpdateModalBlocker();
            ProcessPopupQueue();
        }

        public void CloseAllPopups()
        {
            for (int i = _popups.Count - 1; i >= 0; i--)
            {
                _popups[i].screen?.OnHide();
                _popups[i].screen?.OnDestroy();
                Destroy(_popups[i].go);
            }
            _popups.Clear();
            _popupQueue.Clear();
            UpdateModalBlocker();
        }

        public bool HasModal
        {
            get { foreach (var p in _popups) if (p.modal) return true; return false; }
        }

        public int PopupCount => _popups.Count;

        private void UpdateModalBlocker()
        {
            if (_modalBlocker == null) return;
            bool show = false;
            int maxOrder = 0;
            foreach (var p in _popups)
            {
                if (p.modal) { show = true; if (p.sortOrder > maxOrder) maxOrder = p.sortOrder; }
            }
            _modalBlocker.SetActive(show);
            if (show)
            {
                var blockerCanvas = _modalBlocker.GetComponent<Canvas>();
                if (blockerCanvas != null) blockerCanvas.sortingOrder = maxOrder - 1;
            }
        }

        private void ProcessPopupQueue()
        {
            if (_popupQueue.Count == 0) return;
            bool hasModal = false;
            foreach (var p in _popups) if (p.modal) { hasModal = true; break; }
            if (hasModal) return;

            var req = _popupQueue.Dequeue();
            ShowPopupImmediate(req.prefabPath, req.data, req.modal);
        }

        // --- Utility ---

        private GameObject InstantiateUI(string prefabPath, Transform parent)
        {
            if (!_prefabCache.TryGetValue(prefabPath, out var prefab))
            {
                prefab = Resources.Load<GameObject>(prefabPath);
                if (prefab != null) _prefabCache[prefabPath] = prefab;
            }
            if (prefab == null)
            {
                Debug.LogError($"[TowerUIManager] Prefab not found: {prefabPath}");
                return new GameObject(prefabPath);
            }
            var go = Instantiate(prefab, parent);
            go.name = prefab.name;
            return go;
        }

        /// <summary>
        /// Register a prefab for a screen id (avoids Resources.Load).
        /// </summary>
        public void RegisterPrefab(string id, GameObject prefab)
        {
            _prefabCache[id] = prefab;
        }

        /// <summary>
        /// Show a toast on the toast layer. Auto-destroys after duration.
        /// </summary>
        public GameObject ShowToast(string prefabPath, object data = null, float duration = 2f)
        {
            var go = InstantiateUI(prefabPath, GetLayer(UILayer.Toast));
            var screen = go.GetComponent<ITowerScreen>();
            screen?.OnShow(data);
            Destroy(go, duration);
            return go;
        }
    }
}
