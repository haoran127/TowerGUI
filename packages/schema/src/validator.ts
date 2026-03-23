import { TOWER_UI_SCHEMA, type UISchema, type ComponentSchema, type PropDef } from './schema';
import type { TowerDocument } from './document';

export interface DataBindInfo {
  role: 'display' | 'event' | 'list';
  field?: string;
  protoType?: 'string' | 'int32' | 'float' | 'bool' | 'bytes' | 'int64' | 'double';
  event?: string;
  itemType?: string;
}

export interface UINode {
  type: string;
  props?: Record<string, any>;
  dataBind?: DataBindInfo;
  children?: (UINode | string)[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export function validateUI(node: UINode, schema: UISchema = TOWER_UI_SCHEMA): ValidationError[] {
  const errors: ValidationError[] = [];
  validateNode(node, schema, '', errors);
  return errors;
}

export function validateDocument(doc: unknown, schema: UISchema = TOWER_UI_SCHEMA): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!doc || typeof doc !== 'object') {
    errors.push({ path: '', message: 'Document must be an object' });
    return errors;
  }

  const d = doc as Record<string, any>;

  if (d.$schema !== 'tower-ui') {
    errors.push({ path: '$schema', message: `Expected "tower-ui", got "${d.$schema}"` });
  }
  if (d.version !== '1.0') {
    errors.push({ path: 'version', message: `Expected "1.0", got "${d.version}"` });
  }

  if (!d.meta || typeof d.meta !== 'object') {
    errors.push({ path: 'meta', message: 'meta is required and must be an object' });
  } else {
    if (typeof d.meta.name !== 'string' || !d.meta.name) {
      errors.push({ path: 'meta.name', message: 'meta.name is required' });
    }
    if (typeof d.meta.designWidth !== 'number' || d.meta.designWidth <= 0) {
      errors.push({ path: 'meta.designWidth', message: 'meta.designWidth must be a positive number' });
    }
    if (typeof d.meta.designHeight !== 'number' || d.meta.designHeight <= 0) {
      errors.push({ path: 'meta.designHeight', message: 'meta.designHeight must be a positive number' });
    }
  }

  if (!d.root || typeof d.root !== 'object') {
    errors.push({ path: 'root', message: 'root is required and must be a UINode' });
    return errors;
  }

  const components: Record<string, UINode> | undefined = d.components;
  if (components) {
    for (const [name, compNode] of Object.entries(components)) {
      validateNodeWithRefs(compNode, schema, `components.${name}`, errors, components);
    }
  }

  validateNodeWithRefs(d.root, schema, 'root', errors, components);
  return errors;
}

function validateNodeWithRefs(
  node: UINode,
  schema: UISchema,
  path: string,
  errors: ValidationError[],
  components?: Record<string, UINode>,
): void {
  if (node.type === '$ref') {
    const refName = (node as any).ref;
    if (typeof refName !== 'string' || !refName) {
      errors.push({ path, message: '$ref node must have a "ref" string property' });
      return;
    }
    if (components && !components[refName]) {
      errors.push({ path, message: `$ref "${refName}" not found in components` });
    }
    if (node.children) {
      node.children.forEach((child, i) => {
        if (typeof child === 'object') {
          validateNodeWithRefs(child, schema, `${path}[${i}]`, errors, components);
        }
      });
    }
    return;
  }

  validateNode(node, schema, path, errors);
  if (node.children) {
    node.children.forEach((child, i) => {
      if (typeof child === 'object') {
        validateNodeWithRefs(child, schema, `${path}[${i}]`, errors, components);
      }
    });
  }
}

function validateNode(node: UINode, schema: UISchema, path: string, errors: ValidationError[]): void {
  const compSchema = schema.components[node.type];
  if (!compSchema) {
    errors.push({ path, message: `Unknown component type: "${node.type}"` });
    return;
  }

  const props = node.props ?? {};

  // Check required props
  for (const [key, def] of Object.entries(compSchema.props)) {
    if (def.required && (props[key] === undefined || props[key] === null)) {
      errors.push({ path: `${path}.${key}`, message: `Required prop "${key}" is missing on <${node.type}>` });
    }
  }

  // Validate prop types
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key' || key === 'ref') continue;
    const def = compSchema.props[key];
    if (!def) continue; // allow unknown props (forward-compat)

    const propPath = `${path}.${key}`;
    validatePropValue(value, def, propPath, errors);
  }

  // Validate children
  if (node.children) {
    if (!compSchema.children && node.children.length > 0) {
      errors.push({ path, message: `<${node.type}> does not accept children` });
    }
    node.children.forEach((child, i) => {
      if (typeof child === 'object') {
        validateNode(child, schema, `${path}[${i}]`, errors);
      }
    });
  }
}

function validatePropValue(value: any, def: PropDef, path: string, errors: ValidationError[]): void {
  if (value === undefined || value === null) return;

  switch (def.type) {
    case 'number':
      if (typeof value !== 'number') {
        errors.push({ path, message: `Expected number, got ${typeof value}` });
      } else {
        if (def.min !== undefined && value < def.min) {
          errors.push({ path, message: `Value ${value} is below minimum ${def.min}` });
        }
        if (def.max !== undefined && value > def.max) {
          errors.push({ path, message: `Value ${value} exceeds maximum ${def.max}` });
        }
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        errors.push({ path, message: `Expected string, got ${typeof value}` });
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push({ path, message: `Expected boolean, got ${typeof value}` });
      }
      break;
    case 'enum':
      if (def.enum && !def.enum.includes(value)) {
        errors.push({ path, message: `"${value}" is not a valid value. Expected one of: ${def.enum.join(', ')}` });
      }
      break;
    case 'color':
      if (typeof value === 'string' && !value.match(/^#[0-9a-fA-F]{6,8}$/)) {
        errors.push({ path, message: `Invalid color format: "${value}". Expected #RRGGBB or #RRGGBBAA` });
      }
      break;
    case 'callback':
      if (typeof value !== 'function') {
        errors.push({ path, message: `Expected function for callback prop` });
      }
      break;
  }
}
