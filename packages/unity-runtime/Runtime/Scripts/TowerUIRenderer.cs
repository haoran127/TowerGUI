using UnityEngine;
using UnityEngine.UI;
using System;
using System.Collections.Generic;

namespace TowerUI
{
    /// <summary>
    /// Reads a .tower.json document and creates a live UGUI hierarchy at runtime.
    /// Attach to a Canvas or any RectTransform parent.
    /// For editor-time prefab generation, see TowerPrefabCompiler instead.
    /// </summary>
    public class TowerUIRenderer : MonoBehaviour
    {
        [Header("Document Source")]
        [Tooltip("Drag a .tower.json TextAsset here, OR set documentPath for runtime loading")]
        [SerializeField] private TextAsset documentAsset;

        [Tooltip("Path relative to StreamingAssets (used if documentAsset is null)")]
        [SerializeField] private string documentPath = "";

        [Header("Options")]
        [Tooltip("Rebuild UI when document changes (Editor only)")]
        [SerializeField] private bool hotReload = true;

        [Tooltip("Scale content to fit Canvas size based on designWidth/designHeight")]
        [SerializeField] private bool autoScale = true;

        private GameObject _uiRoot;
        private Dictionary<string, GameObject> _namedNodes = new();
        private Dictionary<string, Action<object>> _dataBindings = new();
        private TowerDoc _currentDoc;

        public Action<string> onButtonClick;

        void Start()
        {
            string json = LoadJson();
            if (!string.IsNullOrEmpty(json))
                Build(json);

#if UNITY_EDITOR
            if (hotReload && !string.IsNullOrEmpty(documentPath))
                SetupFileWatcher();
#endif
        }

#if UNITY_EDITOR
        private System.IO.FileSystemWatcher _watcher;
        private volatile bool _fileChanged;

        void Update()
        {
            if (_fileChanged)
            {
                _fileChanged = false;
                string json = LoadJson();
                if (!string.IsNullOrEmpty(json))
                    Build(json);
            }
        }

        private void SetupFileWatcher()
        {
            string fullPath = System.IO.Path.Combine(Application.streamingAssetsPath, documentPath);
            string dir = System.IO.Path.GetDirectoryName(fullPath);
            string filename = System.IO.Path.GetFileName(fullPath);
            if (!System.IO.Directory.Exists(dir)) return;

            _watcher = new System.IO.FileSystemWatcher(dir, filename)
            {
                NotifyFilter = System.IO.NotifyFilters.LastWrite | System.IO.NotifyFilters.Size,
                EnableRaisingEvents = true
            };
            _watcher.Changed += (sender, args) => { _fileChanged = true; };
        }

        void OnDestroy()
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
                _watcher = null;
            }
        }
#endif

        // ── Public API ──────────────────────────────────────────────────────

        public void Build(string json)
        {
            Clear();

            _currentDoc = TowerUIBuilderCore.ParseDocument(json);
            if (_currentDoc == null || _currentDoc.root == null)
            {
                Debug.LogWarning("[TowerRenderer] Empty or invalid document");
                return;
            }

            var parentRT = GetComponent<RectTransform>();
            if (parentRT == null)
            {
                Debug.LogError("[TowerRenderer] TowerUIRenderer must be on a GameObject with RectTransform");
                return;
            }

            _uiRoot = new GameObject("TowerUI_Root");
            var rootRT = _uiRoot.AddComponent<RectTransform>();
            _uiRoot.transform.SetParent(transform, false);
            rootRT.anchorMin = Vector2.zero;
            rootRT.anchorMax = Vector2.one;
            rootRT.offsetMin = Vector2.zero;
            rootRT.offsetMax = Vector2.zero;

            if (autoScale && _currentDoc.designWidth > 0 && _currentDoc.designHeight > 0)
            {
                var canvas = GetComponentInParent<Canvas>();
                if (canvas != null)
                {
                    var scaler = canvas.GetComponent<CanvasScaler>();
                    if (scaler != null)
                    {
                        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                        scaler.referenceResolution = new Vector2(_currentDoc.designWidth, _currentDoc.designHeight);
                        scaler.matchWidthOrHeight = 0.5f;
                    }
                }
            }

            TowerUIBuilderCore.BuildNodeTree(
                _currentDoc.root, rootRT,
                _currentDoc.designWidth, _currentDoc.designHeight,
                _namedNodes,
                onButtonCreated: WireButtonClick);

            Debug.Log($"[TowerRenderer] Built UI: {_currentDoc.name} ({TowerUIBuilderCore.CountNodes(_uiRoot.transform)} nodes)");
        }

        public void Rebuild()
        {
            string json = _currentDoc != null ? null : LoadJson();
            if (json == null && documentAsset != null)
                json = documentAsset.text;
            if (!string.IsNullOrEmpty(json))
                Build(json);
        }

        public void Clear()
        {
            if (_uiRoot != null)
            {
                if (Application.isPlaying)
                    Destroy(_uiRoot);
                else
                    DestroyImmediate(_uiRoot);
                _uiRoot = null;
            }
            _namedNodes.Clear();
            _dataBindings.Clear();
            _currentDoc = null;
        }

        public GameObject FindNode(string name)
        {
            _namedNodes.TryGetValue(name, out var go);
            return go;
        }

        public void SetData(string path, object value)
        {
            if (_dataBindings.TryGetValue(path, out var setter))
                setter(value);
        }

        public void SetText(string nodeName, string text)
        {
            var go = FindNode(nodeName);
            if (go == null) return;

            var label = go.transform.Find("Label");
            if (label != null)
                UIBridge.SetText(label.gameObject, text);
            else
                UIBridge.SetText(go, text);
        }

        public void SetColor(string nodeName, Color color)
        {
            var go = FindNode(nodeName);
            if (go == null) return;
            var img = go.GetComponent<Image>();
            if (img != null) { img.color = color; return; }
            UIBridge.SetTextColor(go, color.r, color.g, color.b, color.a);
        }

        /// <summary>
        /// Set the document path at runtime (relative to StreamingAssets).
        /// Enables hot-reload file watching in Editor.
        /// </summary>
        public void SetDocumentPath(string path)
        {
            documentPath = path;
        }

        // ── Private ─────────────────────────────────────────────────────────

        private string LoadJson()
        {
            if (documentAsset != null)
                return documentAsset.text;

            if (string.IsNullOrEmpty(documentPath))
                return null;

            string fullPath = System.IO.Path.Combine(Application.streamingAssetsPath, documentPath);
            if (System.IO.File.Exists(fullPath))
                return System.IO.File.ReadAllText(fullPath);

            var ta = Resources.Load<TextAsset>(documentPath);
            if (ta != null)
            {
                string text = ta.text;
                Resources.UnloadAsset(ta);
                return text;
            }

            Debug.LogWarning($"[TowerRenderer] Document not found: {documentPath}");
            return null;
        }

        private void WireButtonClick(GameObject go, string btnName)
        {
            var btn = go.GetComponent<Button>();
            if (btn == null) return;
            btn.onClick.AddListener(() =>
            {
                try { onButtonClick?.Invoke(btnName); }
                catch (Exception e) { Debug.LogError($"[TowerRenderer] Button '{btnName}' click error: {e.Message}"); }
            });
        }
    }
}
