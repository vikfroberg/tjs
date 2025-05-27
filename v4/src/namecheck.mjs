import * as Result from "./result.mjs";
/**
 * @todo
 * - Undefined import variables - Checking against index of exported variables per file
 * - Import * as Something syntax, both the as Something it self but also the usages of Something.variable access.
 * - Object destruction in declarations
 * - List destruction in declarations
 */
let error = null;
let scopes = new Map();
let exports = new Map();

const renderSourceLineWithPointer = (location, sourceLines) => {
  const line = sourceLines[location.start.line - 1] || "";
  const pointer =
    " ".repeat(location.start.column) +
    "^".repeat(Math.max(1, location.end.column - location.start.column));

  return { line, pointer };
};

const undefinedVariableError = (node) => {
  return {
    type: "UndefinedVariableError",
    node,
  };
};

let renderUndefinedVariableError = ({ node }, module) => {
  // @todo: Add name suggestion, e.g. "Did you mean X"
  const { sourceLines, absoluteFilePath } = module;
  const loc = node?.loc || {
    start: { line: 0, column: 0 },
    end: { column: 1 },
  };
  const { line, pointer } = renderSourceLineWithPointer(loc, sourceLines);

  return [
    `-- UNDEFINED VARIABLE ------------------------------------ ${absoluteFilePath}`,
    "",
    `I tried to reference a variable that doesn't exist, at row ${loc.start.line}, column ${loc.start.column}:`,
    "",
    `    ${line}`,
    `    ${pointer}`,
  ]
    .filter(Boolean)
    .join("\n");
};

const duplicateDeclarationsError = (name, node1, node2) => {
  return {
    type: "DuplicateDeclarationError",
    name,
    node1,
    node2,
  };
};

const renderDuplicateDeclarationError = ({ name, node1, node2 }, module) => {
  const { sourceLines, absoluteFilePath } = module;
  const sourcePointer1 = renderSourceLineWithPointer(node1.loc, sourceLines);
  const sourcePointer2 = renderSourceLineWithPointer(node2.loc, sourceLines);
  return [
    `-- DUPLICATE VARIABLE DECLARATION ------------------------ ${absoluteFilePath}`,
    "",
    `Tried to declare a variable \`${name}\`, at row ${node1.loc.start.line}, column ${node1.loc.start.column}:`,
    "",
    `    ${sourcePointer1.line}`,
    `    ${sourcePointer1.pointer}`,
    `But the variable name was already used here, at row ${node2.loc.start.line}, column ${node2.loc.start.column}`,
    `    ${sourcePointer2.line}`,
    `    ${sourcePointer2.pointer}`,
    `Please rename one of them to a unique name`,
  ]
    .filter(Boolean)
    .join("\n");
};

const nameNotExportedError = (importNode, specifierNode, availableExports) => {
  return {
    type: "NameNotExportedError",
    importNode,
    specifierNode,
    availableExports,
  };
};

const renderNameNotExportedError = (
  { importNode, specifierNode, availableExports },
  module,
) => {
  return `TODO: Propper error message... Tried to import \`${specifierNode.imported.name}\` from file \`${importNode.resolvedModulePath}\`, but it's not exported.\nThese are available exports: \n\t${availableExports.map((s) => `\`${s}\``).join("\n\t")}`;
};

const unsupportedError = (node) => {
  return {
    type: "UnsupportedError",
    node,
  };
};

// @todo consolidate with other unsupported error message and have only one
let renderUnsupportedError = ({ node }, module) => {
  let { sourceLines, absoluteFilePath } = module;
  let { line, pointer } = renderSourceLineWithPointer(node.loc, sourceLines);
  return [
    `-- UNSUPPORTED ERROR --------------------------------- ${absoluteFilePath}`,
    "",
    `You used a feature that is not suported (${node.type}).`,
    "",
    `    ${line}`,
    `    ${pointer}`,
    "",
    "This feature is not allowed in TJS because it makes code harder to analyze and optimize.",
    "",
    "Instead, try to refactor your code to use a different feature. See the documentation for more information:",
    "https://github.com/vikfroberg/tjs/blob/main/docs/unsupported.md",
  ].join("\n");
};

export const renderError = (error, module) => {
  switch (error.type) {
    case "UndefinedVariableError": {
      return renderUndefinedVariableError(error, module);
    }
    case "DuplicateDeclarationError": {
      return renderDuplicateDeclarationError(error, module);
    }
    case "NameNotExportedError": {
      return renderNameNotExportedError(error, module);
    }
    case "UnsupportedError": {
      return renderUnsupportedError(error, module);
    }
  }

  throw new Error(
    `Unsupported error reported! \n\t${error}\n\nThis error could not be rendered propperly`,
  );
};

function reportError(e) {
  error = e;
}

// Look up and return associated AST node if variable already exists
const lookupVariable = (name) => {
  let scope = scopes.find((scope) => {
    return scope.has(name) ? true : false;
  });

  return scope ? scope.get(name) : null;
};

const declareVariable = (name, node) => {
  // Looking up in the entire scope stack, not allowing shadowing
  let existingDeclaration = lookupVariable(name);
  if (existingDeclaration) {
    reportError(duplicateDeclarationsError(name, node, existingDeclaration));
  } else {
    let currentScope = scopes[scopes.length - 1];
    currentScope.set(name, node);
  }
};

const processProgram = (node, module) => {
  node.body.forEach((statement) => {
    processNode(statement, module);
  });
};

const processIdentifier = (node, module) => {
  if (!lookupVariable(node.name)) {
    reportError(undefinedVariableError(node));
  }
};

const processBinaryExpression = (node, module) => {
  processNode(node.left, module);
  processNode(node.right, module);
};

const processVariableDeclaration = (node, module) => {
  node.declarations.forEach((declaration) => {
    switch (declaration.id.type) {
      case "Identifier": {
        declareVariable(declaration.id.name, declaration.id);
        processNode(declaration.init, module);
        break;
      }
      case "ObjectPattern": {
        const properties = declaration.id.properties;
        properties.forEach((prop) => {
          const localName = prop.value.name;
          declareVariable(localName, prop.value);
        });
        processNode(declaration.init, module);
        break;
      }
      case "ArrayPattern": {
        const elements = declaration.id.elements;
        elements.forEach((elem) => {
          declareVariable(elem.name, elem);
        });
        processNode(declaration.init, module);
        break;
      }
      default: {
        reportError(unsupportedError(node));
        break;
      }
    }
  });
};

const processExportNamedDeclaration = (node, module) => {
  // When export declares new variables
  if (node.declaration) {
    processNode(node.declaration, module);
  }

  // When exporting already defined variables
  node.specifiers.forEach((specifier) => {
    switch (specifier.type) {
      case "ExportSpecifier": {
        processNode(specifier.local, module);
        break;
      }
      default: {
        reportError(unsupportedError(node));
        break;
      }
    }
  });
};

const processExportDefaultDeclaration = (node, module) => {
  processNode(node.declaration, module);
};

const processObjectExpression = (node, module) => {
  node.properties.forEach((prop) => {
    processNode(prop.value, module);
  });
};

const processArrayExpression = (node, module) => {
  node.elements.forEach((elem) => {
    processNode(elem, module);
  });
};

const processArrowFunctionExpression = (node, module) => {
  node.params.forEach((param) => {
    switch (param.type) {
      case "Identifier": {
        declareVariable(param.name, param);
        break;
      }
      default: {
        reportError(unsupportedError(param));
        break;
      }
    }
  });
  processNode(node.body, module);
};

const processCallExpression = (node, module) => {
  processNode(node.callee, module);
  node.arguments.forEach((arg) => processNode(arg, module));
};

const processImportDeclaration = (node, module) => {
  const availableExports = exports.get(node.resolvedModulePath);

  node.specifiers.forEach((specifier) => {
    if (error) return;
    switch (specifier.type) {
      case "ImportDefaultSpecifier": {
        if (!availableExports?.find((ident) => ident === "__default__")) {
          reportError(nameNotExportedError(node, specifier, availableExports));
          break;
        }
        declareVariable(specifier.local.name, specifier.local);
        break;
      }
      case "ImportSpecifier": {
        if (
          !availableExports?.find((ident) => ident === specifier.imported.name)
        ) {
          reportError(nameNotExportedError(node, specifier, availableExports));
          break;
        }
        declareVariable(specifier.local.name, specifier.local);
        break;
      }
      case "ImportNamespaceSpecifier": {
        declareVariable(specifier.local.name, specifier.local);
        break;
      }
    }
  });
};

const processNode = (node, module) => {
  if (error) return; // Only process up until first error

  switch (node.type) {
    case "Program":
      processProgram(node, module);
      break;
    case "Identifier":
      processIdentifier(node, module);
      break;

    case "BinaryExpression":
      processBinaryExpression(node, module);
      break;

    case "VariableDeclaration":
      processVariableDeclaration(node, module);
      break;

    case "Literal":
      break;

    case "ExportNamedDeclaration":
      processExportNamedDeclaration(node, module);
      break;

    case "ExportDefaultDeclaration":
      processExportDefaultDeclaration(node, module);
      break;

    case "ImportDeclaration":
      processImportDeclaration(node, module);
      break;

    case "ObjectExpression":
      processObjectExpression(node, module);
      break;

    case "ArrayExpression":
      processArrayExpression(node, module);
      break;

    case "ArrowFunctionExpression": {
      scopes.push(new Map());
      processArrowFunctionExpression(node, module);
      scopes.pop();
      break;
    }

    case "CallExpression": {
      processCallExpression(node, module);
      break;
    }

    case "ExpressionStatement":
      processNode(node.expression, module);
      break;

    default:
      reportError(unsupportedError(node));
      break;
  }
};

export const check = (module, allExports) => {
  // Reset globals
  error = null;
  scopes = [new Map()];
  exports = allExports;

  processNode(module.ast, module);

  scopes.pop();

  return error ? Result.error(error) : Result.ok({});
};
