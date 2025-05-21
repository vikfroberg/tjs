import fs from 'fs';
import path from 'path';
import * as Parse from './parse.mjs';
import * as Typecheck from './typecheck.mjs';
import * as Ast from './ast.mjs';
import * as DependencyGraph from './dependencyGraph.mjs';
import './map.mjs';
import { createMissingModuleError, createMissingExportError, createCycleError } from './error.mjs';

let findJsFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const absoluteFilePath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findJsFiles(absoluteFilePath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(absoluteFilePath);
    }
  }

  return files;
}

let checkImports = (absoluteFilePath, imports) => {
  for (const import_ of imports) {
    const resolvedPath = path.resolve(path.dirname(absoluteFilePath), import_.source);
    if (!fs.existsSync(resolvedPath)) {
      console.log(createMissingModuleError({ filePath, importSource: import_.source, resolvedPath }));
      process.exit(1);
    }
  }
}

let moduleInterfaces = new Map();

let getImportTypes = (module, moduleInterfaces) => {
  // TODO: If you import * as foof from './foo.mjs', then we need to add all exports to the env under that namespace

  let env = {};
  for (const import_ of module.imports) {
    const absoluteImportPath = path.resolve(path.dirname(module.absoluteFilePath), import_.source);
    const moduleInterface = moduleInterfaces.get(absoluteImportPath);
    for (const spec of import_.specifiers) {
      const type = moduleInterface[spec.imported];
      if (!type) {
        console.log(createMissingExportError({ node: import_, importSpec: spec, filePath: module.absoluteFilePath, importPath: absoluteImportPath, availableExports: Object.keys(moduleInterface) }));
        process.exit(1);
      }
      env[spec.local] = type;
    }
  }
  return env;
}

export let build = (entryDir) => {
  let files = findJsFiles(entryDir);
  let modules = new Map(files.map(absoluteFilePath => {
    let source = fs.readFileSync(absoluteFilePath, 'utf8');
    let sourceLines = source.split('\n');
    let ast = Parse.fromString(source);
    let imports = Ast.extractImports(ast);
    let relativeFilePath = path.relative(entryDir, absoluteFilePath);
    checkImports(absoluteFilePath, imports);
    return [absoluteFilePath, { source, ast, imports, relativeFilePath, absoluteFilePath, sourceLines }];
  }));

  const depGraph = modules.map(module => module.imports.map(imp => path.resolve(path.dirname(module.absoluteFilePath), imp.source)));
  const sortedPathsResult = DependencyGraph.topologicalSort(depGraph);
  if (sortedPathsResult.error) {
    console.log(createCycleError(sortedPathsResult.error));
    process.exit(1);
  }
  let sortedPaths = sortedPathsResult.ok;

  // Namecheck modules
  for (const absoluteFilePath of files) {
    // TODO: Manne will add it here
  }

  // Typecheck modules
  for (const absoluteFilePath of sortedPaths) {
    let module = modules.get(absoluteFilePath);
    let env = getImportTypes(module, moduleInterfaces); // TODO: Should this be moved to infer? And checking into canonicalize?
    let tModule = Typecheck.inferModule(module.ast, env);
    moduleInterfaces.set(absoluteFilePath, tModule.exports);
  }

  console.log("No errors, all good!");
}
