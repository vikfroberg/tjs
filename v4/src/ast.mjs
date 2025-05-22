import { createInternalError } from './error.mjs';

export let extractImports = (ast) => {
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

export let extractExports = (ast) => {
  const exports = [];

  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      for (const decl of node.declaration.declarations) {
        exports.push(decl.id.name);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      exports.push('__default__');
    } else if (node.type === 'ExportAllDeclaration') {
      console.log(createInternalError(node, { phase: 'Ast.extractExports' }));
      process.exit(1);
    }
  }

  return exports;
}
