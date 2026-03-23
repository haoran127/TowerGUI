#if UNITY_EDITOR
using UnityEngine;
using UnityEditor;
using UnityEngine.UI;
using System.Text;
using System.IO;
using TMPro;

/// <summary>
/// 将 Prefab 的完整 UI 层级导出为 JSON — 用于 TowerGUI 1:1 还原。
/// 使用方法:
///   1. 把此文件放到 Assets/Editor/ 目录
///   2. 菜单: Tools → Export Prefab Layout
///   3. 在弹出的选择框中选择 LFUImain2.prefab (或任意 UI prefab)
///   4. 导出的 JSON 文件保存到项目根目录
/// </summary>
public class PrefabExporter : EditorWindow
{
    [MenuItem("Tools/Export Prefab Layout")]
    static void ExportPrefab()
    {
        string path = EditorUtility.OpenFilePanel("Select Prefab", "Assets/Shelter/Prefabs", "prefab");
        if (string.IsNullOrEmpty(path)) return;

        string relativePath = "Assets" + path.Substring(Application.dataPath.Length);
        GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(relativePath);
        if (prefab == null)
        {
            EditorUtility.DisplayDialog("Error", "Failed to load prefab: " + relativePath, "OK");
            return;
        }

        GameObject instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
        if (instance == null)
        {
            EditorUtility.DisplayDialog("Error", "Failed to instantiate prefab", "OK");
            return;
        }

        try
        {
            var sb = new StringBuilder();
            ExportNode(instance.transform, sb, 0);

            string outPath = Path.Combine(Application.dataPath, "..", "prefab_layout.json");
            File.WriteAllText(outPath, "[\n" + sb.ToString() + "\n]");

            EditorUtility.DisplayDialog("Done",
                $"Exported {CountNodes(instance.transform)} nodes to:\n{outPath}", "OK");
            Debug.Log($"[PrefabExporter] Saved to {outPath}");
        }
        finally
        {
            DestroyImmediate(instance);
        }
    }

    static int CountNodes(Transform t)
    {
        int count = 1;
        for (int i = 0; i < t.childCount; i++)
            count += CountNodes(t.GetChild(i));
        return count;
    }

    static void ExportNode(Transform t, StringBuilder sb, int depth)
    {
        if (sb.Length > 0) sb.Append(",\n");

        var rt = t as RectTransform;
        string indent = new string(' ', depth * 2);

        sb.Append(indent + "{");
        sb.Append($"\"name\":\"{Escape(t.name)}\",");
        sb.Append($"\"active\":{(t.gameObject.activeSelf ? "true" : "false")},");
        sb.Append($"\"depth\":{depth},");
        sb.Append($"\"childCount\":{t.childCount},");

        if (rt != null)
        {
            sb.Append($"\"anchorMin\":{{\"x\":{rt.anchorMin.x:F3},\"y\":{rt.anchorMin.y:F3}}},");
            sb.Append($"\"anchorMax\":{{\"x\":{rt.anchorMax.x:F3},\"y\":{rt.anchorMax.y:F3}}},");
            sb.Append($"\"anchoredPos\":{{\"x\":{rt.anchoredPosition.x:F1},\"y\":{rt.anchoredPosition.y:F1}}},");
            sb.Append($"\"sizeDelta\":{{\"x\":{rt.sizeDelta.x:F1},\"y\":{rt.sizeDelta.y:F1}}},");
            sb.Append($"\"pivot\":{{\"x\":{rt.pivot.x:F2},\"y\":{rt.pivot.y:F2}}},");
            sb.Append($"\"rect\":{{\"w\":{rt.rect.width:F1},\"h\":{rt.rect.height:F1}}},");
        }

        // Components
        var components = new StringBuilder();

        var img = t.GetComponent<Image>();
        if (img != null)
        {
            string spriteName = img.sprite != null ? img.sprite.name : "null";
            string colorHex = ColorUtility.ToHtmlStringRGBA(img.color);
            components.Append($"{{\"type\":\"Image\",\"sprite\":\"{Escape(spriteName)}\",\"color\":\"#{colorHex}\",\"raycast\":{(img.raycastTarget ? "true" : "false")}}},");
        }

        var rawImg = t.GetComponent<RawImage>();
        if (rawImg != null)
        {
            string colorHex = ColorUtility.ToHtmlStringRGBA(rawImg.color);
            components.Append($"{{\"type\":\"RawImage\",\"color\":\"#{colorHex}\"}},");
        }

        var tmp = t.GetComponent<TextMeshProUGUI>();
        if (tmp != null)
        {
            string colorHex = ColorUtility.ToHtmlStringRGBA(tmp.color);
            components.Append($"{{\"type\":\"TMP\",\"text\":\"{Escape(tmp.text)}\",\"fontSize\":{tmp.fontSize:F1},\"color\":\"#{colorHex}\",\"align\":\"{tmp.alignment}\",\"fontStyle\":\"{tmp.fontStyle}\"}},");
        }

        var legacyText = t.GetComponent<Text>();
        if (legacyText != null && tmp == null)
        {
            string colorHex = ColorUtility.ToHtmlStringRGBA(legacyText.color);
            components.Append($"{{\"type\":\"Text\",\"text\":\"{Escape(legacyText.text)}\",\"fontSize\":{legacyText.fontSize},\"color\":\"#{colorHex}\",\"align\":\"{legacyText.alignment}\"}},");
        }

        var btn = t.GetComponent<Button>();
        if (btn != null) components.Append("{\"type\":\"Button\"},");

        var toggle = t.GetComponent<Toggle>();
        if (toggle != null) components.Append("{\"type\":\"Toggle\"},");

        var slider = t.GetComponent<Slider>();
        if (slider != null) components.Append("{\"type\":\"Slider\"},");

        var scrollRect = t.GetComponent<ScrollRect>();
        if (scrollRect != null)
        {
            components.Append($"{{\"type\":\"ScrollRect\",\"horizontal\":{(scrollRect.horizontal ? "true" : "false")},\"vertical\":{(scrollRect.vertical ? "true" : "false")}}},");
        }

        var layout = t.GetComponent<HorizontalLayoutGroup>();
        if (layout != null)
        {
            components.Append($"{{\"type\":\"HLayout\",\"spacing\":{layout.spacing:F1},\"childAlign\":\"{layout.childAlignment}\",\"padding\":{{\"l\":{layout.padding.left},\"r\":{layout.padding.right},\"t\":{layout.padding.top},\"b\":{layout.padding.bottom}}}}},");
        }

        var vlayout = t.GetComponent<VerticalLayoutGroup>();
        if (vlayout != null)
        {
            components.Append($"{{\"type\":\"VLayout\",\"spacing\":{vlayout.spacing:F1},\"childAlign\":\"{vlayout.childAlignment}\",\"padding\":{{\"l\":{vlayout.padding.left},\"r\":{vlayout.padding.right},\"t\":{vlayout.padding.top},\"b\":{vlayout.padding.bottom}}}}},");
        }

        var glayout = t.GetComponent<GridLayoutGroup>();
        if (glayout != null)
        {
            components.Append($"{{\"type\":\"GridLayout\",\"cellSize\":{{\"x\":{glayout.cellSize.x:F1},\"y\":{glayout.cellSize.y:F1}}},\"spacing\":{{\"x\":{glayout.spacing.x:F1},\"y\":{glayout.spacing.y:F1}}},\"constraint\":\"{glayout.constraint}\",\"constraintCount\":{glayout.constraintCount}}},");
        }

        var csf = t.GetComponent<ContentSizeFitter>();
        if (csf != null)
        {
            components.Append($"{{\"type\":\"CSF\",\"hFit\":\"{csf.horizontalFit}\",\"vFit\":\"{csf.verticalFit}\"}},");
        }

        var canvasGroup = t.GetComponent<CanvasGroup>();
        if (canvasGroup != null)
        {
            components.Append($"{{\"type\":\"CanvasGroup\",\"alpha\":{canvasGroup.alpha:F2},\"interactable\":{(canvasGroup.interactable ? "true" : "false")},\"blocksRaycasts\":{(canvasGroup.blocksRaycasts ? "true" : "false")}}},");
        }

        var mask = t.GetComponent<Mask>();
        if (mask != null) components.Append("{\"type\":\"Mask\"},");

        var rectMask = t.GetComponent<RectMask2D>();
        if (rectMask != null) components.Append("{\"type\":\"RectMask2D\"},");

        string compStr = components.ToString().TrimEnd(',');
        sb.Append($"\"components\":[{compStr}]");
        sb.Append("}");

        for (int i = 0; i < t.childCount; i++)
        {
            ExportNode(t.GetChild(i), sb, depth + 1);
        }
    }

    static string Escape(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
    }
}
#endif
