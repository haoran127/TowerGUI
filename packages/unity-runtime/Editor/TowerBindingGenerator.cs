using UnityEngine;
using UnityEditor;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace TowerUI.Editor
{
    /// <summary>
    /// Generates type-safe C# binding classes from .tower.json dataBind declarations.
    /// Menu: TowerUI / Generate Bindings
    /// </summary>
    public static class TowerBindingGenerator
    {
        [MenuItem("TowerUI/Generate Bindings", priority = 102)]
        public static void GenerateAll()
        {
            string streamingAssets = Application.streamingAssetsPath;
            if (!Directory.Exists(streamingAssets))
            {
                Debug.LogWarning("[TowerBindingGen] StreamingAssets folder not found.");
                return;
            }

            var jsonFiles = Directory.GetFiles(streamingAssets, "*.tower.json", SearchOption.AllDirectories);
            if (jsonFiles.Length == 0)
            {
                Debug.LogWarning("[TowerBindingGen] No .tower.json files found.");
                return;
            }

            const string outputDir = "Assets/GeneratedBindings";
            if (!Directory.Exists(outputDir))
                Directory.CreateDirectory(outputDir);

            int count = 0;
            foreach (var jsonPath in jsonFiles)
            {
                try
                {
                    string json = File.ReadAllText(jsonPath);
                    var doc = MiniJson.Parse(json) as Dictionary<string, object>;
                    if (doc == null) continue;

                    string docName = "Untitled";
                    if (doc.TryGetValue("meta", out var metaObj) && metaObj is Dictionary<string, object> meta)
                    {
                        if (meta.TryGetValue("name", out var n)) docName = n?.ToString() ?? "Untitled";
                    }

                    var bindings = new List<BindingEntry>();
                    if (doc.TryGetValue("root", out var rootObj))
                        CollectBindings(rootObj, bindings);

                    if (bindings.Count == 0) continue;

                    string className = SanitizeClassName(docName) + "Binding";
                    string code = GenerateClass(className, docName, bindings);
                    string outputPath = Path.Combine(outputDir, className + ".cs").Replace('\\', '/');
                    File.WriteAllText(outputPath, code, Encoding.UTF8);
                    count++;
                    Debug.Log($"[TowerBindingGen] Generated: {outputPath} ({bindings.Count} bindings)");
                }
                catch (Exception e)
                {
                    Debug.LogError($"[TowerBindingGen] Error processing {jsonPath}: {e.Message}");
                }
            }

            AssetDatabase.Refresh();
            Debug.Log($"[TowerBindingGen] Done. Generated {count} binding files.");
        }

        private class BindingEntry
        {
            public string nodeName;
            public string role;
            public string field;
            public string protoType;
            public string eventName;
            public string itemType;
            public string nodeType;
        }

        private static void CollectBindings(object nodeObj, List<BindingEntry> bindings)
        {
            if (nodeObj is not Dictionary<string, object> node) return;

            string nodeType = node.TryGetValue("type", out var t) ? t?.ToString() : "ui-view";
            string nodeName = null;
            if (node.TryGetValue("props", out var propsObj) && propsObj is Dictionary<string, object> props)
            {
                if (props.TryGetValue("name", out var nameVal))
                    nodeName = nameVal?.ToString();
            }

            if (node.TryGetValue("dataBind", out var dbObj) && dbObj is Dictionary<string, object> db)
            {
                var entry = new BindingEntry
                {
                    nodeName = nodeName ?? "unnamed",
                    nodeType = nodeType,
                    role = db.TryGetValue("role", out var r) ? r?.ToString() : "display",
                    field = db.TryGetValue("field", out var f) ? f?.ToString() : null,
                    protoType = db.TryGetValue("protoType", out var p) ? p?.ToString() : "string",
                    eventName = db.TryGetValue("event", out var e) ? e?.ToString() : null,
                    itemType = db.TryGetValue("itemType", out var it) ? it?.ToString() : null,
                };
                bindings.Add(entry);
            }

            if (node.TryGetValue("children", out var childrenObj) && childrenObj is List<object> children)
            {
                foreach (var child in children)
                    CollectBindings(child, bindings);
            }
        }

        private static string GenerateClass(string className, string docName, List<BindingEntry> bindings)
        {
            var sb = new StringBuilder();
            sb.AppendLine("// Auto-generated by TowerUI Binding Generator");
            sb.AppendLine("// Do not edit manually — regenerate with TowerUI > Generate Bindings");
            sb.AppendLine();
            sb.AppendLine("using UnityEngine;");
            sb.AppendLine("using UnityEngine.UI;");
            sb.AppendLine("using TowerUI;");
            sb.AppendLine();
            sb.AppendLine($"/// <summary>Type-safe bindings for \"{docName}\"</summary>");
            sb.AppendLine($"public class {className}");
            sb.AppendLine("{");
            sb.AppendLine("    private readonly TowerUIBinder _binder;");
            sb.AppendLine();
            sb.AppendLine($"    public {className}(TowerUIBinder binder)");
            sb.AppendLine("    {");
            sb.AppendLine("        _binder = binder;");
            sb.AppendLine("    }");

            foreach (var b in bindings)
            {
                sb.AppendLine();
                string safeName = SanitizeFieldName(b.field ?? b.eventName ?? b.nodeName);

                if (b.role == "display" && !string.IsNullOrEmpty(b.field))
                {
                    string csType = ProtoTypeToCSharp(b.protoType);
                    string setter = GetSetterForType(b.nodeType, csType);

                    sb.AppendLine($"    /// <summary>Display field: {b.field} ({b.protoType}) on node \"{b.nodeName}\"</summary>");
                    sb.AppendLine($"    public void Set{ToPascal(safeName)}({csType} value)");
                    sb.AppendLine("    {");
                    sb.AppendLine($"        {setter}");
                    sb.AppendLine("    }");

                    string getter = GetGetterForType(b.nodeType, csType);
                    if (getter != null)
                    {
                        sb.AppendLine($"    public {csType} Get{ToPascal(safeName)}()");
                        sb.AppendLine("    {");
                        sb.AppendLine($"        {getter}");
                        sb.AppendLine("    }");
                    }
                }
                else if (b.role == "event" && !string.IsNullOrEmpty(b.eventName))
                {
                    sb.AppendLine($"    /// <summary>Event: {b.eventName} on node \"{b.nodeName}\"</summary>");
                    sb.AppendLine($"    public Button Get{ToPascal(safeName)}Button()");
                    sb.AppendLine("    {");
                    sb.AppendLine($"        return _binder.GetButton(\"{b.nodeName}\");");
                    sb.AppendLine("    }");
                    sb.AppendLine($"    public void Bind{ToPascal(safeName)}(UnityEngine.Events.UnityAction action)");
                    sb.AppendLine("    {");
                    sb.AppendLine($"        _binder.BindButton(\"{b.nodeName}\", action);");
                    sb.AppendLine("    }");
                }
                else if (b.role == "list" && !string.IsNullOrEmpty(b.field))
                {
                    sb.AppendLine($"    /// <summary>List: {b.field} (itemType: {b.itemType ?? "?"}) on node \"{b.nodeName}\"</summary>");
                    sb.AppendLine($"    public GameObject Get{ToPascal(safeName)}Container()");
                    sb.AppendLine("    {");
                    sb.AppendLine($"        return _binder.FindNode(\"{b.nodeName}\");");
                    sb.AppendLine("    }");
                }
            }

            sb.AppendLine("}");
            return sb.ToString();
        }

        private static string ProtoTypeToCSharp(string protoType)
        {
            return protoType switch
            {
                "int32" => "int",
                "int64" => "long",
                "float" => "float",
                "double" => "double",
                "bool" => "bool",
                "bytes" => "byte[]",
                _ => "string",
            };
        }

        private static string GetSetterForType(string nodeType, string csType)
        {
            if (nodeType == "ui-text" || csType == "string")
                return "_binder.SetText(\"{0}\", value{1});".Replace("{0}", "\" + \"").Replace("{1}", csType == "string" ? "" : ".ToString()");

            return $"_binder.SetText(\"{{nodeName}}\", value.ToString());";
        }

        private static string GetGetterForType(string nodeType, string csType)
        {
            if (nodeType == "ui-text" || csType == "string")
                return "return _binder.GetText(\"{nodeName}\");";
            return null;
        }

        private static string SanitizeClassName(string name)
        {
            string result = Regex.Replace(name, @"[^a-zA-Z0-9_]", "_");
            if (result.Length > 0 && char.IsDigit(result[0])) result = "_" + result;
            return ToPascal(result);
        }

        private static string SanitizeFieldName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "Unnamed";
            return Regex.Replace(name, @"[^a-zA-Z0-9_]", "_");
        }

        private static string ToPascal(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            var parts = s.Split('_', '-', ' ');
            var sb = new StringBuilder();
            foreach (var part in parts)
            {
                if (part.Length == 0) continue;
                sb.Append(char.ToUpper(part[0]));
                if (part.Length > 1) sb.Append(part.Substring(1));
            }
            return sb.ToString();
        }
    }
}
