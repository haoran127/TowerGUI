import type { UINode } from './validator';

export interface SpriteAsset {
  path: string;
  slice?: [number, number, number, number];
}

export interface TowerDocumentMeta {
  name: string;
  designWidth: number;
  designHeight: number;
  source?: string;
}

export interface TowerDocumentAssets {
  spritePrefix?: string;
  sprites?: Record<string, SpriteAsset>;
}

export interface TowerDocument {
  $schema: 'tower-ui';
  version: '1.0';
  meta: TowerDocumentMeta;
  assets?: TowerDocumentAssets;
  components?: Record<string, UINode>;
  root: UINode;
}

export interface RefNode {
  type: '$ref';
  ref: string;
  props?: Record<string, any>;
  children?: (UINode | string)[];
}

export function isRefNode(node: UINode): node is RefNode & UINode {
  return node.type === '$ref' && typeof (node as any).ref === 'string';
}

export function resolveRef(
  node: UINode,
  components: Record<string, UINode> | undefined,
): UINode {
  if (!isRefNode(node) || !components) return node;

  const def = components[((node as any) as RefNode).ref];
  if (!def) return node;

  const merged: UINode = {
    type: def.type,
    props: { ...def.props, ...node.props },
    children: node.children && node.children.length > 0 ? node.children : def.children,
  };
  return merged;
}
