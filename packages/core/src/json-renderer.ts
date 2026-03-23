import React, { type ReactNode } from 'react';
import { render, type TowerUIRoot, type RenderOptions } from './render';
import type { IEngineAdapter } from './IEngineAdapter';

interface UINode {
  type: string;
  props?: Record<string, any>;
  children?: (UINode | string)[];
}

interface TowerDocument {
  $schema: 'tower-ui';
  version: '1.0';
  meta: {
    name: string;
    designWidth: number;
    designHeight: number;
    source?: string;
  };
  assets?: {
    spritePrefix?: string;
    sprites?: Record<string, { path: string; slice?: [number, number, number, number] }>;
  };
  components?: Record<string, UINode>;
  root: UINode;
}

function isRefNode(node: UINode): boolean {
  return node.type === '$ref' && typeof (node as any).ref === 'string';
}

function resolveNode(
  node: UINode | string,
  components: Record<string, UINode> | undefined,
  assets: TowerDocument['assets'],
): ReactNode {
  if (typeof node === 'string') return node;

  let resolved = node;
  if (isRefNode(node)) {
    const refName = (node as any).ref as string;
    const def = components?.[refName];
    if (def) {
      resolved = {
        type: def.type,
        props: { ...def.props, ...node.props },
        children: node.children && node.children.length > 0 ? node.children : def.children,
      };
    }
  }

  const { type, props: rawProps, children } = resolved;
  const props: Record<string, any> = { ...rawProps };

  if (assets?.sprites && type === 'ui-image' && props.src) {
    const spriteInfo = assets.sprites[props.src];
    if (spriteInfo) {
      props.src = spriteInfo.path;
      if (spriteInfo.slice && !props.sliceLeft) {
        props.sliceLeft = spriteInfo.slice[0];
        props.sliceTop = spriteInfo.slice[1];
        props.sliceRight = spriteInfo.slice[2];
        props.sliceBottom = spriteInfo.slice[3];
      }
    } else if (assets.spritePrefix && !props.src.includes('/')) {
      props.src = `${assets.spritePrefix}/${props.src}`;
    }
  }

  const childElements: ReactNode[] = [];
  if (children) {
    for (const child of children) {
      childElements.push(resolveNode(child, components, assets));
    }
  }

  return React.createElement(
    type,
    props,
    childElements.length > 0 ? childElements : undefined,
  );
}

export function documentToElement(doc: TowerDocument): ReactNode {
  return resolveNode(doc.root, doc.components, doc.assets);
}

export function renderDocument(
  doc: TowerDocument,
  adapter: IEngineAdapter,
  options?: RenderOptions,
): TowerUIRoot {
  const element = documentToElement(doc);
  return render(element, adapter, {
    width: doc.meta.designWidth,
    height: doc.meta.designHeight,
    ...options,
  });
}
