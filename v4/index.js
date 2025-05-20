import fs from 'fs';
import path from 'path';

let extractImports = (ast) => {
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

let buildDependencyGraph = (files) => {
  const graph = new Map();
  for (const [filePath, ast] of files) {
    const imports = extractImports(ast);
    const dependencies = imports.map(imp =>
      path.resolve(path.dirname(filePath), imp.source)
    );
    graph.set(filePath, dependencies);
  }
  return graph;
}

let createCycleError = (cycle) => {
  const formatted = cycle.join(' -> ');
  const first = cycle[0];

  return `
Cyclic Dependency Detected

I found a cycle in your dependency graph:

    ${formatted}

This means that one of your modules is indirectly importing itself.
Please check your imports and break the cycle.

Hint: Start from the first module in the chain (${first})
and trace where it leads.
`.trim();
}

let topologicalSort = (graph) => {
  const visited = new Set();
  const onStack = new Set();
  const sorted = [];

  function visit(node, ancestors = []) {
    if (visited.has(node)) return;
    if (onStack.has(node)) {
      const cycle = [...ancestors, node].join(' -> ');
      throw new Error(createCycleError(cycle));
    }

    onStack.add(node);
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      visit(dep, [...ancestors, node]);
    }
    onStack.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  for (const node of graph.keys()) {
    visit(node);
  }

  return sorted;
}

let findJSFiles = (dir) => {
  const entries = fs.readdir(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findJSFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

let createMissingModuleError = ({ filePath, importSource, resolvedPath }) => {
  return `
Missing Module Import

While processing:

    ${filePath}

I could not resolve the following import:

    import "${importSource}"

It was expected to exist at:

    ${resolvedPath}

But no module was found there.

This might be because:
  - The file is missing or was renamed
  - The path is incorrect or relative to the wrong base
  - There's a typo in the import statement

Please check the import in ${filePath} and ensure that the path is correct.
`.trim();
}

let createMissingExportError({ imported, local, filePath, resolvedPath, availableExports }) => {
  const exportList = availableExports.length > 0
    ? `Available exports from ${resolvedPath}:\n\n    ${availableExports.join('\n    ')}`
    : `No exports were found in ${resolvedPath}.`;

  return `
Missing Export

While processing:

    ${filePath}

You tried to import:

    ${imported}${local !== imported ? ` as ${local}` : ''}

But the module at:

    ${resolvedPath}

does not export "${imported}".

${exportList}

This might be because:
  - The export name is misspelled or was renamed
  - The export does not exist in the source module
  - You are importing from the wrong file

Please check your import statement and the exports of the target file.
`.trim();
}

let main = (entryDir) => {
  let fileExportsEnvs = new Map(); // Map<path, env>
  let files = findJSFiles(entryDir);
  let sourceFiles = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
  let asts = new Map(files.map(file => [file, parseModule(sourceFiles.get(file), { loc: true, next: true })]));
  const depGraph = buildDependencyGraph(asts);
  const sortedPaths = topologicalSort(depGraph);

  for (const filePath of sortedPaths) {
    const ast = sourceFiles.get(filePath);
    const env = new Map();
    const subst = new Map();

    const imports = extractImports(ast);
    for (const import_ of imports) {
      const resolvedPath = path.resolve(path.dirname(filePath), import_.source);
      const fileExportsEnv = fileExportsEnvs.get(resolvedPath);
      if (!fileExportsEnv) throw new Error(createMissingModuleError({ filePath, importSource: import_.source, resolvedPath }));
      for (const spec of import_.specifiers) {
        const type = fileExportsEnv[spec.imported];
        if (!type) throw new Error(createMissingExportError({ imported: spec.imported, local: spec.local, filePath, resolvedPath, availableExports: Object.keys(fileExportsEnv) }));
        env.set(spec.local, type);
      }
    }

    for (const node of ast.body) {
      const type = infer(node, env, subst);
      for (const [name, expr] of bindings) {
        env[name] = TypeCheck.typeScheme(typ);
      }
    }
    globalModuleTypes.set(filePath, env);
  }
}

main(process.argv[2] || '.');
