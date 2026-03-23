/**
 * Shared Prefab → JSON parsing library.
 * Extracted from prefab-to-json.mjs for reuse in mirror-prefabs.mjs and CLI.
 */
import fs from 'fs';
import path from 'path';

// ── Known Script GUIDs ──────────────────────────────────────────────────────

const GUID_TYPE = {
  // Image
  'fe87c0e1cc204ed48ad3b37840f39efc': 'Image',
  'd2b46571ab56b7f45a3dc3fdf63dd2cf': 'RawImage',
  // Text
  '5f7201a12d95ffc409449d95f23cf332': 'Text',
  '792c454b6129a5744aee99294403fd8c': 'TMP_Text',
  'f4688fdb7df04437aeb418b961361dc5': 'TMP_Text',
  // Layout
  '306cc8c2b49d7114eaa3623786fc2126': 'LayoutElement',
  '30649d3a9faa99c48a7b1166b86bf2a0': 'HorizontalLayoutGroup',
  '59f8146938fff824cb5fd77236b75b02': 'VerticalLayoutGroup',
  '59f8146938fff824cb5fd77236b75775': 'VerticalLayoutGroup',
  '8a8695521f0d02e499659fee002a26c2': 'GridLayoutGroup',
  '3245ec927659c4140ac4f8d17f92e8a2': 'ContentSizeFitter',
  '3245ec927659c4140ac4f8d17403cc18': 'ContentSizeFitter',
  // Mask / Scroll
  '1aa08ab6e0800fa44ae55d278d1b5e60': 'Mask',
  '31a19414c41e5ae4aae2af33fee712f6': 'Mask',
  '3312d7439a8b4e24a9e0992e25a4d640': 'RectMask2D',
  '3312d7739989d2b4e91e6319e9a96d76': 'RectMask2D',
  // Button / Toggle
  '4e29b1a8efbd4b44bb3f3716e73f07ff': 'Button',
  // ScrollRect
  '1aa08ab6e0800fa44ae55d278d1423e3': 'ScrollRect',
  // Slider / Dropdown / Input
  '2da0c512f12947e489f739b09a694c97': 'TMP_Dropdown',
  'aa2ebba87c8e4bba9d5a9c8e51fbd900': 'TMP_InputField',
  // Scrollbar / AspectRatioFitter / ToggleGroup
  '2a4db7a114972834c8e4f0fa715c0c0b': 'Scrollbar',
  '1d31c965b0e2cf94d8ea0e24cff3b484': 'AspectRatioFitter',
  '9085046f02a69544eb97fd06b6048fe2': 'Toggle',
  '2fafe2cfe61f6974895a912c3755e8f1': 'ToggleGroup',
  // Outline / Shadow (text effects)
  '19acc3e9e258ae84a93d5345c7aa580e': 'Outline',
  '6dd6e01b9f8432a418b8be3b5b1c8b3f': 'Shadow',
};

// ── YAML Parser (lightweight, Unity-specific) ───────────────────────────────

function parseUnityYaml(raw) {
  const docs = [];
  const parts = raw.split(/^--- !u!/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const m = part.match(/^(\d+)\s+&(\d+)\s*(stripped)?\s*\n([\s\S]*)$/);
    if (m) {
      docs.push({ typeId: m[1], fileId: m[2], stripped: !!m[3], body: m[4] });
    }
  }
  return docs;
}

function val(body, key) {
  const re = new RegExp(`^[ \\t]*${key}:[ \\t]*(.+)$`, 'm');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function textVal(body, key) {
  const raw = val(body, key);
  if (raw == null) return null;
  let s = raw;
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  } else if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1);
  }
  s = s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
  return s;
}

function vec2(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{x:\\s*([\\d.e+-]+),\\s*y:\\s*([\\d.e+-]+)\\}`, 'm');
  const m = body.match(re);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

function vec3(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{x:\\s*([\\d.e+-]+),\\s*y:\\s*([\\d.e+-]+),\\s*z:\\s*([\\d.e+-]+)\\}`, 'm');
  const m = body.match(re);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : null;
}

function vec4(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{x:\\s*([\\d.e+-]+),\\s*y:\\s*([\\d.e+-]+),\\s*z:\\s*([\\d.e+-]+),\\s*w:\\s*([\\d.e+-]+)\\}`, 'm');
  const m = body.match(re);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])] : null;
}

function color(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{r:\\s*([\\d.e+-]+),\\s*g:\\s*([\\d.e+-]+),\\s*b:\\s*([\\d.e+-]+),\\s*a:\\s*([\\d.e+-]+)\\}`, 'm');
  const m = body.match(re);
  if (!m) return null;
  const r = Math.round(parseFloat(m[1]) * 255);
  const g = Math.round(parseFloat(m[2]) * 255);
  const b = Math.round(parseFloat(m[3]) * 255);
  const a = Math.round(parseFloat(m[4]) * 255);
  return '#' + [r, g, b, a].map(v => v.toString(16).padStart(2, '0')).join('');
}

function fileRef(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{fileID:\\s*(-?\\d+)`, 'm');
  const m = body.match(re);
  return m ? m[1] : null;
}

function guidRef(body, key) {
  const re = new RegExp(`${key}:\\s*\\{[^}]*guid:\\s*([a-f0-9]+)`, 'm');
  const m = body.match(re);
  return m ? m[1] : null;
}

function childList(body) {
  const section = body.match(/m_Children:\s*\n((?:\s+-\s*\{[^\n]+\n)*)/);
  if (!section) {
    if (body.match(/m_Children:\s*\[\]/)) return [];
    return [];
  }
  const children = [];
  const re = /\{fileID:\s*(\d+)\}/g;
  let cm;
  while ((cm = re.exec(section[1])) !== null) children.push(cm[1]);
  return children;
}

function padding(body) {
  const l = val(body, 'm_Padding.m_Left') || val(body, 'm_Left');
  const r = val(body, 'm_Padding.m_Right') || val(body, 'm_Right');
  const t = val(body, 'm_Padding.m_Top') || val(body, 'm_Top');
  const b_ = val(body, 'm_Padding.m_Bottom') || val(body, 'm_Bottom');
  const padSection = body.match(/m_Padding:\s*\n((?:\s+m_\w+:[^\n]+\n)*)/);
  if (padSection) {
    return {
      left: parseInt(val(padSection[1], 'm_Left') || '0'),
      right: parseInt(val(padSection[1], 'm_Right') || '0'),
      top: parseInt(val(padSection[1], 'm_Top') || '0'),
      bottom: parseInt(val(padSection[1], 'm_Bottom') || '0'),
    };
  }
  if (l !== null) {
    return { left: parseInt(l), right: parseInt(r || '0'), top: parseInt(t || '0'), bottom: parseInt(b_ || '0') };
  }
  return null;
}

// ── Component Detection ─────────────────────────────────────────────────────

function detectComponent(doc) {
  const { body } = doc;
  const scriptGuid = guidRef(body, 'm_Script');

  if (scriptGuid && GUID_TYPE[scriptGuid]) {
    return extractComponent(GUID_TYPE[scriptGuid], body, scriptGuid);
  }

  if (body.includes('m_Sprite:') && body.includes('m_FillMethod:'))
    return extractComponent('Image', body, scriptGuid);
  if (body.includes('m_text:') && body.includes('m_fontSize:') && body.includes('m_fontColor:'))
    return extractComponent('TMP_Text', body, scriptGuid);
  if (body.includes('m_Text:') && body.includes('m_FontData:'))
    return extractComponent('Text', body, scriptGuid);
  if (body.includes('m_OnClick:') && body.includes('m_Navigation:') && body.includes('m_Transition:'))
    return extractComponent('Button', body, scriptGuid);
  if (body.includes('m_IsOn:') && body.includes('m_OnValueChanged:') && body.includes('m_Graphic:'))
    return extractComponent('Toggle', body, scriptGuid);
  if (body.includes('m_Content:') && body.includes('m_Horizontal:') && body.includes('m_Vertical:') && body.includes('m_Viewport:'))
    return extractComponent('ScrollRect', body, scriptGuid);
  if (body.includes('m_ChildAlignment:') && body.includes('m_Spacing:') && body.includes('m_ChildForceExpandWidth:')) {
    if (scriptGuid) console.error(`[prefab-parser] Unknown LayoutGroup GUID: ${scriptGuid} — defaulting to VerticalLayoutGroup. Add to GUID_TYPE if wrong.`);
    return extractComponent('VerticalLayoutGroup', body, scriptGuid);
  }
  if (body.includes('m_CellSize:') && body.includes('m_Constraint:'))
    return extractComponent('GridLayoutGroup', body, scriptGuid);
  if (body.includes('m_MinWidth:') && body.includes('m_PreferredWidth:') && body.includes('m_FlexibleWidth:'))
    return extractComponent('LayoutElement', body, scriptGuid);
  if (body.includes('m_HorizontalFit:') && body.includes('m_VerticalFit:'))
    return extractComponent('ContentSizeFitter', body, scriptGuid);
  if (body.includes('m_ShowMaskGraphic:'))
    return extractComponent('Mask', body, scriptGuid);
  if (body.includes('m_MinValue:') && body.includes('m_MaxValue:') && body.includes('m_WholeNumbers:'))
    return extractComponent('Slider', body, scriptGuid);
  if (body.includes('m_Options:') && body.includes('m_Template:') && body.includes('m_CaptionText:'))
    return extractComponent('Dropdown', body, scriptGuid);
  if (body.includes('m_CharacterLimit:') && body.includes('m_ContentType:') && body.includes('m_LineType:'))
    return extractComponent('InputField', body, scriptGuid);
  if (body.includes('m_Controller:') && body.includes('m_Enabled:') && doc.typeId === '95')
    return extractComponent('Animator', body, scriptGuid);
  if (body.includes('m_HandleRect:') && body.includes('m_Size:') && body.includes('m_NumberOfSteps:'))
    return extractComponent('Scrollbar', body, scriptGuid);
  if (body.includes('m_AspectMode:') && body.includes('m_AspectRatio:'))
    return extractComponent('AspectRatioFitter', body, scriptGuid);
  if (body.includes('m_AllowSwitchOff:') && !body.includes('m_IsOn:'))
    return extractComponent('ToggleGroup', body, scriptGuid);
  if (body.includes('m_EffectColor:') && body.includes('m_EffectDistance:'))
    return extractComponent(body.includes('m_UseGUILayout:') ? 'Outline' : 'Shadow', body, scriptGuid);

  const goId = fileRef(body, 'm_GameObject');
  if (!goId) return null;

  const fields = extractMonoBehaviourFields(body);
  return { type: 'MonoBehaviour', scriptGuid, gameObjectId: goId, fields };
}

function extractMonoBehaviourFields(body) {
  const fields = {};
  const lines = body.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s{2}(\w+):\s*(.+)$/);
    if (m && !m[1].startsWith('m_') && m[1] !== 'serializedVersion') {
      fields[m[1]] = m[2].trim();
    }
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

function extractComponent(type, body, scriptGuid) {
  const goId = fileRef(body, 'm_GameObject');
  const comp = { type, gameObjectId: goId };

  switch (type) {
    case 'Image': {
      comp.spriteGuid = guidRef(body, 'm_Sprite');
      comp.color = color(body, 'm_Color');
      comp.imageType = parseInt(val(body, 'm_Type') || '0');
      comp.raycast = val(body, 'm_RaycastTarget') !== '0';
      comp.fillAmount = parseFloat(val(body, 'm_FillAmount') || '1');
      comp.fillMethod = parseInt(val(body, 'm_FillMethod') || '4');
      comp.fillOrigin = parseInt(val(body, 'm_FillOrigin') || '0');
      comp.fillClockwise = val(body, 'm_FillClockwise') !== '0';
      comp.preserveAspect = val(body, 'm_PreserveAspect') === '1';
      break;
    }
    case 'RawImage': {
      comp.textureGuid = guidRef(body, 'm_Texture');
      comp.color = color(body, 'm_Color');
      comp.raycast = val(body, 'm_RaycastTarget') !== '0';
      break;
    }
    case 'TMP_Text': {
      comp.text = textVal(body, 'm_text') || '';
      comp.fontSize = parseFloat(val(body, 'm_fontSize') || '14');
      comp.color = color(body, 'm_fontColor');
      comp.fontStyle = parseInt(val(body, 'm_fontStyle') || '0');
      comp.hAlign = parseInt(val(body, 'm_HorizontalAlignment') || '1');
      comp.vAlign = parseInt(val(body, 'm_VerticalAlignment') || '256');
      comp.wordWrap = val(body, 'm_enableWordWrapping') === '1';
      comp.overflow = parseInt(val(body, 'm_overflowMode') || '0');
      comp.lineSpacing = parseFloat(val(body, 'm_lineSpacing') || '0');
      comp.autoSize = val(body, 'm_enableAutoSizing') === '1';
      comp.fontSizeMin = parseFloat(val(body, 'm_fontSizeMin') || '10');
      comp.fontSizeMax = parseFloat(val(body, 'm_fontSizeMax') || '40');
      comp.richText = val(body, 'm_isRichText') === '1';
      comp.raycast = val(body, 'm_RaycastTarget') !== '0';
      comp.fontAssetGuid = guidRef(body, 'm_fontAsset');
      const langId = val(body, 'languageId');
      if (langId) comp.languageId = parseInt(langId);
      break;
    }
    case 'Text': {
      comp.text = textVal(body, 'm_Text') || '';
      const fd = body.match(/m_FontData:\s*\n([\s\S]*?)(?=\n\s*m_\w+:|$)/);
      if (fd) {
        comp.fontSize = parseInt(val(fd[1], 'm_FontSize') || '14');
        comp.fontStyle = parseInt(val(fd[1], 'm_FontStyle') || '0');
        comp.alignment = parseInt(val(fd[1], 'm_Alignment') || '0');
      }
      comp.color = color(body, 'm_Color');
      comp.raycast = val(body, 'm_RaycastTarget') !== '0';
      break;
    }
    case 'Button': {
      comp.transition = parseInt(val(body, 'm_Transition') || '1');
      comp.interactable = val(body, 'm_Interactable') !== '0';
      // ColorBlock (transition=1 ColorTint)
      comp.normalColor = color(body, 'm_NormalColor') || color(body, 'm_Colors.m_NormalColor');
      comp.highlightedColor = color(body, 'm_HighlightedColor') || color(body, 'm_Colors.m_HighlightedColor');
      comp.pressedColor = color(body, 'm_PressedColor') || color(body, 'm_Colors.m_PressedColor');
      comp.selectedColor = color(body, 'm_SelectedColor') || color(body, 'm_Colors.m_SelectedColor');
      comp.disabledColor = color(body, 'm_DisabledColor') || color(body, 'm_Colors.m_DisabledColor');
      comp.colorMultiplier = parseFloat(val(body, 'm_ColorMultiplier') || '1');
      comp.fadeDuration = parseFloat(val(body, 'm_FadeDuration') || '0.1');
      // SpriteState (transition=2 SpriteSwap)
      comp.highlightedSprite = guidRef(body, 'm_HighlightedSprite');
      comp.pressedSprite = guidRef(body, 'm_PressedSprite');
      comp.selectedSprite = guidRef(body, 'm_SelectedSprite');
      comp.disabledSprite = guidRef(body, 'm_DisabledSprite');
      // AnimationTriggers (transition=3)
      const animNormal = val(body, 'm_NormalTrigger');
      const animHighlighted = val(body, 'm_HighlightedTrigger');
      const animPressed = val(body, 'm_PressedTrigger');
      const animDisabled = val(body, 'm_DisabledTrigger');
      if (animNormal || animHighlighted || animPressed || animDisabled) {
        comp.animTriggers = {
          normal: animNormal || 'Normal',
          highlighted: animHighlighted || 'Highlighted',
          pressed: animPressed || 'Pressed',
          disabled: animDisabled || 'Disabled',
        };
      }
      break;
    }
    case 'Toggle': { comp.isOn = val(body, 'm_IsOn') === '1'; break; }
    case 'ScrollRect': {
      comp.horizontal = val(body, 'm_Horizontal') === '1';
      comp.vertical = val(body, 'm_Vertical') === '1';
      comp.movementType = parseInt(val(body, 'm_MovementType') || '1');
      comp.elasticity = parseFloat(val(body, 'm_Elasticity') || '0.1');
      break;
    }
    case 'HorizontalLayoutGroup':
    case 'VerticalLayoutGroup':
    case 'LayoutGroup': {
      comp.spacing = parseFloat(val(body, 'm_Spacing') || '0');
      comp.childAlignment = parseInt(val(body, 'm_ChildAlignment') || '0');
      comp.padding = padding(body);
      comp.childForceExpandW = val(body, 'm_ChildForceExpandWidth') === '1';
      comp.childForceExpandH = val(body, 'm_ChildForceExpandHeight') === '1';
      comp.childControlW = val(body, 'm_ChildControlWidth') === '1';
      comp.childControlH = val(body, 'm_ChildControlHeight') === '1';
      break;
    }
    case 'GridLayoutGroup': {
      comp.cellSize = vec2(body, 'm_CellSize');
      comp.spacing = vec2(body, 'm_Spacing');
      comp.constraint = parseInt(val(body, 'm_Constraint') || '0');
      comp.constraintCount = parseInt(val(body, 'm_ConstraintCount') || '2');
      comp.childAlignment = parseInt(val(body, 'm_ChildAlignment') || '0');
      comp.padding = padding(body);
      break;
    }
    case 'LayoutElement': {
      comp.ignoreLayout = val(body, 'm_IgnoreLayout') === '1';
      comp.minWidth = parseFloat(val(body, 'm_MinWidth') || '-1');
      comp.minHeight = parseFloat(val(body, 'm_MinHeight') || '-1');
      comp.preferredWidth = parseFloat(val(body, 'm_PreferredWidth') || '-1');
      comp.preferredHeight = parseFloat(val(body, 'm_PreferredHeight') || '-1');
      comp.flexibleWidth = parseFloat(val(body, 'm_FlexibleWidth') || '-1');
      comp.flexibleHeight = parseFloat(val(body, 'm_FlexibleHeight') || '-1');
      break;
    }
    case 'ContentSizeFitter': {
      comp.horizontalFit = parseInt(val(body, 'm_HorizontalFit') || '0');
      comp.verticalFit = parseInt(val(body, 'm_VerticalFit') || '0');
      break;
    }
    case 'Slider': {
      comp.minValue = parseFloat(val(body, 'm_MinValue') || '0');
      comp.maxValue = parseFloat(val(body, 'm_MaxValue') || '1');
      comp.value = parseFloat(val(body, 'm_Value') || '0');
      comp.wholeNumbers = val(body, 'm_WholeNumbers') === '1';
      comp.direction = parseInt(val(body, 'm_Direction') || '0');
      comp.interactable = val(body, 'm_Interactable') !== '0';
      break;
    }
    case 'Dropdown':
    case 'TMP_Dropdown': {
      comp.value = parseInt(val(body, 'm_Value') || '0');
      comp.interactable = val(body, 'm_Interactable') !== '0';
      const optSection = body.match(/m_Options:\s*\n\s*m_Options:\s*\n([\s\S]*?)(?=\n\s{4}m_\w+:|\n\s{2}m_\w+:)/);
      if (optSection) {
        const opts = [];
        const optRe = /m_Text:\s*(.+)/g;
        let om;
        while ((om = optRe.exec(optSection[1])) !== null) {
          const t = om[1].trim().replace(/^"|"$/g, '');
          if (t) opts.push(t);
        }
        if (opts.length > 0) comp.options = opts;
      }
      break;
    }
    case 'InputField':
    case 'TMP_InputField': {
      comp.text = textVal(body, 'm_Text') || '';
      comp.characterLimit = parseInt(val(body, 'm_CharacterLimit') || '0');
      comp.contentType = parseInt(val(body, 'm_ContentType') || '0');
      comp.lineType = parseInt(val(body, 'm_LineType') || '0');
      comp.interactable = val(body, 'm_Interactable') !== '0';
      break;
    }
    case 'Animator': {
      comp.controllerGuid = guidRef(body, 'm_Controller');
      comp.applyRootMotion = val(body, 'm_ApplyRootMotion') === '1';
      comp.enabled = val(body, 'm_Enabled') !== '0';
      break;
    }
    case 'Mask': { comp.showMaskGraphic = val(body, 'm_ShowMaskGraphic') === '1'; break; }
    case 'RectMask2D': break;
    case 'Scrollbar': {
      comp.direction = parseInt(val(body, 'm_Direction') || '0');
      comp.value = parseFloat(val(body, 'm_Value') || '0');
      comp.size = parseFloat(val(body, 'm_Size') || '0.2');
      comp.numberOfSteps = parseInt(val(body, 'm_NumberOfSteps') || '0');
      comp.interactable = val(body, 'm_Interactable') !== '0';
      break;
    }
    case 'AspectRatioFitter': {
      comp.aspectMode = parseInt(val(body, 'm_AspectMode') || '0');
      comp.aspectRatio = parseFloat(val(body, 'm_AspectRatio') || '1');
      break;
    }
    case 'ToggleGroup': {
      comp.allowSwitchOff = val(body, 'm_AllowSwitchOff') === '1';
      break;
    }
    case 'Outline':
    case 'Shadow': {
      comp.effectColor = color(body, 'm_EffectColor');
      comp.effectDistance = vec2(body, 'm_EffectDistance');
      comp.useGraphicAlpha = val(body, 'm_UseGraphicAlpha') === '1';
      break;
    }
  }

  return comp;
}

// ── PrefabParser class ──────────────────────────────────────────────────────

export class PrefabParser {
  constructor(opts = {}) {
    this.guidToFile = new Map();
    this.parsedCache = new Map();
    this.quiet = opts.quiet || false;
    if (opts.projectRoot) this.buildGuidMap(opts.projectRoot);
  }

  buildGuidMap(root, { prefabOnly = false } = {}) {
    if (!root) return;
    const indexExts = prefabOnly
      ? ['.prefab.meta']
      : ['.prefab.meta', '.asset.meta', '.mat.meta', '.controller.meta', '.anim.meta', '.unity.meta'];
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!indexExts.some(ext => e.name.endsWith(ext))) continue;
        try {
          const meta = fs.readFileSync(full, 'utf-8');
          const m = meta.match(/^guid:\s*([a-f0-9]+)/m);
          if (m) this.guidToFile.set(m[1], full.replace(/\.meta$/, ''));
        } catch { /* skip */ }
      }
    };
    walk(root);
    if (!this.quiet) console.error(`[guid-map] Indexed ${this.guidToFile.size} asset GUIDs under ${root}`);
  }

  processPrefab(filePath) {
    const parsed = this._parsePrefabFile(filePath);
    const tree = this._buildTree(parsed);
    return tree;
  }

  _parsePrefabFile(filePath) {
    const absPath = path.resolve(filePath);
    if (this.parsedCache.has(absPath)) return this.parsedCache.get(absPath);

    if (!this.quiet) console.error(`[parse] ${path.basename(filePath)}`);
    const raw = fs.readFileSync(absPath, 'utf-8');
    const docs = parseUnityYaml(raw);

    const gameObjects = new Map();
    const rectTransforms = new Map();
    const components = new Map();
    const prefabInstances = [];
    const strippedRTs = new Map();

    for (const doc of docs) {
      const { typeId, fileId, stripped, body } = doc;

      if (stripped) {
        if (typeId === '224') {
          strippedRTs.set(fileId, {
            srcObj: fileRef(body, 'm_CorrespondingSourceObject'),
            srcGuid: guidRef(body, 'm_CorrespondingSourceObject'),
            prefabInst: fileRef(body, 'm_PrefabInstance'),
          });
        }
        continue;
      }

      if (typeId === '1') {
        const compList = [];
        const compSection = body.match(/m_Component:\s*\n((?:\s+-\s*[^\n]+\n)*)/);
        if (compSection) {
          const re = /\{[^}]*fileID:\s*(\d+)/g;
          let cm;
          while ((cm = re.exec(compSection[1])) !== null) compList.push(cm[1]);
        }
        gameObjects.set(fileId, {
          name: val(body, 'm_Name') || '',
          isActive: val(body, 'm_IsActive') !== '0',
          layer: parseInt(val(body, 'm_Layer') || '0'),
          components: compList,
        });
      } else if (typeId === '224') {
        const goId = fileRef(body, 'm_GameObject');
        rectTransforms.set(fileId, {
          gameObjectId: goId,
          anchorMin: vec2(body, 'm_AnchorMin'),
          anchorMax: vec2(body, 'm_AnchorMax'),
          anchoredPosition: vec2(body, 'm_AnchoredPosition'),
          sizeDelta: vec2(body, 'm_SizeDelta'),
          pivot: vec2(body, 'm_Pivot'),
          localScale: vec3(body, 'm_LocalScale'),
          localRotation: vec4(body, 'm_LocalRotation'),
          children: childList(body),
          father: fileRef(body, 'm_Father'),
          rootOrder: parseInt(val(body, 'm_RootOrder') || '0'),
        });
      } else if (typeId === '223') {
        const goId = fileRef(body, 'm_GameObject');
        components.set(fileId, {
          type: 'Canvas', gameObjectId: goId,
          renderMode: parseInt(val(body, 'm_RenderMode') || '0'),
          sortingOrder: parseInt(val(body, 'm_SortingOrder') || '0'),
        });
      } else if (typeId === '225') {
        const goId = fileRef(body, 'm_GameObject');
        components.set(fileId, {
          type: 'CanvasGroup', gameObjectId: goId,
          alpha: parseFloat(val(body, 'm_Alpha') || '1'),
          interactable: val(body, 'm_Interactable') !== '0',
          blocksRaycasts: val(body, 'm_BlocksRaycasts') !== '0',
        });
      } else if (typeId === '114') {
        const comp = detectComponent(doc);
        if (comp) components.set(fileId, comp);
      } else if (typeId === '1001') {
        const srcGuid = guidRef(body, 'm_SourcePrefab');
        const parentRT = fileRef(body, 'm_TransformParent');
        const mods = this._parseModifications(body);
        prefabInstances.push({ fileId, srcGuid, parentRT, mods });
      }
    }

    const result = { gameObjects, rectTransforms, components, prefabInstances, strippedRTs };
    this.parsedCache.set(absPath, result);
    return result;
  }

  _parseModifications(body) {
    const mods = [];
    const modSection = body.match(/m_Modifications:\s*\n([\s\S]*?)(?=\n\s*m_Removed|\n\s*m_Source)/);
    if (!modSection) return mods;
    const entries = modSection[1].split(/^\s*-\s+target:/m).filter(s => s.trim());
    for (const entry of entries) {
      const targetFileId = entry.match(/\{fileID:\s*(\d+)/)?.[1];
      const propPath = entry.match(/propertyPath:\s*(.+)/)?.[1]?.trim();
      const value = entry.match(/\n\s*value:\s*(.+)/)?.[1]?.trim();
      if (targetFileId && propPath) mods.push({ targetFileId, propPath, value: value || '' });
    }
    return mods;
  }

  _buildTree(parsed, resolveNested = true) {
    const { gameObjects, rectTransforms, components, prefabInstances, strippedRTs } = parsed;

    const rtByGo = new Map();
    for (const [rtId, rt] of rectTransforms) {
      if (rt.gameObjectId) rtByGo.set(rt.gameObjectId, rtId);
    }

    const compsByGo = new Map();
    for (const [, comp] of components) {
      if (!comp.gameObjectId) continue;
      if (!compsByGo.has(comp.gameObjectId)) compsByGo.set(comp.gameObjectId, []);
      compsByGo.get(comp.gameObjectId).push(comp);
    }

    const self = this;

    function buildNode(rtId, depth = 0) {
      const rt = rectTransforms.get(rtId);
      if (!rt) return null;

      const go = rt.gameObjectId ? gameObjects.get(rt.gameObjectId) : null;
      const name = go?.name || `RT_${rtId}`;
      const active = go?.isActive ?? true;
      const goComps = go ? (compsByGo.get(rt.gameObjectId) || []) : [];
      const uiComps = goComps
        .filter(c => c.type !== 'MonoBehaviour' || c.scriptGuid)
        .map(c => { const { gameObjectId, ...rest } = c; return rest; });

      const isIdentityScale = !rt.localScale || (rt.localScale[0] === 1 && rt.localScale[1] === 1 && rt.localScale[2] === 1);
      const node = {
        name, active,
        rect: { anchorMin: rt.anchorMin, anchorMax: rt.anchorMax, pos: rt.anchoredPosition, size: rt.sizeDelta, pivot: rt.pivot },
      };
      if (!isIdentityScale) node.rect.scale = rt.localScale;
      if (uiComps.length > 0) node.components = uiComps;

      const childRTs = rt.children
        .map(cid => ({ id: cid, rt: rectTransforms.get(cid) }))
        .filter(c => c.rt)
        .sort((a, b) => (a.rt.rootOrder || 0) - (b.rt.rootOrder || 0));

      const childNodes = [];
      for (const child of childRTs) {
        const childNode = buildNode(child.id, depth + 1);
        if (childNode) childNodes.push(childNode);
      }

      if (resolveNested) {
        for (const pi of prefabInstances) {
          if (pi.parentRT !== rtId) continue;
          const nestedTree = self._resolveNestedPrefab(pi);
          if (nestedTree) { childNodes.push(nestedTree); }
          else {
            childNodes.push({
              name: `[Nested:${pi.srcGuid?.substring(0, 8)}...]`, active: true,
              rect: { anchorMin: [0.5, 0.5], anchorMax: [0.5, 0.5], pos: [0, 0], size: [100, 100], pivot: [0.5, 0.5] },
              _unresolvedPrefab: pi.srcGuid,
            });
          }
        }

        for (const [srtId, srt] of strippedRTs) {
          if (!rt.children.includes(srtId)) continue;
          if (childNodes.some(c => c._strippedRtId === srtId)) continue;
          const nestedPI = prefabInstances.find(pi => pi.fileId === srt.prefabInst);
          if (nestedPI) {
            const nestedTree = self._resolveNestedPrefab(nestedPI);
            if (nestedTree) { nestedTree._strippedRtId = srtId; childNodes.push(nestedTree); continue; }
          }
          childNodes.push({
            name: `[StrippedRef:${srt.srcGuid?.substring(0, 8)}...]`, active: true,
            rect: { anchorMin: [0.5, 0.5], anchorMax: [0.5, 0.5], pos: [0, 0], size: [100, 100], pivot: [0.5, 0.5] },
            _strippedRtId: srtId,
          });
        }
      }

      if (childNodes.length > 0) node.children = childNodes;
      return node;
    }

    let rootRtId = null;
    for (const [rtId, rt] of rectTransforms) {
      if (!rt.father || rt.father === '0') { rootRtId = rtId; break; }
    }

    if (rootRtId) return buildNode(rootRtId);

    const roots = [];
    for (const [rtId, rt] of rectTransforms) {
      if (!rt.father || rt.father === '0') { const n = buildNode(rtId); if (n) roots.push(n); }
    }
    return roots.length === 1 ? roots[0] : { name: '__MultiRoot__', children: roots };
  }

  _resolveNestedPrefab(pi) {
    if (!pi.srcGuid || !this.guidToFile.has(pi.srcGuid)) return null;
    const srcFile = this.guidToFile.get(pi.srcGuid);
    try {
      const srcParsed = this._parsePrefabFile(srcFile);
      const tree = this._buildTree(srcParsed, true);
      if (tree && pi.mods.length > 0) this._applyModifications(tree, pi.mods, srcParsed);
      return tree;
    } catch (e) {
      if (!this.quiet) console.error(`  [warn] Failed to resolve nested prefab ${pi.srcGuid}: ${e.message}`);
      return null;
    }
  }

  _applyModifications(tree, mods, srcParsed) {
    const rtIdByFileId = new Map();
    for (const [rtId, rt] of srcParsed.rectTransforms) {
      rtIdByFileId.set(rtId, rt);
      if (rt.gameObjectId) rtIdByFileId.set(rt.gameObjectId, rt);
    }
    const nameNodeMap = new Map();
    function indexTree(node) { nameNodeMap.set(node.name, node); if (node.children) node.children.forEach(indexTree); }
    indexTree(tree);

    for (const mod of mods) {
      const rt = rtIdByFileId.get(mod.targetFileId);
      if (!rt) continue;
      const go = rt.gameObjectId ? srcParsed.gameObjects.get(rt.gameObjectId) : null;
      if (!go) continue;
      const node = nameNodeMap.get(go.name);
      if (!node) continue;
      const p = mod.propPath;
      const v = parseFloat(mod.value);
      if (p === 'm_AnchorMin.x' && node.rect.anchorMin) node.rect.anchorMin[0] = v;
      if (p === 'm_AnchorMin.y' && node.rect.anchorMin) node.rect.anchorMin[1] = v;
      if (p === 'm_AnchorMax.x' && node.rect.anchorMax) node.rect.anchorMax[0] = v;
      if (p === 'm_AnchorMax.y' && node.rect.anchorMax) node.rect.anchorMax[1] = v;
      if (p === 'm_AnchoredPosition.x' && node.rect.pos) node.rect.pos[0] = v;
      if (p === 'm_AnchoredPosition.y' && node.rect.pos) node.rect.pos[1] = v;
      if (p === 'm_SizeDelta.x' && node.rect.size) node.rect.size[0] = v;
      if (p === 'm_SizeDelta.y' && node.rect.size) node.rect.size[1] = v;
      if (p === 'm_Pivot.x' && node.rect.pivot) node.rect.pivot[0] = v;
      if (p === 'm_Pivot.y' && node.rect.pivot) node.rect.pivot[1] = v;
      if (p === 'm_IsActive') node.active = mod.value === '1';
      if (p === 'm_Name') node.name = mod.value;
    }
  }
}

export function findAssetsRoot(p) {
  let cur = path.resolve(p);
  while (cur !== path.dirname(cur)) {
    if (path.basename(cur) === 'Assets') return cur;
    cur = path.dirname(cur);
  }
  return null;
}

export function findPrefabsRecursive(dir, base) {
  base = base || dir;
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findPrefabsRecursive(full, base));
    else if (entry.name.endsWith('.prefab')) results.push({ abs: full, rel: path.relative(base, full) });
  }
  return results;
}
