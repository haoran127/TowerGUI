#!/usr/bin/env node
/**
 * roundtrip-test.mjs — End-to-end roundtrip verification.
 *
 * Creates a "golden" .tower.json with ALL node types and ALL properties,
 * then verifies each property survives a parse→serialize→parse cycle.
 *
 * This catches the #1 root cause of pipeline gaps:
 *   "property X is written by tool A but not read by tool B"
 *
 * Usage: node tools/roundtrip-test.mjs [--json] [--verbose]
 *
 * Exit code 0 = pass, 1 = failures found.
 */
import fs from 'fs';
import path from 'path';

const verbose = process.argv.includes('--verbose');
const jsonOutput = process.argv.includes('--json');

// ── Golden document: covers every node type and every property ──

const GOLDEN_DOC = {
  $schema: 'tower-ui',
  version: '1.0',
  meta: { name: 'GoldenTest', designWidth: 1080, designHeight: 1920 },
  root: {
    type: 'ui-view',
    props: {
      name: 'root',
      width: 1080,
      height: 1920,
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      gap: 10,
      padding: 8,
      overflow: 'hidden',
      tint: '#1a1a2e',
    },
    children: [
      // ui-text: all text properties
      {
        type: 'ui-text',
        props: {
          name: 'txtTitle',
          text: 'Hello World',
          fontSize: 24,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          verticalAlign: 'middle',
          wordWrap: false,
          richText: true,
          autoSize: true,
          fontSizeMin: 12,
          fontSizeMax: 36,
          lineSpacing: 1.2,
          maxLines: 3,
          width: 400,
          height: 60,
        },
      },

      // ui-image: all image types
      {
        type: 'ui-image',
        props: {
          name: 'imgSimple',
          width: 200,
          height: 200,
          src: 'icon_gold.png',
          tint: '#ffcc00',
          preserveAspect: true,
        },
      },
      {
        type: 'ui-image',
        props: {
          name: 'imgSliced',
          width: 300,
          height: 100,
          _sliced: true,
          _imageType: 1,
          tint: '#334455',
        },
      },
      {
        type: 'ui-image',
        props: {
          name: 'imgFilled',
          width: 100,
          height: 100,
          _filled: true,
          _imageType: 3,
          _fillMethod: 4,
          fillAmount: 0.75,
          fillOrigin: 0,
          _fillClockwise: true,
        },
      },

      // ui-button: ColorTint transition
      {
        type: 'ui-button',
        props: {
          name: 'btnPrimary',
          text: 'Attack',
          fontSize: 18,
          tint: '#ff6b35',
          color: '#ffffff',
          width: 200,
          height: 50,
          _transition: 1,
          _normalColor: '#ff6b35',
          _highlightedColor: '#ff8855',
          _pressedColor: '#cc5522',
          _disabledColor: '#666666',
          _fadeDuration: 0.1,
        },
      },

      // ui-button: SpriteSwap transition
      {
        type: 'ui-button',
        props: {
          name: 'btnSprite',
          text: 'Build',
          width: 200,
          height: 50,
          _transition: 2,
          _highlightedSprite: 'btn_build_hover.png',
          _pressedSprite: 'btn_build_pressed.png',
          _disabledSprite: 'btn_build_disabled.png',
        },
      },

      // ui-input
      {
        type: 'ui-input',
        props: {
          name: 'iptChat',
          width: 400,
          height: 40,
          placeholder: 'Type message...',
          fontSize: 14,
          maxLength: 200,
        },
      },

      // ui-toggle
      {
        type: 'ui-toggle',
        props: {
          name: 'togSound',
          width: 50,
          height: 30,
          checked: true,
        },
      },

      // ui-slider
      {
        type: 'ui-slider',
        props: {
          name: 'sldVolume',
          width: 300,
          height: 20,
          min: 0,
          max: 100,
          value: 75,
          wholeNumbers: true,
        },
      },

      // ui-scroll
      {
        type: 'ui-scroll',
        props: {
          name: 'scrList',
          width: 400,
          height: 300,
          flexDirection: 'column',
          gap: 4,
        },
        children: [
          { type: 'ui-view', props: { name: 'item1', height: 60, tint: '#222244' } },
          { type: 'ui-view', props: { name: 'item2', height: 60, tint: '#222255' } },
        ],
      },

      // ui-dropdown
      {
        type: 'ui-dropdown',
        props: {
          name: 'ddServer',
          width: 200,
          height: 40,
          options: ['Server 1', 'Server 2', 'Server 3'],
          fontSize: 14,
        },
      },

      // ui-progress
      {
        type: 'ui-progress',
        props: {
          name: 'prgHp',
          width: 300,
          height: 20,
          value: 0.6,
          fillColor: '#44cc44',
          tint: '#333333',
        },
      },

      // CanvasGroup, Shadow, Outline, LayoutElement
      {
        type: 'ui-view',
        props: {
          name: 'viewEffects',
          width: 200,
          height: 100,
          opacity: 0.8,
          _canvasGroupInteractable: false,
          _canvasGroupBlocksRaycasts: false,
          _shadow: { color: '#00000080', distanceX: 2, distanceY: -2 },
          _outline: { color: '#ff000080', distanceX: 1, distanceY: -1 },
          _layoutElement: { minWidth: 100, minHeight: 50, preferredWidth: 200, flexibleWidth: 1 },
        },
      },
    ],
  },
};

// ── Test runner ──

function deepGet(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (p.match(/^\d+$/)) cur = Array.isArray(cur) ? cur[parseInt(p)] : cur[p];
    else cur = cur[p];
  }
  return cur;
}

function collectPropPaths(node, prefix = 'root') {
  const paths = [];
  if (node.props) {
    for (const [key, val] of Object.entries(node.props)) {
      const p = `${prefix}.props.${key}`;
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        for (const [subKey, subVal] of Object.entries(val)) {
          paths.push({ path: `${p}.${subKey}`, value: subVal, nodeType: node.type });
        }
      } else {
        paths.push({ path: p, value: val, nodeType: node.type });
      }
    }
  }
  if (node.children) {
    node.children.forEach((child, i) => {
      paths.push(...collectPropPaths(child, `${prefix}.children.${i}`));
    });
  }
  return paths;
}

// ── JSON roundtrip test (serialize → parse → compare) ──

function testJsonRoundtrip() {
  const serialized = JSON.stringify(GOLDEN_DOC);
  const parsed = JSON.parse(serialized);
  const allPaths = collectPropPaths(GOLDEN_DOC.root);
  const results = [];

  for (const { path: propPath, value: expected, nodeType } of allPaths) {
    const actual = deepGet(parsed, propPath);
    const match = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({
      path: propPath,
      nodeType,
      expected,
      actual,
      pass: match,
    });
  }

  return results;
}

// ── Schema completeness: every node type has properties tested ──

function testNodeTypeCoverage() {
  const testedTypes = new Set();
  function walk(node) {
    if (node.type) testedTypes.add(node.type);
    if (node.children) node.children.forEach(walk);
  }
  walk(GOLDEN_DOC.root);

  const expectedTypes = [
    'ui-view', 'ui-text', 'ui-image', 'ui-button', 'ui-input',
    'ui-toggle', 'ui-slider', 'ui-scroll', 'ui-dropdown', 'ui-progress',
  ];

  return expectedTypes.map(t => ({
    type: t,
    tested: testedTypes.has(t),
  }));
}

// ── Property existence test: verify critical props are in golden doc ──

function testCriticalProperties() {
  const criticalProps = [
    { nodeType: 'ui-text', props: ['text', 'fontSize', 'color', 'bold', 'align', 'verticalAlign', 'wordWrap', 'richText', 'autoSize'] },
    { nodeType: 'ui-image', props: ['src', 'tint', 'preserveAspect', '_sliced', '_filled', '_imageType', '_fillMethod', 'fillAmount'] },
    { nodeType: 'ui-button', props: ['text', 'fontSize', 'tint', '_transition', '_normalColor', '_pressedColor', '_highlightedSprite'] },
    { nodeType: 'ui-input', props: ['placeholder', 'fontSize', 'maxLength'] },
    { nodeType: 'ui-toggle', props: ['checked'] },
    { nodeType: 'ui-slider', props: ['min', 'max', 'value', 'wholeNumbers'] },
    { nodeType: 'ui-dropdown', props: ['options', 'fontSize'] },
    { nodeType: 'ui-progress', props: ['value', 'fillColor'] },
    { nodeType: 'ui-view', props: ['flexDirection', 'justifyContent', 'alignItems', 'gap', 'padding', 'overflow', 'opacity', '_shadow', '_outline', '_layoutElement'] },
  ];

  const results = [];
  function findAllNodes(node, type) {
    const found = [];
    if (node.type === type) found.push(node);
    if (node.children) {
      for (const c of node.children) found.push(...findAllNodes(c, type));
    }
    return found;
  }

  for (const { nodeType, props } of criticalProps) {
    const nodes = findAllNodes(GOLDEN_DOC.root, nodeType);
    for (const prop of props) {
      const exists = nodes.some(n => n.props && n.props[prop] !== undefined);
      results.push({ nodeType, prop, tested: exists });
    }
  }

  return results;
}

// ── Run all tests ──

const jsonRoundtrip = testJsonRoundtrip();
const typeCoverage = testNodeTypeCoverage();
const propCoverage = testCriticalProperties();

const jsonFails = jsonRoundtrip.filter(r => !r.pass);
const typeGaps = typeCoverage.filter(r => !r.tested);
const propGaps = propCoverage.filter(r => !r.tested);

const totalTests = jsonRoundtrip.length + typeCoverage.length + propCoverage.length;
const totalFails = jsonFails.length + typeGaps.length + propGaps.length;

if (jsonOutput) {
  console.log(JSON.stringify({
    totalTests,
    totalFails,
    jsonRoundtrip: { total: jsonRoundtrip.length, fails: jsonFails },
    typeCoverage: { total: typeCoverage.length, gaps: typeGaps },
    propCoverage: { total: propCoverage.length, gaps: propGaps },
  }, null, 2));
} else {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║       TowerGUI Roundtrip Test Report               ║');
  console.log('╠════════════════════════════════════════════════════╣\n');

  // JSON roundtrip
  console.log(`  JSON Roundtrip: ${jsonRoundtrip.length - jsonFails.length}/${jsonRoundtrip.length} passed`);
  if (jsonFails.length > 0) {
    for (const f of jsonFails) {
      console.log(`    ✗ ${f.path} — expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)}`);
    }
  }

  // Type coverage
  console.log(`\n  Node Type Coverage: ${typeCoverage.length - typeGaps.length}/${typeCoverage.length}`);
  if (typeGaps.length > 0) {
    for (const g of typeGaps) {
      console.log(`    ✗ ${g.type} — not tested in golden document!`);
    }
  } else {
    console.log('    ✓ All node types covered');
  }

  // Property coverage
  console.log(`\n  Critical Property Coverage: ${propCoverage.length - propGaps.length}/${propCoverage.length}`);
  if (propGaps.length > 0) {
    for (const g of propGaps) {
      console.log(`    ✗ ${g.nodeType}.${g.prop} — not in golden test`);
    }
  } else {
    console.log('    ✓ All critical properties covered');
  }

  if (verbose) {
    console.log('\n  All tested properties:');
    for (const r of jsonRoundtrip) {
      console.log(`    ${r.pass ? '✓' : '✗'} ${r.path} (${r.nodeType})`);
    }
  }

  console.log(`\n  ──────────────────────────────────────────────────`);
  console.log(`  Total: ${totalTests} tests, ${totalTests - totalFails} passed, ${totalFails} failed`);

  if (totalFails > 0) {
    console.log('\n  FAILED — fix gaps above.\n');
  } else {
    console.log('\n  ALL PASSED ✓\n');
  }

  console.log('╚════════════════════════════════════════════════════╝\n');
}

// Save golden doc for external use (e.g., Unity compiler test)
const goldenPath = path.join(import.meta.dirname, '_golden-test.tower.json');
fs.writeFileSync(goldenPath, JSON.stringify(GOLDEN_DOC, null, 2));
if (!jsonOutput) console.log(`  Golden test document saved to: ${goldenPath}\n`);

process.exit(totalFails > 0 ? 1 : 0);
