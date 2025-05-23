import fs from "fs";
import path from "path";
import * as Parse from "./parse.mjs";
import * as Namecheck from "./namecheck.mjs";
import * as Typecheck from "./typecheck.mjs";
import * as Ast from "./ast.mjs";
import * as DependencyGraph from "./dependencyGraph.mjs";
import "./map.mjs";
import {
  createMissingModuleError,
  createMissingExportError,
  createCycleError,
} from "./error.mjs";
import * as Result from "./result.mjs";

let findJsFiles = (dir) => {
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

let checkImportsExists = (absoluteFilePath, imports) => {
  for (const import_ of imports) {
    const resolvedPath = path.resolve(
      path.dirname(absoluteFilePath),
      import_.source,
    );
    if (!fs.existsSync(resolvedPath)) {
      console.log(
        createMissingModuleError({
          filePath,
          importSource: import_.source,
          resolvedPath,
        }),
      );
      process.exit(1);
    }
  }
};

let checkMissingExports = (module, modules) => {
  for (const import_ of module.imports) {
    const importSourcePath = path.resolve(
      path.dirname(module.absoluteFilePath),
      import_.source,
    );
    const importedModule = modules.get(importSourcePath);
    const exportedNames = new Set(importedModule.exports);
    for (const spec of import_.specifiers) {
      if (!exportedNames.has(spec.imported)) {
        console.log(
          createMissingExportError({
            node: import_,
            importSpec: spec,
            filePath: module.absoluteFilePath,
            importPath: importSourcePath,
            availableExports: importedModule.exports,
          }),
        );
        process.exit(1);
      }
    }
  }
};

let moduleInterfaces = new Map();

export let build = (entryDir) => {
  let files = findJsFiles(entryDir);
  let modules = new Map(
    files.map((absoluteFilePath) => {
      let source = fs.readFileSync(absoluteFilePath, "utf8");
      let sourceLines = source.split("\n");
      let ast = Parse.fromString(source);
      let imports = Ast.extractImports(ast);
      checkImportsExists(absoluteFilePath, imports);
      let exports = Ast.extractExports(ast);
      let relativeFilePath = path.relative(entryDir, absoluteFilePath);
      return [
        absoluteFilePath,
        {
          source,
          ast,
          imports,
          relativeFilePath,
          absoluteFilePath,
          sourceLines,
          exports,
        },
      ];
    }),
  );

  const dependenciesGraph = modules.map((module) =>
    module.imports.map((imp) =>
      path.resolve(path.dirname(module.absoluteFilePath), imp.source),
    ),
  );
  const sortedPathsResult = DependencyGraph.topologicalSort(dependenciesGraph);
  if (sortedPathsResult.error) {
    console.error(createCycleError(sortedPathsResult.error.map(absoluteFilePath => path.relative(entryDir, absoluteFilePath))));
    process.exit(1);
  }
  let sortedPaths = sortedPathsResult.ok;

  // Namecheck modules
  for (const absoluteFilePath of sortedPaths) {
    let module = modules.get(absoluteFilePath);
    checkMissingExports(module, modules);

    let namecheck = Namecheck.check(
      module.ast,
      Namecheck.errorRenderer(module),
    );
    if (namecheck.errors) {
      console.log(namecheck.errors);
      process.exit(1);
    }
  }

  // Typecheck modules
  for (const absoluteFilePath of sortedPaths) {
    let module = modules.get(absoluteFilePath);
    Result.cata(Typecheck.inferModule(module, moduleInterfaces), (tModule) => {
      moduleInterfaces.set(absoluteFilePath, tModule.exports);
    }, (error) => {
      console.error(Typecheck.renderError(error, module));
      process.exit(1);
    });
  }

  console.log("No errors, all good!");
};
