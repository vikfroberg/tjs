import path from "path";
import * as Parse from "../parse.mjs";
import * as Namecheck from "../namecheck.mjs";
import * as Typecheck from "../typecheck/index.mjs";
import * as Ast from "../ast.mjs";
import * as DependencyGraph from "../dependencyGraph.mjs";
import "../map.mjs";
import {
  createMissingModuleError,
  createMissingExportError,
  createCycleError,
} from "../error.mjs";
import * as Result from "../result.mjs";
import fs from "fs";

export let findJsFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const absoluteFilePath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findJsFiles(absoluteFilePath));
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      files.push(absoluteFilePath);
    }
  }

  return files;
};

export let buildModulesFromDir = (dir) => {
  const moduleProvider = (path) => fs.existsSync(path);
  const importResolver = createImportResolver(moduleProvider);
  
  const modules = findJsFiles(dir).map(file => {
    const source = fs.readFileSync(file, "utf8");
    const module = createModuleFromSource(source, file, dir, importResolver);
    return [file, module];
  });
  
  return new Map(modules);
};

// Core module processing functions

export let parseModule = (source, filePath, entryDir, importResolver) => {
  let ast = Parse.fromString(source);
  return {
    source,
    ast,
    imports: Ast.checkAndTagImports(ast, importResolver),
    relativeFilePath: path.relative(entryDir, filePath),
    absoluteFilePath: filePath,
    sourceLines: source.split("\n"),
    exports: Ast.extractExports(ast),
  };
};

export let namecheckModule = (module, allExports) => {
  return Namecheck.check(module, allExports);
};

export let typecheckModule = (module, moduleInterfaces) => {
  return Typecheck.inferModule(module, moduleInterfaces);
};

// Dependency management

export let createImportResolver = (moduleProvider) => {
  return (currentFilePath) => {
    return (source) => {
      // Skip Node core modules or npm packages (i.e., bare specifiers)
      if (!source.startsWith(".") && !source.startsWith("/")) {
        return null;
      }

      const resolvedPath = path.resolve(
        path.dirname(currentFilePath),
        source,
      );

      // Check if module exists in the provider
      if (!moduleProvider(resolvedPath)) {
        return null; // Let caller handle missing modules
      }

      return resolvedPath;
    };
  };
};

export let buildDependencyGraph = (modules) => {
  const dependenciesGraph = new Map();
  for (const [filePath, module] of modules) {
    dependenciesGraph.set(filePath, module.imports.map((imp) => imp.resolvedModulePath));
  }
  const sortResult = DependencyGraph.topologicalSort(dependenciesGraph);

  // Convert to consistent Result format
  if (sortResult.error) {
    return Result.error(sortResult.error);
  }
  return Result.ok(sortResult.ok);
};

// Single module creation

export let createModuleFromSource = (source, filePath, entryDir, importResolver) => {
  return parseModule(source, filePath, entryDir, importResolver(filePath));
};

// Full processing pipeline for a single module

export let processModule = (source, filePath, entryDir, dependencies) => {
  const { moduleProvider, allExports, moduleInterfaces } = dependencies;

  const importResolver = createImportResolver(moduleProvider);
  const module = createModuleFromSource(source, filePath, entryDir, importResolver);

  // Namecheck
  const namecheckResult = namecheckModule(module, allExports);
  if (namecheckResult.error) {
    return Result.error({
      type: 'namecheck',
      error: namecheckResult.error,
      module
    });
  }

  // Typecheck
  const typecheckResult = typecheckModule(module, moduleInterfaces);
  if (typecheckResult.error) {
    return Result.error({
      type: 'typecheck',
      error: typecheckResult.error,
      module
    });
  }

  return Result.ok({
    module,
    typedModule: typecheckResult.ok
  });
};

// Utility functions

export let extractExportsFromModules = (modules) => {
  const allExports = new Map();
  for (const [filePath, module] of modules) {
    allExports.set(filePath, module.exports);
  }
  return allExports;
};

export let createModuleInterface = (typedModule) => {
  return typedModule.exports;
};

export let validateModuleExports = (modules, allExports) => {
  const errors = [];

  for (const [filePath, module] of modules) {
    const namecheckResult = namecheckModule(module, allExports);
    if (namecheckResult.error) {
      errors.push({
        filePath,
        error: namecheckResult.error,
        module
      });
    }
  }

  return errors.length > 0 ? Result.error(errors) : Result.ok(true);
};

// Batch processing utilities

export let processModules = (modules, entryDir) => {
  const allExports = extractExportsFromModules(modules);
  const moduleInterfaces = new Map();
  const results = new Map();

  // Build dependency graph
  const sortResult = buildDependencyGraph(modules);
  if (sortResult.error) {
    return Result.error({
      type: 'cycle',
      error: sortResult.value,
      entryDir
    });
  }

  const sortedPaths = sortResult.value;

  // Process modules in dependency order
  for (const filePath of sortedPaths) {
    const module = modules.get(filePath);

    const moduleProvider = (path) => modules.has(path);
    const dependencies = {
      moduleProvider,
      allExports,
      moduleInterfaces
    };

    const processResult = processModule(module.source, filePath, entryDir, dependencies);

    if (processResult.error) {
      return Result.error(processResult.value);
    }

    const { typedModule } = processResult.value;
    moduleInterfaces.set(filePath, createModuleInterface(typedModule));
    results.set(filePath, processResult.value);
  }

  return Result.ok({
    results,
    moduleInterfaces,
    allExports
  });
};
