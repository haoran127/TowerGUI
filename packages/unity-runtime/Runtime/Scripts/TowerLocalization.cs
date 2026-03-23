using UnityEngine;
using System;
using System.Collections.Generic;

namespace TowerUI
{
    /// <summary>
    /// Runtime localization system. Loads JSON locale files and resolves i18nKey.
    /// JSON format: { "key": "translated text", "key.nested": "value", ... }
    /// Supports {{param}} interpolation.
    /// </summary>
    public static class TowerLocalization
    {
        private static Dictionary<string, string> _strings = new();
        private static string _currentLocale = "en";
        private static readonly List<Action> _onLocaleChanged = new();

        public static string CurrentLocale => _currentLocale;

        /// <summary>
        /// Load a locale JSON from Resources (e.g. "Locales/zh-CN").
        /// JSON should be a flat key-value object.
        /// </summary>
        public static void LoadLocale(string locale, string resourcePath = null)
        {
            string path = resourcePath ?? $"Locales/{locale}";
            var textAsset = Resources.Load<TextAsset>(path);
            if (textAsset == null)
            {
                Debug.LogWarning($"[TowerLocalization] Locale file not found: {path}");
                return;
            }
            LoadLocaleFromJson(locale, textAsset.text);
        }

        /// <summary>
        /// Load locale from raw JSON string.
        /// </summary>
        public static void LoadLocaleFromJson(string locale, string json)
        {
            _currentLocale = locale;
            _strings.Clear();

            var dict = MiniJson.Deserialize(json) as Dictionary<string, object>;
            if (dict == null)
            {
                Debug.LogError("[TowerLocalization] Failed to parse locale JSON");
                return;
            }

            FlattenDict(dict, "", _strings);
            NotifyChanged();
        }

        private static void FlattenDict(Dictionary<string, object> dict, string prefix, Dictionary<string, string> output)
        {
            foreach (var kv in dict)
            {
                string key = string.IsNullOrEmpty(prefix) ? kv.Key : $"{prefix}.{kv.Key}";
                if (kv.Value is Dictionary<string, object> nested)
                {
                    FlattenDict(nested, key, output);
                }
                else
                {
                    output[key] = kv.Value?.ToString() ?? "";
                }
            }
        }

        /// <summary>
        /// Get localized string by key. Returns key itself if not found.
        /// </summary>
        public static string Get(string key)
        {
            if (string.IsNullOrEmpty(key)) return "";
            return _strings.TryGetValue(key, out var value) ? value : key;
        }

        /// <summary>
        /// Get localized string with parameter interpolation.
        /// e.g. Get("welcome", ("name", "Player1")) → "Welcome, Player1!"
        /// </summary>
        public static string Get(string key, params (string name, object value)[] args)
        {
            string template = Get(key);
            if (args == null || args.Length == 0) return template;

            string result = template;
            for (int i = 0; i < args.Length; i++)
            {
                result = result.Replace("{{" + args[i].name + "}}", args[i].value?.ToString() ?? "");
            }
            return result;
        }

        /// <summary>
        /// Check if a key exists in the current locale.
        /// </summary>
        public static bool Has(string key) => _strings.ContainsKey(key);

        public static int KeyCount => _strings.Count;

        /// <summary>
        /// Register a callback for locale changes (e.g. to refresh UI text).
        /// </summary>
        public static void OnLocaleChanged(Action callback)
        {
            if (callback != null && !_onLocaleChanged.Contains(callback))
                _onLocaleChanged.Add(callback);
        }

        public static void RemoveLocaleChanged(Action callback)
        {
            _onLocaleChanged.Remove(callback);
        }

        private static void NotifyChanged()
        {
            for (int i = _onLocaleChanged.Count - 1; i >= 0; i--)
            {
                try { _onLocaleChanged[i]?.Invoke(); }
                catch (Exception ex) { Debug.LogException(ex); }
            }
        }

        /// <summary>
        /// Apply i18nKey to all TMP_Text components under a root that have
        /// the key stored in the name pattern: "i18n:keyname"
        /// </summary>
        public static void ApplyToHierarchy(GameObject root)
        {
            if (root == null) return;
            var texts = root.GetComponentsInChildren<TMPro.TMP_Text>(true);
            foreach (var tmp in texts)
            {
                string goName = tmp.gameObject.name;
                if (goName.StartsWith("i18n:"))
                {
                    string key = goName.Substring(5);
                    tmp.text = Get(key);
                }
            }
        }

        /// <summary>
        /// Apply using TowerUIBinder named nodes: resolve i18nKey props from .tower.json.
        /// Call this after TowerUIBinder.Awake() to localize the prefab.
        /// </summary>
        public static void ApplyToBinder(TowerUIBinder binder, Dictionary<string, string> i18nMap)
        {
            if (binder == null || i18nMap == null) return;
            foreach (var kv in i18nMap)
            {
                string nodeName = kv.Key;
                string i18nKey = kv.Value;
                binder.SetText(nodeName, Get(i18nKey));
            }
        }

        public static void Clear()
        {
            _strings.Clear();
            _onLocaleChanged.Clear();
        }
    }

    /// <summary>
    /// MonoBehaviour that auto-localizes its TMP_Text on enable and locale change.
    /// </summary>
    [RequireComponent(typeof(TMPro.TMP_Text))]
    public class TowerLocalizedText : MonoBehaviour
    {
        [SerializeField] private string _i18nKey;
        private TMPro.TMP_Text _text;

        public string I18nKey
        {
            get => _i18nKey;
            set { _i18nKey = value; Refresh(); }
        }

        private void Awake()
        {
            _text = GetComponent<TMPro.TMP_Text>();
        }

        private void OnEnable()
        {
            TowerLocalization.OnLocaleChanged(Refresh);
            Refresh();
        }

        private void OnDisable()
        {
            TowerLocalization.RemoveLocaleChanged(Refresh);
        }

        private void Refresh()
        {
            if (_text != null && !string.IsNullOrEmpty(_i18nKey))
                _text.text = TowerLocalization.Get(_i18nKey);
        }
    }
}
