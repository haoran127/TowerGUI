using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

namespace TowerUI
{
    public static class UIBridge
    {
        private static readonly Vector2 TopLeftAnchor = new Vector2(0, 1);
        private static Font _cachedFont;
        private static bool _useTMP;
        private static bool _tmpChecked;

        private static TMPro.TMP_FontAsset _tmpFont;

        private static bool UseTMP()
        {
            if (!_tmpChecked)
            {
                _tmpChecked = true;
                try
                {
                    _tmpFont = TMPro.TMP_Settings.defaultFontAsset;
                    if (_tmpFont == null)
                        _tmpFont = Resources.Load<TMPro.TMP_FontAsset>("Fonts & Materials/LiberationSans SDF");
                    _useTMP = _tmpFont != null;

                    if (_useTMP && _tmpFont != null)
                    {
                        AddCJKFallback(_tmpFont);
                    }
                }
                catch (System.Exception e)
                {
                    Debug.LogWarning($"[TowerUI] TMP init failed, falling back to Legacy Text: {e.Message}");
                    _useTMP = false;
                }
            }
            return _useTMP;
        }

        private static void AddCJKFallback(TMPro.TMP_FontAsset defaultFont)
        {
            Font font = Resources.Load<Font>("Fonts/simhei");
            if (font == null) font = Resources.Load<Font>("Fonts/msyh");
            if (font == null)
            {
                Debug.LogWarning("[TowerUI] No CJK font in Resources/Fonts/. Put simhei.ttf there.");
                return;
            }

            var cjkAsset = TMPro.TMP_FontAsset.CreateFontAsset(font);
            if (cjkAsset == null)
            {
                Debug.LogWarning("[TowerUI] Failed to create CJK TMP_FontAsset from " + font.name);
                return;
            }
            cjkAsset.name = "CJK-Dynamic";

            if (defaultFont.fallbackFontAssetTable == null)
                defaultFont.fallbackFontAssetTable = new List<TMPro.TMP_FontAsset>();
            defaultFont.fallbackFontAssetTable.Add(cjkAsset);
            Debug.Log($"[TowerUI] CJK fallback added: {font.name}");
        }

        // ── Create methods ─────────────────────────────────────

        public static GameObject CreateUIGameObject(string name, Transform parent)
        {
            var go = new GameObject(name ?? "UINode");
            var rt = go.AddComponent<RectTransform>();
            rt.anchorMin = TopLeftAnchor;
            rt.anchorMax = TopLeftAnchor;
            rt.pivot = TopLeftAnchor;
            if (parent != null)
                go.transform.SetParent(parent, false);
            return go;
        }

        public static GameObject CreateWithImage(string name, Transform parent)
        {
            var go = CreateUIGameObject(name, parent);
            go.AddComponent<CanvasRenderer>();
            go.AddComponent<Image>();
            return go;
        }

        public static GameObject CreateWithText(string name, Transform parent)
        {
            var go = CreateUIGameObject(name, parent);
            go.AddComponent<CanvasRenderer>();
            AddTextComponent(go);
            return go;
        }

        public static GameObject CreateButton(string name, Transform parent)
        {
            var go = CreateWithImage(name, parent);
            var btn = go.AddComponent<Button>();
            btn.transition = Selectable.Transition.ColorTint;

            var textGO = CreateWithText("Label", go.transform);
            var trt = textGO.GetComponent<RectTransform>();
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.pivot = new Vector2(0.5f, 0.5f);
            trt.offsetMin = Vector2.zero;
            trt.offsetMax = Vector2.zero;
            if (UseTMP())
                SetTextAlignment(textGO, (int)TMPro.TextAlignmentOptions.Center);
            else
                SetTextAlignment(textGO, 514);

            return go;
        }

        public static GameObject CreateInputField(string name, Transform parent)
        {
            var go = CreateWithImage(name, parent);
            var img = go.GetComponent<Image>();
            if (img != null) img.color = new Color(0.15f, 0.15f, 0.2f, 1f);

            var safeName = name ?? "Input";

            var textArea = CreateUIGameObject(safeName + "/TextArea", go.transform);
            var tart = textArea.GetComponent<RectTransform>();
            tart.anchorMin = Vector2.zero;
            tart.anchorMax = Vector2.one;
            tart.pivot = new Vector2(0.5f, 0.5f);
            tart.offsetMin = new Vector2(10, 6);
            tart.offsetMax = new Vector2(-10, -6);
            textArea.AddComponent<RectMask2D>();

            var textGO = CreateWithText(safeName + "/Text", textArea.transform);
            var txrt = textGO.GetComponent<RectTransform>();
            txrt.anchorMin = Vector2.zero;
            txrt.anchorMax = Vector2.one;
            txrt.pivot = new Vector2(0.5f, 0.5f);
            txrt.offsetMin = Vector2.zero;
            txrt.offsetMax = Vector2.zero;

            var phGO = CreateWithText(safeName + "/Placeholder", textArea.transform);
            var phrt = phGO.GetComponent<RectTransform>();
            phrt.anchorMin = Vector2.zero;
            phrt.anchorMax = Vector2.one;
            phrt.pivot = new Vector2(0.5f, 0.5f);
            phrt.offsetMin = Vector2.zero;
            phrt.offsetMax = Vector2.zero;
            SetTextColor(phGO, 0.5f, 0.5f, 0.6f, 1f);

            if (UseTMP())
            {
                var input = go.AddComponent<TMPro.TMP_InputField>();
                input.textViewport = tart;
                input.textComponent = textGO.GetComponent<TMPro.TextMeshProUGUI>();
                input.placeholder = phGO.GetComponent<TMPro.TextMeshProUGUI>();
                if (_tmpFont != null) input.fontAsset = _tmpFont;
            }
            else
            {
                var input = go.AddComponent<InputField>();
                input.textComponent = textGO.GetComponent<Text>();
                input.placeholder = phGO.GetComponent<Text>();
            }

            return go;
        }

        public static GameObject CreateToggle(string name, Transform parent)
        {
            var go = CreateUIGameObject(name, parent);
            var safeName = name ?? "Toggle";

            var bgGO = CreateWithImage(safeName + "/Background", go.transform);
            var bgrt = bgGO.GetComponent<RectTransform>();
            bgrt.anchorMin = new Vector2(0, 0.5f);
            bgrt.anchorMax = new Vector2(0, 0.5f);
            bgrt.pivot = new Vector2(0, 0.5f);
            bgrt.sizeDelta = new Vector2(30, 30);
            bgrt.anchoredPosition = new Vector2(4, 0);
            var bgImg = bgGO.GetComponent<Image>();
            if (bgImg != null) bgImg.color = new Color(0.3f, 0.3f, 0.4f, 1f);

            var checkGO = CreateWithImage(safeName + "/Checkmark", bgGO.transform);
            var ckrt = checkGO.GetComponent<RectTransform>();
            ckrt.anchorMin = new Vector2(0.1f, 0.1f);
            ckrt.anchorMax = new Vector2(0.9f, 0.9f);
            ckrt.pivot = new Vector2(0.5f, 0.5f);
            ckrt.offsetMin = Vector2.zero;
            ckrt.offsetMax = Vector2.zero;
            var ckImg = checkGO.GetComponent<Image>();
            if (ckImg != null) ckImg.color = new Color(0.3f, 0.9f, 0.4f, 1f);

            var toggle = go.AddComponent<Toggle>();
            toggle.targetGraphic = bgImg;
            toggle.graphic = ckImg;
            toggle.isOn = false;

            return go;
        }

        public static GameObject CreateSlider(string name, Transform parent)
        {
            var go = CreateUIGameObject(name, parent);
            var safeName = name ?? "Slider";

            var bgGO = CreateWithImage(safeName + "/Background", go.transform);
            var bgrt = bgGO.GetComponent<RectTransform>();
            bgrt.anchorMin = new Vector2(0, 0.25f);
            bgrt.anchorMax = new Vector2(1, 0.75f);
            bgrt.pivot = new Vector2(0.5f, 0.5f);
            bgrt.offsetMin = Vector2.zero;
            bgrt.offsetMax = Vector2.zero;
            var bgImg = bgGO.GetComponent<Image>();
            if (bgImg != null) bgImg.color = new Color(0.25f, 0.25f, 0.35f, 1f);

            var fillArea = CreateUIGameObject(safeName + "/FillArea", go.transform);
            var fart = fillArea.GetComponent<RectTransform>();
            fart.anchorMin = new Vector2(0, 0.25f);
            fart.anchorMax = new Vector2(1, 0.75f);
            fart.pivot = new Vector2(0.5f, 0.5f);
            fart.offsetMin = new Vector2(5, 0);
            fart.offsetMax = new Vector2(-5, 0);

            var fillGO = CreateWithImage(safeName + "/Fill", fillArea.transform);
            var flrt = fillGO.GetComponent<RectTransform>();
            flrt.anchorMin = Vector2.zero;
            flrt.anchorMax = Vector2.one;
            flrt.pivot = new Vector2(0.5f, 0.5f);
            flrt.offsetMin = Vector2.zero;
            flrt.offsetMax = Vector2.zero;
            var fillImg = fillGO.GetComponent<Image>();
            if (fillImg != null) fillImg.color = new Color(0.3f, 0.7f, 1f, 1f);

            var handleArea = CreateUIGameObject(safeName + "/HandleArea", go.transform);
            var hart = handleArea.GetComponent<RectTransform>();
            hart.anchorMin = Vector2.zero;
            hart.anchorMax = Vector2.one;
            hart.pivot = new Vector2(0.5f, 0.5f);
            hart.offsetMin = new Vector2(10, 0);
            hart.offsetMax = new Vector2(-10, 0);

            var handleGO = CreateWithImage(safeName + "/Handle", handleArea.transform);
            var hdrt = handleGO.GetComponent<RectTransform>();
            hdrt.sizeDelta = new Vector2(20, 0);
            hdrt.anchorMin = new Vector2(0, 0);
            hdrt.anchorMax = new Vector2(0, 1);
            hdrt.pivot = new Vector2(0.5f, 0.5f);
            var handleImg = handleGO.GetComponent<Image>();
            if (handleImg != null) handleImg.color = new Color(0.9f, 0.9f, 0.95f, 1f);

            var slider = go.AddComponent<Slider>();
            slider.fillRect = flrt;
            slider.handleRect = hdrt;
            slider.targetGraphic = handleImg;
            slider.direction = Slider.Direction.LeftToRight;
            slider.minValue = 0;
            slider.maxValue = 1;
            slider.value = 0;

            return go;
        }

        public static GameObject CreateDropdown(string name, Transform parent)
        {
            var go = CreateWithImage(name, parent);
            var bgImg = go.GetComponent<Image>();
            if (bgImg != null)
                bgImg.color = new Color(0.15f, 0.15f, 0.25f, 1f);

            var safeName = name ?? "Dropdown";

            var labelGO = new GameObject(safeName + "/Label");
            labelGO.transform.SetParent(go.transform, false);
            var labelRT = labelGO.AddComponent<RectTransform>();
            labelRT.anchorMin = Vector2.zero;
            labelRT.anchorMax = Vector2.one;
            labelRT.offsetMin = new Vector2(10, 0);
            labelRT.offsetMax = new Vector2(-30, 0);
            if (UseTMP())
            {
                var tmp = labelGO.AddComponent<TMPro.TextMeshProUGUI>();
                if (_tmpFont != null) tmp.font = _tmpFont;
                tmp.text = "Select...";
                tmp.fontSize = 14;
            }
            else
            {
                var txt = labelGO.AddComponent<Text>();
                txt.text = "Select...";
                txt.fontSize = 14;
                txt.color = Color.white;
            }

            var arrowGO = new GameObject(safeName + "/Arrow");
            arrowGO.transform.SetParent(go.transform, false);
            var arrowRT = arrowGO.AddComponent<RectTransform>();
            arrowRT.anchorMin = new Vector2(1, 0);
            arrowRT.anchorMax = new Vector2(1, 1);
            arrowRT.sizeDelta = new Vector2(24, 0);
            arrowRT.anchoredPosition = new Vector2(-12, 0);
            var arrowImg = arrowGO.AddComponent<Image>();
            arrowImg.color = new Color(0.6f, 0.6f, 0.7f, 1f);

            var tmplGO = CreateWithImage(safeName + "/Template", go.transform);
            tmplGO.SetActive(false);
            var tmplRT = tmplGO.GetComponent<RectTransform>();
            tmplRT.anchorMin = new Vector2(0, 0);
            tmplRT.anchorMax = new Vector2(1, 0);
            tmplRT.pivot = new Vector2(0.5f, 1f);
            tmplRT.sizeDelta = new Vector2(0, 150);
            var tmplImg = tmplGO.GetComponent<Image>();
            if (tmplImg != null) tmplImg.color = new Color(0.12f, 0.12f, 0.2f, 1f);
            var tmplScroll = tmplGO.AddComponent<ScrollRect>();

            var vpGO = CreateUIGameObject(safeName + "/Viewport", tmplGO.transform);
            var vpRT = vpGO.GetComponent<RectTransform>();
            vpRT.anchorMin = Vector2.zero;
            vpRT.anchorMax = Vector2.one;
            vpRT.offsetMin = Vector2.zero;
            vpRT.offsetMax = Vector2.zero;
            vpGO.AddComponent<RectMask2D>();

            var contentGO = CreateUIGameObject(safeName + "/Content", vpGO.transform);
            var contentRT = contentGO.GetComponent<RectTransform>();
            contentRT.anchorMin = new Vector2(0, 1);
            contentRT.anchorMax = new Vector2(1, 1);
            contentRT.pivot = new Vector2(0.5f, 1f);
            contentRT.sizeDelta = new Vector2(0, 28);

            tmplScroll.content = contentRT;
            tmplScroll.viewport = vpRT;
            tmplScroll.vertical = true;
            tmplScroll.horizontal = false;

            var itemGO = CreateWithImage("Item", contentGO.transform);
            var itemRT = itemGO.GetComponent<RectTransform>();
            itemRT.anchorMin = new Vector2(0, 0.5f);
            itemRT.anchorMax = new Vector2(1, 0.5f);
            itemRT.sizeDelta = new Vector2(0, 28);
            var itemToggle = itemGO.AddComponent<Toggle>();

            var itemLabelGO = new GameObject("Item Label");
            itemLabelGO.transform.SetParent(itemGO.transform, false);
            var itemLabelRT = itemLabelGO.AddComponent<RectTransform>();
            itemLabelRT.anchorMin = Vector2.zero;
            itemLabelRT.anchorMax = Vector2.one;
            itemLabelRT.offsetMin = new Vector2(10, 0);
            itemLabelRT.offsetMax = Vector2.zero;
            if (UseTMP())
            {
                var tmp = itemLabelGO.AddComponent<TMPro.TextMeshProUGUI>();
                if (_tmpFont != null) tmp.font = _tmpFont;
                tmp.fontSize = 14;
            }
            else
            {
                var txt = itemLabelGO.AddComponent<Text>();
                txt.fontSize = 14;
                txt.color = Color.white;
            }

            var dd = go.AddComponent<TMPro.TMP_Dropdown>();
            dd.template = tmplRT;
            dd.captionText = labelGO.GetComponent<TMPro.TextMeshProUGUI>();
            dd.itemText = itemLabelGO.GetComponent<TMPro.TextMeshProUGUI>();

            return go;
        }

        public static GameObject CreateProgress(string name, Transform parent)
        {
            var go = CreateWithImage(name, parent);
            var bgImg = go.GetComponent<Image>();
            if (bgImg != null) bgImg.color = new Color(0.2f, 0.2f, 0.3f, 1f);

            var fillGO = CreateWithImage((name ?? "Progress") + "/Fill", go.transform);
            var flrt = fillGO.GetComponent<RectTransform>();
            flrt.anchorMin = Vector2.zero;
            flrt.anchorMax = Vector2.one;
            flrt.pivot = new Vector2(0, 0.5f);
            flrt.offsetMin = Vector2.zero;
            flrt.offsetMax = Vector2.zero;
            var fillImg = fillGO.GetComponent<Image>();
            if (fillImg != null)
            {
                fillImg.color = new Color(0.3f, 0.8f, 0.4f, 1f);
                fillImg.type = Image.Type.Filled;
                fillImg.fillMethod = Image.FillMethod.Horizontal;
                fillImg.fillAmount = 0f;
            }

            return go;
        }

        public static GameObject CreateScrollView(string name, Transform parent)
        {
            var go = CreateWithImage(name, parent);
            var bgImg = go.GetComponent<Image>();
            if (bgImg != null) bgImg.color = new Color(0.1f, 0.1f, 0.15f, 0.5f);

            var safeName = name ?? "Scroll";

            var viewport = CreateUIGameObject(safeName + "/Viewport", go.transform);
            var vprt = viewport.GetComponent<RectTransform>();
            vprt.anchorMin = Vector2.zero;
            vprt.anchorMax = Vector2.one;
            vprt.pivot = TopLeftAnchor;
            vprt.offsetMin = Vector2.zero;
            vprt.offsetMax = Vector2.zero;
            viewport.AddComponent<RectMask2D>();
            viewport.AddComponent<Image>().color = Color.clear;

            var content = CreateUIGameObject(safeName + "/Content", viewport.transform);
            var crt = content.GetComponent<RectTransform>();
            crt.anchorMin = TopLeftAnchor;
            crt.anchorMax = new Vector2(1, 1);
            crt.pivot = TopLeftAnchor;
            crt.sizeDelta = new Vector2(0, 300);

            var scroll = go.AddComponent<ScrollRect>();
            scroll.content = crt;
            scroll.viewport = vprt;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.inertia = true;
            scroll.decelerationRate = 0.135f;

            return go;
        }

        // ── Position / Size ────────────────────────────────────

        public static void SetPosition(RectTransform rt, float x, float y)
        {
            if (rt == null) return;
            rt.anchoredPosition = new Vector2(x, y);
        }

        public static void SetSize(RectTransform rt, float w, float h)
        {
            if (rt == null) return;
            rt.sizeDelta = new Vector2(Mathf.Max(0, w), Mathf.Max(0, h));
        }

        public static void SetAnchors(RectTransform rt, float minX, float minY, float maxX, float maxY)
        {
            if (rt == null) return;
            rt.anchorMin = new Vector2(minX, minY);
            rt.anchorMax = new Vector2(maxX, maxY);
        }

        public static void SetPivot(RectTransform rt, float x, float y)
        {
            if (rt == null) return;
            rt.pivot = new Vector2(x, y);
        }

        public static void SetScale(Transform t, float x, float y, float z)
        {
            if (t == null) return;
            t.localScale = new Vector3(x, y, z);
        }

        public static void SetRotation(Transform t, float x, float y, float z)
        {
            if (t == null) return;
            t.localEulerAngles = new Vector3(x, y, z);
        }

        public static void SetActive(GameObject go, bool active)
        {
            if (go == null) return;
            go.SetActive(active);
        }

        // ── Color ──────────────────────────────────────────────

        public static void SetColor(Graphic graphic, float r, float g, float b, float a)
        {
            if (graphic == null) return;
            graphic.color = new Color(
                Mathf.Clamp01(r), Mathf.Clamp01(g),
                Mathf.Clamp01(b), Mathf.Clamp01(a));
        }

        // ── Text ───────────────────────────────────────────────

        public static void SetText(GameObject go, string text)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (tmp != null) { tmp.text = text ?? ""; return; }
            var legacy = go.GetComponent<Text>();
            if (legacy != null) legacy.text = text ?? "";
        }

        public static void SetFontSize(GameObject go, float size)
        {
            if (go == null) return;
            size = Mathf.Max(1f, size);
            var tmp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (tmp != null) { tmp.fontSize = size; return; }
            var legacy = go.GetComponent<Text>();
            if (legacy != null) legacy.fontSize = Mathf.RoundToInt(size);
        }

        public static void SetTextColor(GameObject go, float r, float g, float b, float a)
        {
            if (go == null) return;
            var color = new Color(Mathf.Clamp01(r), Mathf.Clamp01(g), Mathf.Clamp01(b), Mathf.Clamp01(a));
            var tmp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (tmp != null) { tmp.color = color; return; }
            var legacy = go.GetComponent<Text>();
            if (legacy != null) legacy.color = color;
        }

        public static void SetTextAlignment(GameObject go, int alignment)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (tmp != null) { tmp.alignment = (TMPro.TextAlignmentOptions)alignment; return; }
            var legacy = go.GetComponent<Text>();
            if (legacy != null)
            {
                legacy.alignment = MapTmpAlignToTextAnchor(alignment);
            }
        }

        private static TextAnchor MapTmpAlignToTextAnchor(int tmpAlign)
        {
            // TMP TextAlignmentOptions: Left=257, Center=514, Right=516, Justified=520
            // Top variants: 257,258,260,264  Middle: 512,514,516,520  Bottom: 1024,1026,1028,1032
            bool isTop = tmpAlign >= 256 && tmpAlign < 512;
            bool isMiddle = tmpAlign >= 512 && tmpAlign < 1024;
            // else bottom
            int hBits = tmpAlign & 0xF;
            // 1=Left, 2=Center, 4=Right, 8=Justified→Left
            bool isLeft = hBits == 1 || hBits == 8;
            bool isCenter = hBits == 2;
            // else right

            if (isTop)
            {
                if (isLeft) return TextAnchor.UpperLeft;
                if (isCenter) return TextAnchor.UpperCenter;
                return TextAnchor.UpperRight;
            }
            if (isMiddle)
            {
                if (isLeft) return TextAnchor.MiddleLeft;
                if (isCenter) return TextAnchor.MiddleCenter;
                return TextAnchor.MiddleRight;
            }
            // Bottom
            if (isLeft) return TextAnchor.LowerLeft;
            if (isCenter) return TextAnchor.LowerCenter;
            return TextAnchor.LowerRight;
        }

        public static void SetTextOverflow(GameObject go, bool wrap, int maxLines)
        {
            if (go == null) return;
            maxLines = Mathf.Max(0, maxLines);
            var tmp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (tmp != null)
            {
                tmp.textWrappingMode = wrap ? TMPro.TextWrappingModes.Normal : TMPro.TextWrappingModes.NoWrap;
                tmp.maxVisibleLines = maxLines > 0 ? maxLines : int.MaxValue;
                tmp.overflowMode = wrap ? TMPro.TextOverflowModes.Truncate : TMPro.TextOverflowModes.Overflow;
                return;
            }
            var legacy = go.GetComponent<Text>();
            if (legacy != null)
            {
                legacy.horizontalOverflow = wrap ? HorizontalWrapMode.Wrap : HorizontalWrapMode.Overflow;
                legacy.verticalOverflow = wrap ? VerticalWrapMode.Truncate : VerticalWrapMode.Overflow;
            }
        }

        public static void SetTextStyle(GameObject go, bool bold, bool italic)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TextMeshProUGUI>();
            if (tmp != null)
            {
                var style = TMPro.FontStyles.Normal;
                if (bold) style |= TMPro.FontStyles.Bold;
                if (italic) style |= TMPro.FontStyles.Italic;
                tmp.fontStyle = style;
                return;
            }
            var legacy = go.GetComponent<Text>();
            if (legacy != null)
            {
                var style = FontStyle.Normal;
                if (bold && italic) style = FontStyle.BoldAndItalic;
                else if (bold) style = FontStyle.Bold;
                else if (italic) style = FontStyle.Italic;
                legacy.fontStyle = style;
            }
        }

        // ── Image ──────────────────────────────────────────────

        public static void SetImageType(GameObject go, int type)
        {
            if (go == null) return;
            var img = go.GetComponent<Image>();
            if (img != null) img.type = (Image.Type)type;
        }

        public static void SetImageFill(GameObject go, int method, float amount, int origin)
        {
            if (go == null) return;
            var img = go.GetComponent<Image>();
            if (img == null) return;
            img.type = Image.Type.Filled;
            img.fillMethod = (Image.FillMethod)Mathf.Clamp(method, 0, 4);
            img.fillAmount = Mathf.Clamp01(amount);
            img.fillOrigin = Mathf.Clamp(origin, 0, 3);
        }

        public static void SetImageSprite(GameObject go, Sprite sprite)
        {
            if (go == null) return;
            var img = go.GetComponent<Image>();
            if (img != null) img.sprite = sprite;
        }

        // ── Input ──────────────────────────────────────────────

        public static void SetInputText(GameObject go, string text)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null) { tmp.text = text ?? ""; return; }
            var legacy = go.GetComponent<InputField>();
            if (legacy != null) legacy.text = text ?? "";
        }

        public static string GetInputText(GameObject go)
        {
            if (go == null) return "";
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null) return tmp.text ?? "";
            var legacy = go.GetComponent<InputField>();
            if (legacy != null) return legacy.text ?? "";
            return "";
        }

        public static void SetInputPlaceholder(GameObject go, string text)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null)
            {
                var ph = tmp.placeholder as TMPro.TextMeshProUGUI;
                if (ph != null) ph.text = text ?? "";
                return;
            }
            var legacy = go.GetComponent<InputField>();
            if (legacy != null)
            {
                var ph = legacy.placeholder as Text;
                if (ph != null) ph.text = text ?? "";
            }
        }

        public static void SetInputPassword(GameObject go, bool isPassword)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null)
            {
                tmp.contentType = isPassword
                    ? TMPro.TMP_InputField.ContentType.Password
                    : TMPro.TMP_InputField.ContentType.Standard;
                return;
            }
            var legacy = go.GetComponent<InputField>();
            if (legacy != null)
            {
                legacy.contentType = isPassword
                    ? InputField.ContentType.Password
                    : InputField.ContentType.Standard;
            }
        }

        public static void SetInputMaxLength(GameObject go, int maxLength)
        {
            if (go == null) return;
            maxLength = Mathf.Max(0, maxLength);
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null) { tmp.characterLimit = maxLength; return; }
            var legacy = go.GetComponent<InputField>();
            if (legacy != null) legacy.characterLimit = maxLength;
        }

        public static void SetInputReadOnly(GameObject go, bool readOnly)
        {
            if (go == null) return;
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null) { tmp.readOnly = readOnly; return; }
            var legacy = go.GetComponent<InputField>();
            if (legacy != null) legacy.readOnly = readOnly;
        }

        // ── Toggle ─────────────────────────────────────────────

        public static void SetToggleValue(GameObject go, bool isOn)
        {
            if (go == null) return;
            var toggle = go.GetComponent<Toggle>();
            if (toggle != null) toggle.isOn = isOn;
        }

        public static bool GetToggleValue(GameObject go)
        {
            if (go == null) return false;
            var toggle = go.GetComponent<Toggle>();
            return toggle != null && toggle.isOn;
        }

        // ── Slider ─────────────────────────────────────────────

        public static void SetSliderValue(GameObject go, float value)
        {
            if (go == null) return;
            var slider = go.GetComponent<Slider>();
            if (slider != null) slider.value = Mathf.Clamp(value, slider.minValue, slider.maxValue);
        }

        public static void SetSliderRange(GameObject go, float min, float max)
        {
            if (go == null) return;
            var slider = go.GetComponent<Slider>();
            if (slider == null) return;
            if (max <= min) max = min + 0.001f;
            slider.minValue = min;
            slider.maxValue = max;
        }

        public static float GetSliderValue(GameObject go)
        {
            if (go == null) return 0f;
            var slider = go.GetComponent<Slider>();
            return slider != null ? slider.value : 0f;
        }

        // ── Progress ───────────────────────────────────────────

        public static void SetProgressValue(GameObject go, float value, float max)
        {
            if (go == null) return;
            Transform fill = null;
            if (go.transform.childCount > 0)
                fill = go.transform.GetChild(0);
            if (fill == null) return;
            var img = fill.GetComponent<Image>();
            if (img != null) img.fillAmount = max > 0f ? Mathf.Clamp01(value / max) : 0f;
        }

        public static void SetProgressBarColor(GameObject go, float r, float g, float b, float a)
        {
            if (go == null) return;
            Transform fill = null;
            if (go.transform.childCount > 0)
                fill = go.transform.GetChild(0);
            if (fill == null) return;
            var img = fill.GetComponent<Image>();
            if (img != null) img.color = new Color(
                Mathf.Clamp01(r), Mathf.Clamp01(g),
                Mathf.Clamp01(b), Mathf.Clamp01(a));
        }

        // ── ScrollRect ─────────────────────────────────────────

        public static void SetScrollDirection(GameObject go, bool horizontal, bool vertical)
        {
            if (go == null) return;
            var scroll = go.GetComponent<ScrollRect>();
            if (scroll == null) return;
            scroll.horizontal = horizontal;
            scroll.vertical = vertical;
        }

        public static ScrollRect GetScrollRect(GameObject go)
        {
            if (go == null) return null;
            return go.GetComponent<ScrollRect>();
        }

        public static void SetScrollPosition(GameObject go, float x, float y)
        {
            if (go == null) return;
            var scroll = go.GetComponent<ScrollRect>();
            if (scroll == null || scroll.content == null) return;
            scroll.content.anchoredPosition = new Vector2(-x, y);
        }

        public static float[] GetScrollContentSize(GameObject go)
        {
            if (go == null) return new float[] { 0, 0 };
            var scroll = go.GetComponent<ScrollRect>();
            if (scroll == null || scroll.content == null) return new float[] { 0, 0 };
            var size = scroll.content.sizeDelta;
            return new float[] { size.x, size.y };
        }

        // ── CanvasGroup ───────────────────────────────────────

        public static CanvasGroup EnsureCanvasGroup(GameObject go)
        {
            if (go == null) return null;
            var cg = go.GetComponent<CanvasGroup>();
            if (cg == null) cg = go.AddComponent<CanvasGroup>();
            return cg;
        }

        // ── Overflow / Clipping ────────────────────────────────

        public static void SetOverflowHidden(GameObject go, bool hidden)
        {
            if (go == null) return;
            var mask = go.GetComponent<RectMask2D>();
            if (hidden && mask == null)
                go.AddComponent<RectMask2D>();
            else if (!hidden && mask != null)
                Object.Destroy(mask);
        }

        // ── Events ─────────────────────────────────────────────

        public static UIEventReceiver EnsureEventReceiver(GameObject go)
        {
            if (go == null) return null;
            var receiver = go.GetComponent<UIEventReceiver>();
            if (receiver == null)
            {
                receiver = go.AddComponent<UIEventReceiver>();
                var img = go.GetComponent<Image>();
                if (img != null) img.raycastTarget = true;
            }
            return receiver;
        }

        // ── Utility ────────────────────────────────────────────

        public static float GetTimeMs()
        {
            return Time.realtimeSinceStartup * 1000f;
        }

        private static void AddTextComponent(GameObject go)
        {
            if (UseTMP())
            {
                var tmp = go.AddComponent<TMPro.TextMeshProUGUI>();
                if (_tmpFont != null) tmp.font = _tmpFont;
                tmp.fontSize = 16;
                tmp.textWrappingMode = TMPro.TextWrappingModes.NoWrap;
                tmp.overflowMode = TMPro.TextOverflowModes.Overflow;
            }
            else
            {
                var text = go.AddComponent<Text>();
                text.font = GetDefaultFont();
                text.fontSize = 16;
                text.horizontalOverflow = HorizontalWrapMode.Overflow;
                text.verticalOverflow = VerticalWrapMode.Overflow;
            }
        }

        private static Font GetDefaultFont()
        {
            if (_cachedFont != null) return _cachedFont;
            _cachedFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (_cachedFont == null)
            {
                try { _cachedFont = Font.CreateDynamicFontFromOSFont("Arial", 16); }
                catch { /* fallback — no font available */ }
            }
            if (_cachedFont == null)
                Debug.LogWarning("[TowerUI] No default font found. Text may not render.");
            return _cachedFont;
        }
    }
}
