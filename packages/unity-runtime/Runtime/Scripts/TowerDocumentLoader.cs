using UnityEngine;
using System;
using System.IO;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace TowerUI
{
    public class TowerDocumentLoader : MonoBehaviour
    {
        [Tooltip("Path to .tower.json relative to StreamingAssets, or a Resources path (without extension)")]
        [SerializeField] private string documentPath = "";

        [Tooltip("If true, loads from StreamingAssets; otherwise from Resources")]
        [SerializeField] private bool useStreamingAssets = true;

        [Tooltip("Watch for file changes in Editor mode")]
        [SerializeField] private bool watchInEditor = true;

        public static Action<string> onDocumentLoaded;
        public static Action<string> onDocumentReloaded;

        private string _lastContent;
        private string _resolvedPath;

#if UNITY_EDITOR
        private FileSystemWatcher _watcher;
        private volatile bool _fileChanged;
#endif

        void Start()
        {
            LoadDocument();
#if UNITY_EDITOR
            if (watchInEditor)
                SetupWatcher();
#endif
        }

        void Update()
        {
#if UNITY_EDITOR
            if (_fileChanged)
            {
                _fileChanged = false;
                ReloadDocument();
            }
#endif
        }

        public void LoadDocument()
        {
            string content = ReadDocument();
            if (string.IsNullOrEmpty(content))
            {
                Debug.LogWarning($"[TowerDoc] Document not found or empty: {documentPath}");
                return;
            }

            _lastContent = content;
            Debug.Log($"[TowerDoc] Loaded document: {documentPath} ({content.Length} chars)");

            try { onDocumentLoaded?.Invoke(content); }
            catch (Exception e) { Debug.LogError($"[TowerDoc] onDocumentLoaded error: {e}"); }
        }

        public void ReloadDocument()
        {
            string content = ReadDocument();
            if (string.IsNullOrEmpty(content) || content == _lastContent)
                return;

            _lastContent = content;
            Debug.Log($"[TowerDoc] Document reloaded: {documentPath}");

            try { onDocumentReloaded?.Invoke(content); }
            catch (Exception e) { Debug.LogError($"[TowerDoc] onDocumentReloaded error: {e}"); }
        }

        private string ReadDocument()
        {
            if (string.IsNullOrEmpty(documentPath))
                return null;

            if (useStreamingAssets)
            {
                _resolvedPath = Path.Combine(Application.streamingAssetsPath, documentPath);
                if (!File.Exists(_resolvedPath))
                {
                    Debug.LogWarning($"[TowerDoc] File not found: {_resolvedPath}");
                    return null;
                }
                return File.ReadAllText(_resolvedPath);
            }
            else
            {
                var textAsset = Resources.Load<TextAsset>(documentPath);
                if (textAsset == null)
                {
                    Debug.LogWarning($"[TowerDoc] Resource not found: {documentPath}");
                    return null;
                }
                string content = textAsset.text;
                Resources.UnloadAsset(textAsset);
                return content;
            }
        }

#if UNITY_EDITOR
        private void SetupWatcher()
        {
            if (!useStreamingAssets || string.IsNullOrEmpty(_resolvedPath))
                return;

            string dir = Path.GetDirectoryName(_resolvedPath);
            string filename = Path.GetFileName(_resolvedPath);

            if (!Directory.Exists(dir))
                return;

            _watcher = new FileSystemWatcher(dir, filename)
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size,
                EnableRaisingEvents = true
            };
            _watcher.Changed += (sender, args) => { _fileChanged = true; };

            Debug.Log($"[TowerDoc] Watching file: {_resolvedPath}");
        }

        void OnDestroy()
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
                _watcher = null;
            }
            onDocumentLoaded = null;
            onDocumentReloaded = null;
        }
#else
        void OnDestroy()
        {
            onDocumentLoaded = null;
            onDocumentReloaded = null;
        }
#endif

        public string GetCurrentContent() => _lastContent;

        public void SetDocumentPath(string path, bool streaming = true)
        {
            documentPath = path;
            useStreamingAssets = streaming;
        }
    }
}
