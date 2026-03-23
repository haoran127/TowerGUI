import { renderDocument, documentToElement, type TowerUIRoot } from '@tower-ui/core';
import { UnityAdapter } from './UnityAdapter';

declare const CS: any;

let currentRoot: TowerUIRoot | null = null;
let adapter: UnityAdapter | null = null;

export function bootDocument(jsonString: string): void {
  const doc = JSON.parse(jsonString);
  if (doc.$schema !== 'tower-ui') {
    console.error('[TowerDoc] Invalid document: missing $schema');
    return;
  }

  if (!adapter) {
    adapter = new UnityAdapter();
  }

  if (currentRoot) {
    currentRoot.unmount();
  }

  currentRoot = renderDocument(doc, adapter);
  console.log(`[TowerDoc] Rendered: ${doc.meta.name} (${doc.meta.designWidth}x${doc.meta.designHeight})`);
}

export function reloadDocument(jsonString: string): void {
  const doc = JSON.parse(jsonString);
  if (doc.$schema !== 'tower-ui') {
    console.error('[TowerDoc] Invalid document for reload');
    return;
  }

  if (!currentRoot || !adapter) {
    bootDocument(jsonString);
    return;
  }

  const element = documentToElement(doc);
  currentRoot.update(element);
  console.log(`[TowerDoc] Hot-reloaded: ${doc.meta.name}`);
}

export function setupDocumentCallbacks(): void {
  try {
    const TowerDocumentLoader = CS.TowerUI.TowerDocumentLoader;
    TowerDocumentLoader.onDocumentLoaded = (json: string) => bootDocument(json);
    TowerDocumentLoader.onDocumentReloaded = (json: string) => reloadDocument(json);
    console.log('[TowerDoc] Document callbacks registered');
  } catch (e) {
    console.warn('[TowerDoc] TowerDocumentLoader not available (C# class not found)');
  }
}

export function getCurrentRoot(): TowerUIRoot | null {
  return currentRoot;
}
