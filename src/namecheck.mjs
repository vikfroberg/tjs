import * as Result from "./result.mjs";
import * as E from "./error.mjs";
import * as Levenstein from "./levenstein.mjs";

let error = null;
let scopes = new Map();
let exports = new Map();

const getAllNamesInScope = () => {
  return scopes.flatMap((scope) => Array.from(scope.keys()));
};

const undefinedVariableError = (name, node) => {
  let suggestions = Levenstein.search(name, getAllNamesInScope(), 2);
  return {
    type: "UndefinedVariableError",
    name,
    node,
    suggestions,
  };
};

let renderUndefinedVariableError = ({ node, suggestions }, module) => {
  return E.stack({ spacing: 2 }, [
    E.header("UNDEFINED VARIABLE", module.relativeFilePath),
    E.stack({ spacing: 2 }, [
      E.reflow(`Tried to reference a variable that doesn't exist`),
      E.highlightCode(module.sourceLines[node.loc.start.line - 1], node.loc),
    ]),
    E.stack({ spacing: 2 }, [
      E.reflow(`Maybe you ment one of these?`),
      E.indent(E.stack({}, suggestions.slice(0, 5)), 2),
    ]),
  ]);
};

const duplicateDeclarationsError = (name, node1, node2) => {
  return {
    type: "DuplicateDeclarationError",
    name,
    node: node1,
    node2,
  };
};

const renderDuplicateDeclarationError = ({ name, node, node2 }, module) => {
  return E.stack({ spacing: 2 }, [
    E.header("DUPLICATE VARIABLE DECLARATION", module.relativeFilePath),
    E.stack({ spacing: 2 }, [
      E.reflow(`Tried to declare a variable that was already declared:`),
      E.highlightCode(module.sourceLines[node.loc.start.line - 1], node.loc),
      E.reflow(`... but it was already declared here:`),
      E.highlightCode(module.sourceLines[node2.loc.start.line - 1], node2.loc),
    ]),
    E.stack({ spacing: 2 }, []),
    E.reflow("Try renaming one of them to something unique."),
  ]);
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
  return E.stack({ spacing: 2 }, [
    E.header("VARIABLE NOT EXPORTED", module.relativeFilePath),
    E.reflow(
      `Variable is not exported from module: ${importNode.resolvedModulePath}`,
    ),
    E.stack({}, [
      E.highlightCode(
        module.sourceLines[specifierNode.loc.start.line - 1],
        specifierNode.imported.loc,
      ),
      E.stack({ spacing: 2 }, [
        E.reflow("Maybe you misstyped? Here are the available exports:"),
        E.indent(E.stack({}, availableExports), 2),
      ]),
    ]),
  ]);
};

const unsupportedError = (node) => {
  return {
    type: "UnsupportedError",
    node,
  };
};

// @todo consolidate with other unsupported error message and have only one
let renderUnsupportedError = ({ node }, module) => {
  return E.stack({ spacing: 2 }, [
    E.header("UNSUPPORTED", module.relativeFilePath),
    E.reflow("You used a feature that is not supported"),
    E.stack({}, [
      E.highlightCode(module.sourceLines[node.loc.start.line - 1], node.loc),
      E.reflow(
        "This feature is most likely not supported because it makes it harder to type check or it's encuraged not to be used.",
      ),
    ]),
  ]);
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
    reportError(undefinedVariableError(node.name, node));
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

    case "ReturnStatement":
      processNode(node.argument, module);
      break;

    case "CallExpression": {
      processCallExpression(node, module);
      break;
    }

    case "ExpressionStatement":
      processNode(node.expression, module);
      break;

    case "BlockStatement":
      // No need for creating a new scope? ...or?
      // Thinking it's only used as function body where we just creted a scope for the funciton.
      node.body.forEach((stmt) => processNode(stmt, module));
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
