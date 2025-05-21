import fs from "fs";
import path from "path";
import { parseModule } from "meriyah";
import util from "util";
import * as Namecheck from "./src/namecheck.mjs";

// globals
let subst = {};
let env = {};
let fileExportsEnvs = {};
let sourceLines = {};
let fileName = "";

Map.prototype.map = function (fn, thisArg) {
  const result = new Map();
  for (const [key, value] of this) {
    result.set(key, fn.call(thisArg, value, key, this));
  }
  return result;
};

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
  for (const [filePath, imports] of files) {
    const dependencies = imports.map(source =>
      path.resolve(path.dirname(filePath), source)
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
      console.log(createCycleError(cycle));
      process.exit(1);
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
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findJSFiles(fullPath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
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

let createMissingExportError = ({ imported, local, filePath, resolvedPath, availableExports }) => {
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

let createInternalError = (node, context) => {
  const loc = node.loc?.start ?? { line: 0, column: 0 };
  const line = sourceLines[loc.line - 1] ?? '';
  const pointer = ' '.repeat(loc.column) + '^';

  return [
    `-- ERROR --------------------------------- ${fileName}`,
    '',
    `This tool doesn't yet handle the syntax at line ${loc.line}, column ${loc.column}:`,
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    `Node type: '${node.type}'`,
    '',
    context.phase === 'infer'
      ? `Hint: Add a case to 'infer()' to support this type.`
      : `Hint: Add a case to 'nameCheck()' to support this type.`,
  ].join('\n');
}

let createUnsupportedError = (node) => {
  const loc = node.loc?.start ?? { line: 0, column: 0 };
  const line = sourceLines[loc.line - 1] ?? '';
  const pointer = ' '.repeat(loc.column) + '^';

  return [
    `-- UNSUPPORTED ERROR --------------------------------- ${fileName}`,
    '',
    'You used a feature that is not suported.',
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    'This feature is not allowed in TJS because it makes code harder to analyze and optimize.',
    '',
    'Instead, try to refactor your code to use a different feature. See the documentation for more information:',
    'https://github.com/vikfroberg/tjs/blob/main/docs/unsupported.md',
  ].join('\n');
}

let concreteType = (name) => ({ type: 'concrete', name });

let createUnificationError = (node, context = {}) => {
  const { expected, actual, hint } = context;
  const loc = node?.loc || { start: { line: 0, column: 0 }, end: { column: 1 } };
  const line = sourceLines[loc.start.line - 1] || '';
  const pointer =
    ' '.repeat(loc.start.column) +
    '^'.repeat(Math.max(1, loc.end.column - loc.start.column));

  return [
    `-- TYPE MISMATCH ----------------------------------------- ${fileName}`,
    '',
    `I ran into a problem at line ${loc.start.line}, column ${loc.start.column}:`,
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    expected ? `Expected:\n    ${expected}` : '',
    actual ? `But got:\n    ${actual}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}


let unify = (t1, t2, subst, node) => {
  if (t1 === t2) return subst;
  if (t1.type === 'concrete' && t2.type === 'concrete' && t1.name === t2.name) return subst;

  console.log(createUnificationError(node, { expected: t1.name, actual: t2.name }));
  process.exit(1);
}

let infer = (node, env, subst) => {
  switch (node.type) {
    case 'Identifier':
      return env[node.name];

    case 'BinaryExpression':
      switch (node.operator) {
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
        case '**':
        case '|':
        case '&':
        case '^':
        case '<<':
        case '>>':
        case '>>>':
          const left = infer(node.left, env, subst);
          const right = infer(node.right, env, subst);
          unify(concreteType('Number'), left, subst, node.left);
          unify(concreteType('Number'), right, subst, node.right);
          return concreteType('Number');
        default:
          console.log(createUnsupportedError(node));
          process.exit(1);
      }

    case 'Literal':
      if (typeof node.value === 'number') return concreteType('Number');
      if (typeof node.value === 'string') return concreteType('String');
      if (typeof node.value === 'boolean') return concreteType('Boolean');
      console.log(createUnsupportedError(node));
      process.exit(1);

    default:
      console.log(createUnsupportedError(node));
      process.exit(1);
  }
}

let main = (entryDir) => {
  let files = findJSFiles(entryDir);
  let sourceFiles = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
  let asts = sourceFiles.map(source => parseModule(source, { loc: true, next: true }));
  let fileImports = asts.map(ast => extractImports(ast));

  for (const [filePath, imports] of fileImports) {
    for (const import_ of imports) {
      const resolvedPath = path.resolve(path.dirname(filePath), import_.source);
      if (!sourceFiles.has(resolvedPath)) {
        console.log(createMissingModuleError({ filePath, importSource: import_.source, resolvedPath }));
        process.exit(1);
      }
    }
  }

  const depGraph = buildDependencyGraph(fileImports.map(imports => imports.map(imp => imp.source)));
  const sortedPaths = topologicalSort(depGraph);

  for (const filePath of sortedPaths) {
    const ast = asts.get(filePath);
    env = {}
    fileName = path.relative(entryDir, filePath);

    const imports = extractImports(ast);
    for (const import_ of imports) {
      const resolvedPath = path.resolve(path.dirname(filePath), import_.source);
      const fileExportsEnv = fileExportsEnvs[resolvedPath];
      if (!fileExportsEnv) {
        console.log(createMissingModuleError({ filePath, importSource: import_.source, resolvedPath }));
        process.exit(1);
      }
      for (const spec of import_.specifiers) {
        const type = fileExportsEnv[spec.imported];
        if (!type) {
          console.log(createMissingExportError({ imported: spec.imported, local: spec.local, filePath, resolvedPath, availableExports: Object.keys(fileExportsEnv) }));
          process.exit(1);
        }
        env[spec.local] = type;
      }
    }

    subst = {}
    sourceLines = sourceFiles.get(filePath).split('\n');

    let namingcheck = Namecheck.check(ast);

    if (namingcheck.errors.length) {
      console.log(namingcheck.errors);
    }

    let fileExports = {};
    for (const node of ast.body) {
      if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          const name = decl.id.name;
          const expr = decl.init;
          const type = infer(expr, env, subst);
          env[name] = type;
        }
      } else if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration) {
          if (node.declaration.type === 'VariableDeclaration') {
            for (const decl of node.declaration.declarations) {
              const name = decl.id.name;
              const expr = decl.init;
              const type = infer(expr, env, subst);
              env[name] = type;
              fileExports[name] = type;
            }
          } else {
            console.log(createInternalError(node.declaration, { phase: 'infer' }));
            process.exit(1);
          }
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        const type = infer(node.declaration, env, subst);
        env['__default__'] = type;
        fileExports['__default__'] = type;
      } else if (node.type === 'ImportDeclaration') {
        // NOOP?
      } else {
        infer(node, env, subst); // Evaluate unbound statements
      }
    }
    fileExportsEnvs[filePath] = fileExports;
  }

  console.log("No errors, all good!");
}

main(process.argv[2] || '.');
