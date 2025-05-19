import fs from 'fs/promises';
import path from 'path';
import { parseModule } from 'meriyah';

export function extractImports(ast) {
  const imports = [];

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const source = node.source.value;

      // Skip Node core modules or npm packages (i.e., bare specifiers)
      if (!source.startsWith('.') && !source.startsWith('/')) {
        continue;
      }

      imports.push({
        source,
        specifiers: node.specifiers.map(spec => ({
          local: spec.local.name,
          imported: spec.imported ? spec.imported.name : 'default',
        })),
      });
    }
  }

  return imports;
}

export function extractExports(ast) {
  const exports = {};
  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      const decl = node.declaration;
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.id.type === 'Identifier') {
            exports[d.id.name] = d.init;
          }
        }
      }
    }
  }
  return exports;
}

export function isTopLevelBinding(node) {
  switch (node.type) {
    case 'VariableDeclaration':
      return node.declarations
        .filter(d => d.id.type === 'Identifier')
        .map(d => [d.id.name, d.init]);

    case 'FunctionDeclaration':
      return node.id?.type === 'Identifier'
        ? [[node.id.name, node]]
        : [];

    case 'ExportNamedDeclaration':
      if (node.declaration?.type === 'VariableDeclaration') {
        return node.declaration.declarations
          .filter(d => d.id.type === 'Identifier')
          .map(d => [d.id.name, d.init]);
      }
      if (node.declaration?.type === 'FunctionDeclaration') {
        const id = node.declaration.id;
        return id?.type === 'Identifier' ? [[id.name, node.declaration]] : [];
      }
      return [];

    case 'ExportDefaultDeclaration':
      return [['default', node.declaration]];

    default:
      return []; // No top-level binding
  }
}

export async function parseFile(filePath) {
  const code = await fs.readFile(filePath, 'utf8');
  const ast = parseModule(code, { loc: true, module: true });
  return { ast, code };
}
