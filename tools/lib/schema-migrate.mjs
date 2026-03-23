/**
 * Schema migration for .tower.json documents.
 * Applies sequential migrations to bring old documents to the current version.
 *
 * Usage:
 *   import { migrate } from './schema-migrate.mjs';
 *   const updated = migrate(doc); // doc is a parsed JSON object
 */

const CURRENT_VERSION = '1.1';

const MIGRATIONS = [
  {
    from: '1.0',
    to: '1.1',
    description: 'Add i18nKey support, _rawImage flag, _gridCell props, _csf/_arf layout, _maskImage',
    migrate(doc) {
      function walkNode(node) {
        if (!node) return;
        if (node.props) {
          // Ensure textOutline is an object, not a string
          if (typeof node.props.textOutline === 'string') {
            node.props.textOutline = { color: node.props.textOutline, width: 1 };
          }
          // Normalize textShadow from string to object
          if (typeof node.props.textShadow === 'string') {
            node.props.textShadow = { color: '#00000080', offsetX: 1, offsetY: -1 };
          }
        }
        if (node.children) node.children.forEach(walkNode);
      }
      walkNode(doc.root);
      doc.version = '1.1';
      return doc;
    },
  },
];

export function migrate(doc) {
  if (!doc) return doc;
  let version = doc.version || '1.0';

  for (const m of MIGRATIONS) {
    if (version === m.from) {
      doc = m.migrate(doc);
      version = m.to;
    }
  }

  doc.version = version;
  return doc;
}

export function needsMigration(doc) {
  return doc && (doc.version || '1.0') !== CURRENT_VERSION;
}

export { CURRENT_VERSION };
