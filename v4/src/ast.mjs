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
