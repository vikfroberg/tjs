import fs from "fs";
import path from "path";
import * as Parse from "./parse.mjs";
import * as Namecheck from "./namecheck.mjs";
import * as Typecheck from "./typecheck";
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

let moduleInterfaces = new Map();

// Resolve a modules import to absolute file path. Error if file doesn't exist
let resolveImport = (currentFilesAbsolutePath) => {
  return (source) => {
    // Skip Node core modules or npm packages (i.e., bare specifiers)
    if (!source.startsWith(".") && !source.startsWith("/")) {
      return null;
    }

    const resolvedPath = path.resolve(
      path.dirname(currentFilesAbsolutePath),
      source,
    );

    if (!fs.existsSync(resolvedPath)) {
      console.error(
        createMissingModuleError({
          filePath: currentFilesAbsolutePath,
          importSource: source,
          resolvedPath,
        }),
      );
      process.exit(1);
    }

    return resolvedPath;
  };
};

export let build = (entryDir) => {
  let files = findJsFiles(entryDir);
  let allExports = new Map();
  let modules = new Map(
    files.map((absoluteFilePath) => {
      let source = fs.readFileSync(absoluteFilePath, "utf8");
      let sourceLines = source.split("\n");
      let ast = Parse.fromString(source);
      let imports = Ast.checkAndTagImports(
        ast,
        resolveImport(absoluteFilePath),
      );
      let exports = Ast.extractExports(ast);
      allExports.set(absoluteFilePath, exports);
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
    module.imports.map((imp) => imp.resolvedModulePath),
  );
  const sortedPathsResult = DependencyGraph.topologicalSort(dependenciesGraph);
  if (sortedPathsResult.error) {
    console.error(
      createCycleError(
        sortedPathsResult.error.map((absoluteFilePath) =>
          path.relative(entryDir, absoluteFilePath),
        ),
      ),
    );
    process.exit(1);
  }
  let sortedPaths = sortedPathsResult.ok;

  // Namecheck modules
  for (const absoluteFilePath of sortedPaths) {
    let module = modules.get(absoluteFilePath);

    Result.cata(
      Namecheck.check(module, allExports),
      (ok) => ok,
      (error) => {
        console.error(Namecheck.renderError(error, module));
        process.exit(1);
      },
    );
  }

  // Typecheck modules
  for (const absoluteFilePath of sortedPaths) {
    let module = modules.get(absoluteFilePath);
    Result.cata(
      Typecheck.inferModule(module, moduleInterfaces),
      (tModule) => {
        moduleInterfaces.set(absoluteFilePath, tModule.exports);
      },
      (error) => {
        console.error(Typecheck.renderError(error, module));
        process.exit(1);
      },
    );
  }

  console.log("No errors, all good!");
};
