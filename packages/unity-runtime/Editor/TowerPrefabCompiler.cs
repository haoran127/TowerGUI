using UnityEngine;
using UnityEngine.UI;
using UnityEditor;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace TowerUI.Editor
{
    public static class TowerPrefabCompiler
    {
        private const string DefaultJsonFolder = "StreamingAssets";
        private const string DefaultOutputFolder = "Assets/GeneratedPrefabs";

        [MenuItem("TowerUI/Build All Prefabs", priority = 100)]
        public static void BuildAllPrefabs()
        {
            string streamingAssets = Application.streamingAssetsPath;
            if (!Directory.Exists(streamingAssets))
            {
                Debug.LogWarning("[TowerPrefabCompiler] StreamingAssets folder not found.");
                return;
            }

            var jsonFiles = Directory.GetFiles(streamingAssets, "*.tower.json", SearchOption.AllDirectories);
            if (jsonFiles.Length == 0)
            {
                Debug.LogWarning("[TowerPrefabCompiler] No .tower.json files found in StreamingAssets.");
                return;
            }

            if (!Directory.Exists(DefaultOutputFolder))
                Directory.CreateDirectory(DefaultOutputFolder);

            int success = 0;
            int failed = 0;
            int total = jsonFiles.Length;

            try
            {
                for (int i = 0; i < total; i++)
                {
                    var jsonPath = jsonFiles[i];
                    string fileName = Path.GetFileNameWithoutExtension(jsonPath);
                    if (fileName.EndsWith(".tower")) fileName = fileName.Substring(0, fileName.Length - 6);

                    bool cancelled = EditorUtility.DisplayCancelableProgressBar(
                        "TowerUI — Building Prefabs",
                        $"[{i + 1}/{total}] {fileName}",
                        (float)(i + 1) / total);

                    if (cancelled)
                    {
                        Debug.LogWarning("[TowerPrefabCompiler] Build cancelled by user.");
                        break;
                    }

                    try
                    {
                        string json = File.ReadAllText(jsonPath);
                        string prefabPath = Path.Combine(DefaultOutputFolder, fileName + ".prefab").Replace('\\', '/');
                        BuildPrefab(json, prefabPath);
                        success++;
                    }
                    catch (Exception e)
                    {
                        failed++;
                        Debug.LogError($"[TowerPrefabCompiler] Failed to build {jsonPath}: {e.Message}\n{e.StackTrace}");
                    }
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }

            AssetDatabase.Refresh();
            Debug.Log($"[TowerPrefabCompiler] Done. {success} succeeded, {failed} failed out of {total}.");
        }

        [MenuItem("TowerUI/Build Selected JSON", priority = 101)]
        public static void BuildSelectedJson()
        {
            var selected = Selection.activeObject as TextAsset;
            if (selected == null)
            {
                Debug.LogWarning("[TowerPrefabCompiler] Select a .tower.json TextAsset first.");
                return;
            }

            string assetPath = AssetDatabase.GetAssetPath(selected);
            if (!assetPath.EndsWith(".tower.json") && !assetPath.EndsWith(".json"))
            {
                Debug.LogWarning("[TowerPrefabCompiler] Selected asset is not a .tower.json file.");
                return;
            }

            if (!Directory.Exists(DefaultOutputFolder))
                Directory.CreateDirectory(DefaultOutputFolder);

            string fileName = Path.GetFileNameWithoutExtension(assetPath);
            if (fileName.EndsWith(".tower")) fileName = fileName.Substring(0, fileName.Length - 6);
            string prefabPath = Path.Combine(DefaultOutputFolder, fileName + ".prefab").Replace('\\', '/');

            BuildPrefab(selected.text, prefabPath);
            AssetDatabase.Refresh();
            Debug.Log($"[TowerPrefabCompiler] Built: {prefabPath}");
        }

        public static void BuildPrefab(string json, string outputPrefabPath)
        {
            var doc = TowerUIBuilderCore.ParseDocument(json);
            if (doc == null || doc.root == null)
                throw new Exception("Invalid or empty tower.json document");

            var settings = TowerPrefabSettings.GetOrCreate();

            var rootGo = new GameObject(doc.name ?? "TowerUI");
            var rootRT = rootGo.AddComponent<RectTransform>();
            rootRT.anchorMin = Vector2.zero;
            rootRT.anchorMax = Vector2.one;
            rootRT.offsetMin = Vector2.zero;
            rootRT.offsetMax = Vector2.zero;

            var namedNodes = new Dictionary<string, GameObject>();

            TowerUIBuilderCore.BuildNodeTree(
                doc.root, rootRT,
                doc.designWidth, doc.designHeight,
                namedNodes,
                spriteLoader: EditorSpriteLoader,
                defaultFont: settings.defaultFont,
                components: doc.components);

            var binder = rootGo.AddComponent<TowerUIBinder>();

            string dir = Path.GetDirectoryName(outputPrefabPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            PrefabUtility.SaveAsPrefabAsset(rootGo, outputPrefabPath);
            UnityEngine.Object.DestroyImmediate(rootGo);
        }

        private static Sprite EditorSpriteLoader(string src)
        {
            if (string.IsNullOrEmpty(src)) return null;

            var settings = TowerPrefabSettings.GetOrCreate();
            var configPaths = settings.spriteSearchPaths;

            var searchPaths = new List<string>();
            if (configPaths != null)
            {
                foreach (var sp in configPaths)
                    searchPaths.Add($"Assets/{sp}/{src}");
            }
            searchPaths.Add($"Assets/UI/{src}");
            searchPaths.Add($"Assets/Sprites/{src}");
            searchPaths.Add($"Assets/Resources/UI/{src}");
            searchPaths.Add($"Assets/{src}");

            string[] extensions = { "", ".png", ".jpg", ".tga", ".psd" };

            foreach (var basePath in searchPaths)
            {
                foreach (var ext in extensions)
                {
                    string fullPath = basePath + ext;
                    var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(fullPath);
                    if (sprite != null) return sprite;
                }
            }

            var guids = AssetDatabase.FindAssets($"t:Sprite {Path.GetFileNameWithoutExtension(src)}");
            if (guids.Length > 0)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[0]);
                return AssetDatabase.LoadAssetAtPath<Sprite>(path);
            }

            return null;
        }

        [MenuItem("TowerUI/Settings", priority = 200)]
        public static void OpenSettings()
        {
            var settings = TowerPrefabSettings.GetOrCreate();
            Selection.activeObject = settings;
            EditorGUIUtility.PingObject(settings);
        }
    }

    public class TowerPrefabSettings : ScriptableObject
    {
        [Tooltip("Folders to search for sprites (relative to Assets)")]
        public string[] spriteSearchPaths = { "UI", "Sprites", "Resources/UI" };

        [Tooltip("Default TMP font asset to use")]
        public TMPro.TMP_FontAsset defaultFont;

        [Tooltip("Output folder for generated prefabs (relative to Assets)")]
        public string outputFolder = "GeneratedPrefabs";

        private static TowerPrefabSettings _instance;

        public static TowerPrefabSettings GetOrCreate()
        {
            if (_instance != null) return _instance;

            var guids = AssetDatabase.FindAssets("t:TowerPrefabSettings");
            if (guids.Length > 0)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[0]);
                _instance = AssetDatabase.LoadAssetAtPath<TowerPrefabSettings>(path);
                return _instance;
            }

            _instance = CreateInstance<TowerPrefabSettings>();
            const string dir = "Assets/Editor";
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            AssetDatabase.CreateAsset(_instance, "Assets/Editor/TowerPrefabSettings.asset");
            AssetDatabase.SaveAssets();
            return _instance;
        }
    }
}
