import React, { useCallback } from 'react';
import { useEditor, type UINode } from './state';
import { useToast } from './components/Toast';

interface ComponentDef {
  type: string;
  label: string;
  icon: string;
  description: string;
  defaults: Record<string, any>;
  hasChildren: boolean;
}

const COMPONENTS: ComponentDef[] = [
  {
    type: 'ui-view',
    label: 'View',
    icon: '□',
    description: 'Flex container',
    defaults: { width: 400, height: 300, tint: 'rgba(255,255,255,0.05)' },
    hasChildren: true,
  },
  {
    type: 'ui-text',
    label: 'Text',
    icon: 'A',
    description: 'Text label',
    defaults: { text: 'New Text', fontSize: 32, color: '#ffffff', width: 300, height: 50 },
    hasChildren: false,
  },
  {
    type: 'ui-image',
    label: 'Image',
    icon: '🖼',
    description: 'Image / Sprite',
    defaults: { src: '', width: 200, height: 200 },
    hasChildren: true,
  },
  {
    type: 'ui-button',
    label: 'Button',
    icon: '⬜',
    description: 'Clickable button',
    defaults: { text: 'Button', fontSize: 28, width: 240, height: 80 },
    hasChildren: false,
  },
  {
    type: 'ui-input',
    label: 'Input',
    icon: '⌨',
    description: 'Text input field',
    defaults: { placeholder: 'Enter text...', fontSize: 24, width: 400, height: 64 },
    hasChildren: false,
  },
  {
    type: 'ui-scroll',
    label: 'Scroll',
    icon: '↕',
    description: 'Scrollable area',
    defaults: { width: 500, height: 400, vertical: true },
    hasChildren: true,
  },
  {
    type: 'ui-toggle',
    label: 'Toggle',
    icon: '⬤',
    description: 'Toggle switch',
    defaults: { checked: false, width: 60, height: 32 },
    hasChildren: false,
  },
  {
    type: 'ui-slider',
    label: 'Slider',
    icon: '⟿',
    description: 'Value slider',
    defaults: { min: 0, max: 1, value: 0.5, width: 300, height: 32 },
    hasChildren: false,
  },
  {
    type: 'ui-dropdown',
    label: 'Dropdown',
    icon: '▾',
    description: 'Dropdown select',
    defaults: { options: ['Option 1', 'Option 2', 'Option 3'], value: 0, width: 300, height: 48 },
    hasChildren: true,
  },
  {
    type: 'ui-progress',
    label: 'Progress',
    icon: '▰',
    description: 'Progress / HP bar',
    defaults: { value: 0.5, fillColor: '#44cc44', tint: '#333333', width: 300, height: 24 },
    hasChildren: false,
  },
];

function PaletteItem({ def }: { def: ComponentDef }) {
  const { state, dispatch } = useEditor();
  const { toast } = useToast();

  const handleClick = useCallback(() => {
    if (!state.document) {
      toast('Create or open a document first', 'warning');
      return;
    }
    const parentPath = state.selectedPath || 'root';
    const node: UINode = {
      type: def.type,
      props: { ...def.defaults },
      children: def.hasChildren ? [] : undefined,
    };
    dispatch({ type: 'ADD_NODE', parentPath, node });
    toast(`Added <${def.type}> to ${parentPath}`, 'success');
  }, [state.document, state.selectedPath, def, dispatch, toast]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/tower-component', JSON.stringify({
      type: def.type,
      defaults: def.defaults,
      hasChildren: def.hasChildren,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, [def]);

  return (
    <div
      className="palette-item"
      onClick={handleClick}
      draggable
      onDragStart={handleDragStart}
      title={`${def.label} — ${def.description}\nClick to add, or drag to canvas`}
    >
      <span className="palette-icon">{def.icon}</span>
      <span className="palette-label">{def.label}</span>
    </div>
  );
}

export function ComponentPalette() {
  return (
    <div className="component-palette">
      {COMPONENTS.map(def => (
        <PaletteItem key={def.type} def={def} />
      ))}
    </div>
  );
}
