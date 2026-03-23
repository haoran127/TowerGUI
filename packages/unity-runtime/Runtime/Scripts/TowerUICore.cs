using UnityEngine;
using UnityEngine.UI;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace TowerUI
{
    public class TowerDoc
    {
        public string name;
        public float designWidth = 1080;
        public float designHeight = 1920;
        public TowerNode root;
        public Dictionary<string, TowerNode> components;
    }

    public class TowerNode
    {
        public string type;
        public PropBag props;
        public List<TowerNode> children;

        public string Name => props?.GetString("name") ?? type ?? "node";
    }

    public class PropBag
    {
        private readonly Dictionary<string, object> _data;

        public PropBag(Dictionary<string, object> data)
        {
            _data = data ?? new Dictionary<string, object>();
        }

        public bool Has(string key) => _data.ContainsKey(key);

        public object GetRaw(string key)
        {
            _data.TryGetValue(key, out var v);
            return v;
        }

        public string GetString(string key)
        {
            if (!_data.TryGetValue(key, out var v) || v == null) return null;
            return v.ToString();
        }

        public float GetFloat(string key, float fallback = 0f)
        {
            if (!_data.TryGetValue(key, out var v)) return fallback;
            if (v is double d) return (float)d;
            if (v is long l) return l;
            if (v is float f) return f;
            if (v is int i) return i;
            if (float.TryParse(v?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out float parsed))
                return parsed;
            return fallback;
        }

        public bool GetBool(string key, bool fallback = false)
        {
            if (!_data.TryGetValue(key, out var v)) return fallback;
            if (v is bool b) return b;
            string s = v?.ToString()?.ToLower();
            return s == "true" || s == "1";
        }

        public float[] GetFloatArray(string key)
        {
            if (!_data.TryGetValue(key, out var v)) return null;
            if (v is not List<object> list) return null;
            var result = new float[list.Count];
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i] is double d) result[i] = (float)d;
                else if (list[i] is long l) result[i] = l;
                else if (list[i] is float f) result[i] = f;
                else if (list[i] is int iv) result[i] = iv;
            }
            return result;
        }

        public PropBag GetObject(string key)
        {
            if (!_data.TryGetValue(key, out var v)) return null;
            if (v is Dictionary<string, object> dict) return new PropBag(dict);
            return null;
        }
    }

    public struct CssValue
    {
        public float pct;
        public float px;
    }

    public static class TowerUIBuilderCore
    {
        private static readonly Regex CalcRegex = new Regex(
            @"calc\(\s*([\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)",
            RegexOptions.Compiled);

        private static readonly Regex PctRegex = new Regex(
            @"^([\d.]+)%$",
            RegexOptions.Compiled);

        public static TowerDoc ParseDocument(string json)
        {
            try
            {
                var obj = MiniJson.Parse(json) as Dictionary<string, object>;
                if (obj == null) return null;

                var doc = new TowerDoc();

                if (obj.TryGetValue("meta", out var metaObj) && metaObj is Dictionary<string, object> meta)
                {
                    doc.name = meta.TryGetValue("name", out var n) ? n?.ToString() : "Untitled";
                    doc.designWidth = GetJsonFloat(meta, "designWidth", 1080);
                    doc.designHeight = GetJsonFloat(meta, "designHeight", 1920);
                }

                if (obj.TryGetValue("root", out var rootObj))
                    doc.root = ParseNode(rootObj);

                if (obj.TryGetValue("components", out var compsObj) && compsObj is Dictionary<string, object> compsDict)
                {
                    doc.components = new Dictionary<string, TowerNode>();
                    foreach (var kv in compsDict)
                    {
                        var compNode = ParseNode(kv.Value);
                        if (compNode != null) doc.components[kv.Key] = compNode;
                    }
                }

                return doc;
            }
            catch (Exception e)
            {
                Debug.LogError($"[TowerUI] JSON parse error: {e.Message}");
                return null;
            }
        }

        public static TowerNode ParseNode(object obj)
        {
            if (obj is not Dictionary<string, object> dict) return null;

            var node = new TowerNode();
            node.type = dict.TryGetValue("type", out var t) ? t?.ToString() : "ui-view";

            if (dict.TryGetValue("props", out var propsObj) && propsObj is Dictionary<string, object> propsDict)
                node.props = new PropBag(propsDict);
            else
                node.props = new PropBag(new Dictionary<string, object>());

            if (dict.TryGetValue("children", out var childrenObj) && childrenObj is List<object> childrenList)
            {
                node.children = new List<TowerNode>(childrenList.Count);
                foreach (var child in childrenList)
                {
                    var childNode = ParseNode(child);
                    if (childNode != null)
                        node.children.Add(childNode);
                }
            }

            return node;
        }

        public static float GetJsonFloat(Dictionary<string, object> d, string key, float fallback)
        {
            if (!d.TryGetValue(key, out var v)) return fallback;
            if (v is double dbl) return (float)dbl;
            if (v is long lng) return lng;
            if (v is float flt) return flt;
            if (v is int intv) return intv;
            if (float.TryParse(v?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out float f))
                return f;
            return fallback;
        }

        public static CssValue ParseCssValue(object raw, float parentSize)
        {
            if (raw == null) return default;

            if (raw is double d) return new CssValue { pct = 0, px = (float)d };
            if (raw is long l) return new CssValue { pct = 0, px = l };
            if (raw is float fv) return new CssValue { pct = 0, px = fv };
            if (raw is int i) return new CssValue { pct = 0, px = i };

            string s = raw.ToString();

            if (float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out float numVal))
                return new CssValue { pct = 0, px = numVal };

            var calcMatch = CalcRegex.Match(s);
            if (calcMatch.Success)
            {
                float pct = float.Parse(calcMatch.Groups[1].Value, CultureInfo.InvariantCulture) / 100f;
                float px = float.Parse(calcMatch.Groups[3].Value, CultureInfo.InvariantCulture);
                if (calcMatch.Groups[2].Value == "-") px = -px;
                return new CssValue { pct = pct, px = px };
            }

            var pctMatch = PctRegex.Match(s);
            if (pctMatch.Success)
            {
                float pct = float.Parse(pctMatch.Groups[1].Value, CultureInfo.InvariantCulture) / 100f;
                return new CssValue { pct = pct, px = 0 };
            }

            return default;
        }

        public static Color ParseHexColor(string hex)
        {
            if (string.IsNullOrEmpty(hex)) return Color.white;
            if (hex[0] == '#') hex = hex.Substring(1);
            if (hex.Length < 6) return Color.white;
            float r = int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber) / 255f;
            float g = int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber) / 255f;
            float b = int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber) / 255f;
            float a = hex.Length >= 8
                ? int.Parse(hex.Substring(6, 2), NumberStyles.HexNumber) / 255f
                : 1f;
            return new Color(r, g, b, a);
        }

        public static void ApplyLayout(RectTransform rt, PropBag props, float parentW, float parentH)
        {
            if (rt == null) return;

            bool hasLeft = props.Has("left");
            bool hasRight = props.Has("right");
            bool hasTop = props.Has("top");
            bool hasBottom = props.Has("bottom");
            bool hasWidth = props.Has("width");
            bool hasHeight = props.Has("height");

            float pivotX = props.GetFloat("pivotX", 0.5f);
            float pivotY = props.GetFloat("pivotY", 0.5f);
            rt.pivot = new Vector2(pivotX, 1f - pivotY);

            float scaleX = props.GetFloat("scaleX", 1f);
            float scaleY = props.GetFloat("scaleY", 1f);
            if (scaleX != 1f || scaleY != 1f)
                rt.localScale = new Vector3(scaleX, scaleY, 1f);

            if (hasLeft && hasRight)
            {
                var leftVal = ParseCssValue(props.GetRaw("left"), parentW);
                var rightVal = ParseCssValue(props.GetRaw("right"), parentW);
                rt.anchorMin = new Vector2(leftVal.pct, rt.anchorMin.y);
                rt.anchorMax = new Vector2(1f - rightVal.pct, rt.anchorMax.y);
                rt.offsetMin = new Vector2(leftVal.px, rt.offsetMin.y);
                rt.offsetMax = new Vector2(-rightVal.px, rt.offsetMax.y);
            }
            else if (hasLeft && hasWidth)
            {
                var leftVal = ParseCssValue(props.GetRaw("left"), parentW);
                float width = props.GetFloat("width", 100f);
                rt.anchorMin = new Vector2(leftVal.pct, rt.anchorMin.y);
                rt.anchorMax = new Vector2(leftVal.pct, rt.anchorMax.y);
                rt.offsetMin = new Vector2(leftVal.px, rt.offsetMin.y);
                rt.offsetMax = new Vector2(leftVal.px + width, rt.offsetMax.y);
            }
            else if (hasRight && hasWidth)
            {
                var rightVal = ParseCssValue(props.GetRaw("right"), parentW);
                float width = props.GetFloat("width", 100f);
                rt.anchorMin = new Vector2(1f - rightVal.pct, rt.anchorMin.y);
                rt.anchorMax = new Vector2(1f - rightVal.pct, rt.anchorMax.y);
                rt.offsetMin = new Vector2(-rightVal.px - width, rt.offsetMin.y);
                rt.offsetMax = new Vector2(-rightVal.px, rt.offsetMax.y);
            }
            else if (hasWidth)
            {
                float width = props.GetFloat("width", 100f);
                rt.anchorMin = new Vector2(0f, rt.anchorMin.y);
                rt.anchorMax = new Vector2(0f, rt.anchorMax.y);
                rt.offsetMin = new Vector2(0, rt.offsetMin.y);
                rt.offsetMax = new Vector2(width, rt.offsetMax.y);
            }
            else
            {
                rt.anchorMin = new Vector2(0f, rt.anchorMin.y);
                rt.anchorMax = new Vector2(1f, rt.anchorMax.y);
                rt.offsetMin = new Vector2(0, rt.offsetMin.y);
                rt.offsetMax = new Vector2(0, rt.offsetMax.y);
            }

            if (hasTop && hasBottom)
            {
                var topVal = ParseCssValue(props.GetRaw("top"), parentH);
                var bottomVal = ParseCssValue(props.GetRaw("bottom"), parentH);
                rt.anchorMin = new Vector2(rt.anchorMin.x, bottomVal.pct);
                rt.anchorMax = new Vector2(rt.anchorMax.x, 1f - topVal.pct);
                rt.offsetMin = new Vector2(rt.offsetMin.x, bottomVal.px);
                rt.offsetMax = new Vector2(rt.offsetMax.x, -topVal.px);
            }
            else if (hasTop && hasHeight)
            {
                var topVal = ParseCssValue(props.GetRaw("top"), parentH);
                float height = props.GetFloat("height", 100f);
                rt.anchorMin = new Vector2(rt.anchorMin.x, 1f - topVal.pct);
                rt.anchorMax = new Vector2(rt.anchorMax.x, 1f - topVal.pct);
                rt.offsetMin = new Vector2(rt.offsetMin.x, -topVal.px - height);
                rt.offsetMax = new Vector2(rt.offsetMax.x, -topVal.px);
            }
            else if (hasBottom && hasHeight)
            {
                var bottomVal = ParseCssValue(props.GetRaw("bottom"), parentH);
                float height = props.GetFloat("height", 100f);
                rt.anchorMin = new Vector2(rt.anchorMin.x, bottomVal.pct);
                rt.anchorMax = new Vector2(rt.anchorMax.x, bottomVal.pct);
                rt.offsetMin = new Vector2(rt.offsetMin.x, bottomVal.px);
                rt.offsetMax = new Vector2(rt.offsetMax.x, bottomVal.px + height);
            }
            else if (hasHeight)
            {
                float height = props.GetFloat("height", 100f);
                rt.anchorMin = new Vector2(rt.anchorMin.x, 1f);
                rt.anchorMax = new Vector2(rt.anchorMax.x, 1f);
                rt.offsetMin = new Vector2(rt.offsetMin.x, -height);
                rt.offsetMax = new Vector2(rt.offsetMax.x, 0);
            }
            else
            {
                rt.anchorMin = new Vector2(rt.anchorMin.x, 0f);
                rt.anchorMax = new Vector2(rt.anchorMax.x, 1f);
                rt.offsetMin = new Vector2(rt.offsetMin.x, 0);
                rt.offsetMax = new Vector2(rt.offsetMax.x, 0);
            }
        }

        public static void ApplyFlexLayout(GameObject go, PropBag props)
        {
            string dir = props.GetString("flexDirection");
            if (string.IsNullOrEmpty(dir)) return;

            bool isGrid = props.Has("_gridCellWidth");

            if (isGrid)
            {
                var glg = go.AddComponent<GridLayoutGroup>();
                float cw = props.GetFloat("_gridCellWidth", 100f);
                float ch = props.GetFloat("_gridCellHeight", 100f);
                glg.cellSize = new Vector2(cw, ch);
                float gapX = props.GetFloat("columnGap", props.GetFloat("gap", 0f));
                float gapY = props.GetFloat("rowGap", props.GetFloat("gap", 0f));
                glg.spacing = new Vector2(gapX, gapY);

                string constraint = props.GetString("_gridConstraint");
                int count = (int)props.GetFloat("_gridConstraintCount", 0f);
                if (constraint == "column" && count > 0)
                {
                    glg.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
                    glg.constraintCount = count;
                }
                else if (constraint == "row" && count > 0)
                {
                    glg.constraint = GridLayoutGroup.Constraint.FixedRowCount;
                    glg.constraintCount = count;
                }

                ApplyLayoutGroupPadding(glg, props);
            }
            else if (dir == "row")
            {
                var hlg = go.AddComponent<HorizontalLayoutGroup>();
                hlg.spacing = props.GetFloat("gap", 0f);
                ApplyLayoutGroupAlignment(hlg, props, isRow: true);
                ApplyLayoutGroupPadding(hlg, props);
                hlg.childForceExpandWidth = false;
                hlg.childForceExpandHeight = false;
                hlg.childControlWidth = false;
                hlg.childControlHeight = false;
            }
            else if (dir == "column")
            {
                var vlg = go.AddComponent<VerticalLayoutGroup>();
                vlg.spacing = props.GetFloat("gap", 0f);
                ApplyLayoutGroupAlignment(vlg, props, isRow: false);
                ApplyLayoutGroupPadding(vlg, props);
                vlg.childForceExpandWidth = false;
                vlg.childForceExpandHeight = false;
                vlg.childControlWidth = false;
                vlg.childControlHeight = false;
            }

            string csfH = props.GetString("_csfHorizontal");
            string csfV = props.GetString("_csfVertical");
            if (!string.IsNullOrEmpty(csfH) || !string.IsNullOrEmpty(csfV))
            {
                var csf = go.AddComponent<ContentSizeFitter>();
                csf.horizontalFit = csfH == "preferred" ? ContentSizeFitter.FitMode.PreferredSize
                    : csfH == "min" ? ContentSizeFitter.FitMode.MinSize
                    : ContentSizeFitter.FitMode.Unconstrained;
                csf.verticalFit = csfV == "preferred" ? ContentSizeFitter.FitMode.PreferredSize
                    : csfV == "min" ? ContentSizeFitter.FitMode.MinSize
                    : ContentSizeFitter.FitMode.Unconstrained;
            }

            int aspectMode = (int)props.GetFloat("_aspectMode", 0f);
            if (aspectMode > 0)
            {
                var arf = go.AddComponent<AspectRatioFitter>();
                arf.aspectMode = (AspectRatioFitter.AspectMode)aspectMode;
                arf.aspectRatio = props.GetFloat("_aspectRatio", 1f);
            }
        }

        public static void ApplyLayoutGroupAlignment(HorizontalOrVerticalLayoutGroup lg, PropBag props, bool isRow)
        {
            string align = props.GetString("alignItems") ?? "flex-start";
            string justify = props.GetString("justifyContent") ?? "flex-start";

            int crossIdx = align switch { "center" => 1, "flex-end" => 2, _ => 0 };
            int mainIdx = justify switch { "center" => 1, "flex-end" => 2, _ => 0 };

            int row, col;
            if (isRow) { row = crossIdx; col = mainIdx; }
            else { row = mainIdx; col = crossIdx; }
            lg.childAlignment = (TextAnchor)(row * 3 + col);
        }

        public static void ApplyLayoutGroupPadding(HorizontalOrVerticalLayoutGroup lg, PropBag props)
        {
            ApplyLayoutGroupPadding((LayoutGroup)lg, props);
        }

        public static void ApplyLayoutGroupPadding(LayoutGroup lg, PropBag props)
        {
            var padding = props.GetFloatArray("padding");
            if (padding != null && padding.Length >= 4)
            {
                lg.padding = new RectOffset(
                    Mathf.RoundToInt(padding[3]),
                    Mathf.RoundToInt(padding[1]),
                    Mathf.RoundToInt(padding[0]),
                    Mathf.RoundToInt(padding[2])
                );
            }
        }

        public static void ApplyViewProps(GameObject go, PropBag props)
        {
            string tint = props.GetString("tint");
            if (!string.IsNullOrEmpty(tint))
            {
                go.AddComponent<CanvasRenderer>();
                var img = go.AddComponent<Image>();
                img.color = ParseHexColor(tint);
                img.raycastTarget = false;
            }
        }

        public static void ApplyImageProps(GameObject go, PropBag props, Func<string, Sprite> spriteLoader = null)
        {
            var img = go.GetComponent<Image>();
            if (img == null) return;

            string tint = props.GetString("tint");
            if (!string.IsNullOrEmpty(tint))
                img.color = ParseHexColor(tint);

            string src = props.GetString("src");
            if (!string.IsNullOrEmpty(src))
            {
                Sprite sprite = null;
                if (spriteLoader != null)
                    sprite = spriteLoader(src);
                else
                    sprite = AssetManager.LoadSprite(src);
                if (sprite != null) img.sprite = sprite;
            }

            // Image.Type: 0=Simple, 1=Sliced, 2=Tiled, 3=Filled
            int imageType = (int)props.GetFloat("_imageType", 0f);
            if (props.GetBool("_sliced", false)) imageType = 1;
            if (props.GetBool("_tiled", false)) imageType = 2;
            if (props.GetBool("_filled", false)) imageType = 3;
            img.type = (Image.Type)imageType;

            if (imageType == 3)
            {
                int fillMethod = (int)props.GetFloat("_fillMethod", (int)props.GetFloat("fillMethod", 4f));
                img.fillMethod = (Image.FillMethod)fillMethod;
                img.fillOrigin = (int)props.GetFloat("fillOrigin", 0f);
                img.fillAmount = props.GetFloat("fillAmount", 1f);
                bool clockwise = props.GetBool("_fillClockwise", true);
                img.fillClockwise = clockwise;
            }

            if (props.GetBool("preserveAspect", false))
                img.preserveAspect = true;

            img.raycastTarget = false;
        }

        public static void ApplyTextProps(GameObject go, PropBag props)
        {
            string text = props.GetString("text") ?? "";
            UIBridge.SetText(go, text);

            float fontSize = props.GetFloat("fontSize", 14f);
            UIBridge.SetFontSize(go, fontSize);

            string color = props.GetString("color");
            if (!string.IsNullOrEmpty(color))
            {
                Color c = ParseHexColor(color);
                UIBridge.SetTextColor(go, c.r, c.g, c.b, c.a);
            }

            bool bold = props.GetBool("bold", false);
            bool italic = props.GetBool("italic", false);
            if (bold || italic)
                UIBridge.SetTextStyle(go, bold, italic);

            // Horizontal + vertical alignment
            string hAlign = props.GetString("align") ?? "left";
            string vAlign = props.GetString("verticalAlign") ?? "top";
            int tmpAlignment = ResolveTMPAlignment(hAlign, vAlign);
            UIBridge.SetTextAlignment(go, tmpAlignment);

            // Overflow / wrapping
            bool wordWrap = props.GetBool("wordWrap", true);
            int maxLines = (int)props.GetFloat("maxLines", 0f);
            string overflow = props.GetString("overflow");
            if (overflow == "hidden" || overflow == "ellipsis" || !wordWrap || maxLines > 0)
                UIBridge.SetTextOverflow(go, wordWrap, maxLines);

            // RichText
            var textComp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (textComp != null)
            {
                textComp.raycastTarget = false;
                textComp.richText = props.GetBool("richText", true);

                float lineSpacing = props.GetFloat("lineSpacing", 0f);
                if (lineSpacing != 0f) textComp.lineSpacing = lineSpacing;

                bool autoSize = props.GetBool("autoSize", false);
                if (autoSize)
                {
                    textComp.enableAutoSizing = true;
                    float fontMin = props.GetFloat("fontSizeMin", 10f);
                    float fontMax = props.GetFloat("fontSizeMax", fontSize);
                    textComp.fontSizeMin = fontMin;
                    textComp.fontSizeMax = fontMax;
                }
            }
            var legacyText = go.GetComponent<Text>();
            if (legacyText != null) legacyText.raycastTarget = false;
        }

        private static int ResolveTMPAlignment(string hAlign, string vAlign)
        {
            // TMPro.TextAlignmentOptions bit flags: H bits (0-7), V bits (8-15)
            // Top=256, Middle=512, Bottom=1024; Left=1, Center=2, Right=4, Justified=8
            int h = hAlign switch
            {
                "center" => 2,
                "right" => 4,
                "justified" => 8,
                _ => 1 // left
            };
            int v = vAlign switch
            {
                "middle" => 512,
                "bottom" => 1024,
                _ => 256 // top
            };
            return h | v;
        }

        public static void ApplyDropdownProps(GameObject go, PropBag props)
        {
            var dd = go.GetComponent<TMPro.TMP_Dropdown>();
            if (dd == null) return;

            string tint = props.GetString("tint");
            if (!string.IsNullOrEmpty(tint))
            {
                var img = go.GetComponent<Image>();
                if (img != null) img.color = ParseHexColor(tint);
            }

            // Pre-populate options
            var optionsRaw = props.GetRaw("options");
            if (optionsRaw is List<object> optList)
            {
                dd.ClearOptions();
                var options = new List<TMPro.TMP_Dropdown.OptionData>();
                foreach (var opt in optList)
                {
                    options.Add(new TMPro.TMP_Dropdown.OptionData(opt?.ToString() ?? ""));
                }
                dd.AddOptions(options);
            }

            float fontSize = props.GetFloat("fontSize", 0f);
            if (fontSize > 0 && dd.captionText != null)
                dd.captionText.fontSize = fontSize;
        }

        public static void ApplyProgressProps(GameObject go, PropBag props, Func<string, Sprite> spriteLoader = null)
        {
            string tint = props.GetString("tint");
            if (!string.IsNullOrEmpty(tint))
            {
                var bgImg = go.GetComponent<Image>();
                if (bgImg != null) bgImg.color = ParseHexColor(tint);
            }

            string fillColor = props.GetString("fillColor");
            float value = props.GetFloat("value", 0f);

            var fillTransform = go.transform.Find(go.name + "/Fill");
            if (fillTransform == null)
            {
                for (int i = 0; i < go.transform.childCount; i++)
                {
                    var child = go.transform.GetChild(i);
                    if (child.name.Contains("Fill"))
                    {
                        fillTransform = child;
                        break;
                    }
                }
            }

            if (fillTransform != null)
            {
                var fillImg = fillTransform.GetComponent<Image>();
                if (fillImg != null)
                {
                    if (!string.IsNullOrEmpty(fillColor))
                        fillImg.color = ParseHexColor(fillColor);
                    fillImg.fillAmount = Mathf.Clamp01(value);
                }
            }

            string src = props.GetString("src");
            if (!string.IsNullOrEmpty(src) && spriteLoader != null)
            {
                var bgImg = go.GetComponent<Image>();
                var sprite = spriteLoader(src);
                if (sprite != null && bgImg != null) bgImg.sprite = sprite;
            }
        }

        public static void ApplyButtonProps(GameObject go, PropBag props, Func<string, Sprite> spriteLoader = null)
        {
            string text = props.GetString("text");
            if (!string.IsNullOrEmpty(text))
            {
                var label = go.transform.Find("Label");
                if (label != null) UIBridge.SetText(label.gameObject, text);
            }

            float fontSize = props.GetFloat("fontSize", 0f);
            if (fontSize > 0)
            {
                var label = go.transform.Find("Label");
                if (label != null) UIBridge.SetFontSize(label.gameObject, fontSize);
            }

            string tint = props.GetString("tint");
            if (!string.IsNullOrEmpty(tint))
            {
                var img = go.GetComponent<Image>();
                if (img != null) img.color = ParseHexColor(tint);
            }

            var btn = go.GetComponent<Button>();
            if (btn == null) return;

            bool disabled = props.GetBool("disabled", false);
            if (disabled) btn.interactable = false;

            // Transition mode: 0=None, 1=ColorTint(default), 2=SpriteSwap, 3=Animation
            int transition = (int)props.GetFloat("_transition", 1f);
            btn.transition = (Selectable.Transition)transition;

            if (transition == 1)
            {
                var colors = btn.colors;
                string nc = props.GetString("_normalColor");
                string hc = props.GetString("_highlightedColor");
                string pc = props.GetString("_pressedColor");
                string sc = props.GetString("_selectedColor");
                string dc = props.GetString("_disabledColor");
                if (!string.IsNullOrEmpty(nc)) colors.normalColor = ParseHexColor(nc);
                if (!string.IsNullOrEmpty(hc)) colors.highlightedColor = ParseHexColor(hc);
                if (!string.IsNullOrEmpty(pc)) colors.pressedColor = ParseHexColor(pc);
                if (!string.IsNullOrEmpty(sc)) colors.selectedColor = ParseHexColor(sc);
                if (!string.IsNullOrEmpty(dc)) colors.disabledColor = ParseHexColor(dc);
                colors.fadeDuration = props.GetFloat("_fadeDuration", 0.1f);
                btn.colors = colors;
            }
            else if (transition == 2 && spriteLoader != null)
            {
                var ss = new SpriteState();
                string hs = props.GetString("_highlightedSprite");
                string ps = props.GetString("_pressedSprite");
                string ses = props.GetString("_selectedSprite");
                string ds = props.GetString("_disabledSprite");
                if (!string.IsNullOrEmpty(hs)) ss.highlightedSprite = spriteLoader(hs);
                if (!string.IsNullOrEmpty(ps)) ss.pressedSprite = spriteLoader(ps);
                if (!string.IsNullOrEmpty(ses)) ss.selectedSprite = spriteLoader(ses);
                if (!string.IsNullOrEmpty(ds)) ss.disabledSprite = spriteLoader(ds);
                btn.spriteState = ss;
            }
        }

        public static void ApplyInputProps(GameObject go, PropBag props)
        {
            string value = props.GetString("value");
            if (!string.IsNullOrEmpty(value))
                UIBridge.SetInputText(go, value);

            int maxLen = (int)props.GetFloat("maxLength", 0f);
            if (maxLen > 0)
                UIBridge.SetInputMaxLength(go, maxLen);

            if (props.GetBool("password", false))
                UIBridge.SetInputPassword(go, true);
        }

        public static void ApplyToggleProps(GameObject go, PropBag props)
        {
            bool isChecked = props.GetBool("checked", false);
            UIBridge.SetToggleValue(go, isChecked);
        }

        public static void ApplySliderProps(GameObject go, PropBag props)
        {
            float min = props.GetFloat("min", 0f);
            float max = props.GetFloat("max", 1f);
            float value = props.GetFloat("value", 0f);
            UIBridge.SetSliderRange(go, min, max);
            UIBridge.SetSliderValue(go, value);
        }

        public static void ApplyScrollProps(GameObject go, PropBag props)
        {
            bool horizontal = props.GetBool("horizontal", false);
            bool vertical = props.GetBool("vertical", true);
            UIBridge.SetScrollDirection(go, horizontal, vertical);

            string tint = props.GetString("tint");
            if (!string.IsNullOrEmpty(tint))
            {
                var img = go.GetComponent<Image>();
                if (img != null) img.color = ParseHexColor(tint);
            }
        }

        public static void ApplyCommonProps(GameObject go, PropBag props, Func<string, Material> materialLoader = null)
        {
            bool visible = props.GetBool("visible", true);
            if (!visible) go.SetActive(false);

            float opacity = props.GetFloat("opacity", 1f);
            bool cgInteractable = props.GetBool("_canvasGroupInteractable", true);
            bool cgBlocksRaycasts = props.GetBool("_canvasGroupBlocksRaycasts", true);
            if (opacity < 1f || !cgInteractable || !cgBlocksRaycasts)
            {
                var cg = UIBridge.EnsureCanvasGroup(go);
                cg.alpha = opacity;
                cg.interactable = cgInteractable;
                cg.blocksRaycasts = cgBlocksRaycasts;
            }

            string overflow = props.GetString("overflow");
            if (overflow == "hidden")
            {
                bool isMaskImage = props.GetBool("_maskImage", false);
                if (isMaskImage)
                {
                    var maskImg = go.GetComponent<Image>();
                    if (maskImg == null)
                    {
                        maskImg = go.AddComponent<Image>();
                        maskImg.color = Color.white;
                    }
                    var mask = go.AddComponent<Mask>();
                    mask.showMaskGraphic = props.GetBool("_maskShowGraphic", true);
                }
                else
                {
                    UIBridge.SetOverflowHidden(go, true);
                }
            }

            string matName = props.GetString("_material");
            if (!string.IsNullOrEmpty(matName))
            {
                Material mat = materialLoader?.Invoke(matName);
                if (mat == null) mat = Resources.Load<Material>($"Materials/{matName}");
                if (mat != null)
                {
                    var graphic = go.GetComponent<Graphic>();
                    if (graphic != null) graphic.material = mat;
                }
            }

            // Shadow component
            var shadowObj = props.GetObject("_shadow");
            if (shadowObj != null)
            {
                var shadow = go.AddComponent<Shadow>();
                string sc = shadowObj.GetString("color");
                if (!string.IsNullOrEmpty(sc)) shadow.effectColor = ParseHexColor(sc);
                float sdx = shadowObj.GetFloat("distanceX", 1f);
                float sdy = shadowObj.GetFloat("distanceY", -1f);
                shadow.effectDistance = new Vector2(sdx, sdy);
            }

            // Outline component
            var outlineObj = props.GetObject("_outline");
            if (outlineObj != null)
            {
                var outline = go.AddComponent<Outline>();
                string oc = outlineObj.GetString("color");
                if (!string.IsNullOrEmpty(oc)) outline.effectColor = ParseHexColor(oc);
                float odx = outlineObj.GetFloat("distanceX", 1f);
                float ody = outlineObj.GetFloat("distanceY", -1f);
                outline.effectDistance = new Vector2(odx, ody);
            }

            // LayoutElement
            var leObj = props.GetObject("_layoutElement");
            if (leObj != null)
            {
                var le = go.AddComponent<LayoutElement>();
                if (leObj.Has("ignoreLayout")) le.ignoreLayout = leObj.GetBool("ignoreLayout", false);
                if (leObj.Has("minWidth")) le.minWidth = leObj.GetFloat("minWidth", -1f);
                if (leObj.Has("minHeight")) le.minHeight = leObj.GetFloat("minHeight", -1f);
                if (leObj.Has("preferredWidth")) le.preferredWidth = leObj.GetFloat("preferredWidth", -1f);
                if (leObj.Has("preferredHeight")) le.preferredHeight = leObj.GetFloat("preferredHeight", -1f);
                if (leObj.Has("flexibleWidth")) le.flexibleWidth = leObj.GetFloat("flexibleWidth", -1f);
                if (leObj.Has("flexibleHeight")) le.flexibleHeight = leObj.GetFloat("flexibleHeight", -1f);
            }
        }

        public static float GetResolvedWidth(RectTransform rt, PropBag props, float parentW)
        {
            if (props.Has("width")) return props.GetFloat("width", parentW);
            if (props.Has("left") && props.Has("right")) return parentW;
            return parentW;
        }

        public static float GetResolvedHeight(RectTransform rt, PropBag props, float parentH)
        {
            if (props.Has("height")) return props.GetFloat("height", parentH);
            if (props.Has("top") && props.Has("bottom")) return parentH;
            return parentH;
        }

        public static GameObject BuildNodeTree(
            TowerNode node,
            RectTransform parent,
            float parentW,
            float parentH,
            Dictionary<string, GameObject> namedNodes,
            Action<GameObject, string> onButtonCreated = null,
            Func<string, Sprite> spriteLoader = null,
            TMPro.TMP_FontAsset defaultFont = null,
            Dictionary<string, TowerNode> components = null)
        {
            if (node == null) return null;

            if (node.type == "$ref" && components != null)
            {
                string refName = node.props?.GetString("ref");
                if (!string.IsNullOrEmpty(refName) && components.TryGetValue(refName, out var refNode))
                {
                    var merged = new TowerNode
                    {
                        type = refNode.type,
                        props = refNode.props,
                        children = (node.children != null && node.children.Count > 0) ? node.children : refNode.children,
                    };
                    return BuildNodeTree(merged, parent, parentW, parentH, namedNodes, onButtonCreated, spriteLoader, defaultFont, components);
                }
            }

            GameObject go;
            switch (node.type)
            {
                case "ui-text":
                    go = UIBridge.CreateWithText(node.Name, parent);
                    if (defaultFont != null)
                    {
                        var tmpText = go.GetComponent<TMPro.TextMeshProUGUI>();
                        if (tmpText != null) tmpText.font = defaultFont;
                    }
                    ApplyTextProps(go, node.props);
                    break;
                case "ui-image":
                    if (node.props.GetBool("_rawImage", false))
                    {
                        go = UIBridge.CreateUIGameObject(node.Name, parent);
                        var rawImg = go.AddComponent<RawImage>();
                        string rawTint = node.props.GetString("tint");
                        if (!string.IsNullOrEmpty(rawTint)) rawImg.color = ParseHexColor(rawTint);
                        rawImg.raycastTarget = false;
                    }
                    else
                    {
                        go = UIBridge.CreateWithImage(node.Name, parent);
                        ApplyImageProps(go, node.props, spriteLoader);
                    }
                    break;
                case "ui-button":
                    go = UIBridge.CreateButton(node.Name, parent);
                    if (defaultFont != null)
                    {
                        var btnLabel = go.transform.Find("Label");
                        if (btnLabel != null)
                        {
                            var btnTmp = btnLabel.GetComponent<TMPro.TextMeshProUGUI>();
                            if (btnTmp != null) btnTmp.font = defaultFont;
                        }
                    }
                    ApplyButtonProps(go, node.props, spriteLoader);
                    onButtonCreated?.Invoke(go, node.props.GetString("name") ?? node.Name);
                    break;
                case "ui-input":
                    go = UIBridge.CreateInputField(node.Name, parent);
                    if (defaultFont != null)
                    {
                        foreach (var tmpComp in go.GetComponentsInChildren<TMPro.TextMeshProUGUI>(true))
                            tmpComp.font = defaultFont;
                    }
                    ApplyInputProps(go, node.props);
                    break;
                case "ui-toggle":
                    go = UIBridge.CreateToggle(node.Name, parent);
                    ApplyToggleProps(go, node.props);
                    break;
                case "ui-slider":
                    go = UIBridge.CreateSlider(node.Name, parent);
                    ApplySliderProps(go, node.props);
                    break;
                case "ui-scroll":
                    go = UIBridge.CreateScrollView(node.Name, parent);
                    ApplyScrollProps(go, node.props);
                    break;
                case "ui-dropdown":
                    go = UIBridge.CreateDropdown(node.Name, parent);
                    if (defaultFont != null)
                    {
                        foreach (var tmpComp in go.GetComponentsInChildren<TMPro.TextMeshProUGUI>(true))
                            tmpComp.font = defaultFont;
                    }
                    ApplyDropdownProps(go, node.props);
                    break;
                case "ui-progress":
                    go = UIBridge.CreateProgress(node.Name, parent);
                    ApplyProgressProps(go, node.props, spriteLoader);
                    break;
                default:
                    go = UIBridge.CreateUIGameObject(node.Name, parent);
                    ApplyViewProps(go, node.props);
                    break;
            }

            var rt = go.GetComponent<RectTransform>();
            ApplyLayout(rt, node.props, parentW, parentH);
            ApplyCommonProps(go, node.props);

            string nodeName = node.props.GetString("name") ?? node.Name;
            if (!string.IsNullOrEmpty(nodeName) && namedNodes != null)
                namedNodes[nodeName] = go;

            ApplyFlexLayout(go, node.props);

            if (node.children != null)
            {
                float myW = GetResolvedWidth(rt, node.props, parentW);
                float myH = GetResolvedHeight(rt, node.props, parentH);
                RectTransform childParent = rt;

                if (node.type == "ui-scroll")
                {
                    var scroll = go.GetComponent<ScrollRect>();
                    if (scroll != null && scroll.content != null)
                        childParent = scroll.content;
                }

                foreach (var child in node.children)
                {
                    BuildNodeTree(child, childParent, myW, myH, namedNodes, onButtonCreated, spriteLoader, defaultFont, components);
                }
            }

            return go;
        }

        public static int CountNodes(Transform t)
        {
            int count = 1;
            for (int i = 0; i < t.childCount; i++)
                count += CountNodes(t.GetChild(i));
            return count;
        }
    }

    public static class MiniJson
    {
        public static object Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            int idx = 0;
            return ParseValue(json, ref idx);
        }

        private static void SkipWhitespace(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWhitespace(s, ref i);
            if (i >= s.Length) return null;

            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (c == 't' || c == 'f') return ParseBool(s, ref i);
            if (c == 'n') { i += 4; return null; }
            return ParseNumber(s, ref i);
        }

        private static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            var dict = new Dictionary<string, object>();
            i++;
            SkipWhitespace(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return dict; }

            while (i < s.Length)
            {
                SkipWhitespace(s, ref i);
                string key = ParseString(s, ref i);
                SkipWhitespace(s, ref i);
                if (i < s.Length && s[i] == ':') i++;
                object val = ParseValue(s, ref i);
                dict[key] = val;
                SkipWhitespace(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; break; }
            }
            return dict;
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            var list = new List<object>();
            i++;
            SkipWhitespace(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return list; }

            while (i < s.Length)
            {
                object val = ParseValue(s, ref i);
                list.Add(val);
                SkipWhitespace(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; break; }
            }
            return list;
        }

        private static string ParseString(string s, ref int i)
        {
            if (i >= s.Length || s[i] != '"') return "";
            i++;
            var sb = new System.Text.StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"') break;
                if (c == '\\' && i < s.Length)
                {
                    char next = s[i++];
                    switch (next)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 <= s.Length)
                            {
                                string hex = s.Substring(i, 4);
                                sb.Append((char)int.Parse(hex, NumberStyles.HexNumber));
                                i += 4;
                            }
                            break;
                        default: sb.Append(next); break;
                    }
                }
                else sb.Append(c);
            }
            return sb.ToString();
        }

        private static object ParseNumber(string s, ref int i)
        {
            int start = i;
            if (i < s.Length && s[i] == '-') i++;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.')) i++;
            if (i < s.Length && (s[i] == 'e' || s[i] == 'E'))
            {
                i++;
                if (i < s.Length && (s[i] == '+' || s[i] == '-')) i++;
                while (i < s.Length && char.IsDigit(s[i])) i++;
            }
            string num = s.Substring(start, i - start);
            if (num.Contains('.') || num.Contains('e') || num.Contains('E'))
            {
                if (double.TryParse(num, NumberStyles.Float, CultureInfo.InvariantCulture, out double d))
                    return d;
            }
            if (long.TryParse(num, NumberStyles.Integer, CultureInfo.InvariantCulture, out long l))
                return l;
            return 0;
        }

        private static bool ParseBool(string s, ref int i)
        {
            if (i + 4 <= s.Length && s.Substring(i, 4) == "true") { i += 4; return true; }
            if (i + 5 <= s.Length && s.Substring(i, 5) == "false") { i += 5; return false; }
            return false;
        }
    }
}
