import { createInternalError } from "./error.mjs";

export let checkAndTagImports = (ast, resolveImportPath) => {
  const imports = [];

  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      const source = node.source.value;

      const absolutePath = resolveImportPath(source); // Will also check file exists and error if not

      // Tag resolved path to AST node for later useage
      node.resolvedModulePath = absolutePath;

      imports.push({
        source,
        resolvedModulePath: absolutePath,
        specifiers: node.specifiers.map((spec) => ({
          local: spec.local.name,
          imported: spec.imported ? spec.imported.name : "default",
        })),
      });
    }
  }

  return imports;
};

// @todo: No i/o in here. remove console.log and process.exit
export let extractExports = (ast) => {
  const exports = [];

  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      for (const decl of node.declaration.declarations) {
        exports.push(decl.id.name);
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      exports.push("__default__");
    } else if (node.type === "ExportAllDeclaration") {
      console.log(createInternalError(node, { phase: "Ast.extractExports" }));
      process.exit(1);
    }
  }

  return exports;
};
