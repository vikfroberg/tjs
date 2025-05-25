/**
 * @todo
 * - Undefined import variables - Checking against index of exported variables per file
 * - Import * as Something syntax, both the as Something it self but also the usages of Something.variable access.
 * - Object destruction in declarations
 * - List destruction in declarations
 */
let errors = null;
let scopes = new Map();

const renderSourceLineWithPointer = (location, sourceLines) => {
  const line = sourceLines[location.start.line - 1] || "";
  const pointer =
    " ".repeat(location.start.column) +
    "^".repeat(Math.max(1, location.end.column - location.start.column));

  return { line, pointer };
};

let renderUndefinedVariableError = (programMeta) => {
  // @todo: Add name suggestion, e.g. "Did you mean X"
  return (node) => {
    const { sourceLines, fileName } = programMeta;
    const loc = node?.loc || {
      start: { line: 0, column: 0 },
      end: { column: 1 },
    };
    const { line, pointer } = renderSourceLineWithPointer(loc, sourceLines);

    return [
      `-- UNDEFINED VARIABLE ------------------------------------ ${fileName}`,
      "",
      `I tried to reference a variable that doesn't exist, at row ${loc.start.line}, column ${loc.start.column}:`,
      "",
      `    ${line}`,
      `    ${pointer}`,
    ]
      .filter(Boolean)
      .join("\n");
  };
};

const renderDuplicateDeclarationError = (programMeta) => {
  return (name, node1, node2) => {
    const { sourceLines, fileName } = programMeta;
    const sourcePointer1 = renderSourceLineWithPointer(node1.loc, sourceLines);
    const sourcePointer2 = renderSourceLineWithPointer(node2.loc, sourceLines);
    return [
      `-- DUPLICATE VARIABLE DECLARATION ------------------------ ${fileName}`,
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
};

// @todo consolidate with other unsupported error message and have only one
let renderUnsupportedError = (programMeta) => {
  let { sourceLines, fileName } = programMeta;
  return (node) => {
    let { line, pointer } = renderSourceLineWithPointer(node.loc, sourceLines);
    return [
      `-- UNSUPPORTED ERROR --------------------------------- ${fileName}`,
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
};

// @todo: Move the rendering of errors out to a common file for errors for all phases
// @todo: Remove programMeta, replace by threaded module from call place instead
export const errorRenderer = (programMeta) => ({
  renderUndefinedVariableError: renderUndefinedVariableError(programMeta),
  renderDuplicateDeclarationError: renderDuplicateDeclarationError(programMeta),
  renderUnsupportedError: renderUnsupportedError(programMeta),
});

function reportError(message) {
  errors = message;
}

// Look up and return associated AST node if variable already exists
const lookupVariable = (name) => {
  let scope = scopes.find((scope) => {
    return scope.has(name) ? true : false;
  });

  return scope ? scope.get(name) : null;
};

const declareVariable = (name, node, errorRenderer) => {
  // Looking up in the entire scope stack, not allowing shadowing
  let existingDeclaration = lookupVariable(name);
  if (existingDeclaration) {
    reportError(
      errorRenderer.renderDuplicateDeclarationError(
        name,
        node,
        existingDeclaration,
      ),
    );
  } else {
    let currentScope = scopes[scopes.length - 1];
    currentScope.set(name, node);
  }
};

const processProgram = (node, module, errorRenderer) => {
  node.body.forEach((statement) => {
    processNode(statement, module, errorRenderer);
  });
};

const processIdentifier = (node, module, errorRenderer) => {
  if (!lookupVariable(node.name)) {
    reportError(errorRenderer.renderUndefinedVariableError(node));
  }
};

const processBinaryExpression = (node, module, errorRenderer) => {
  processNode(node.left, module, errorRenderer);
  processNode(node.right, module, errorRenderer);
};

const processVariableDeclaration = (node, module, errorRenderer) => {
  node.declarations.forEach((declaration) => {
    switch (declaration.id.type) {
      case "Identifier": {
        declareVariable(declaration.id.name, declaration.id, errorRenderer);
        processNode(declaration.init, module, errorRenderer);
        break;
      }
      case "ObjectPattern": {
        const properties = declaration.id.properties;
        properties.forEach((prop) => {
          const localName = prop.value.name;
          declareVariable(localName, prop.value, errorRenderer);
        });
        break;
      }
      case "ArrayPattern": {
        const elements = declaration.id.elements;
        elements.forEach((elem) => {
          declareVariable(elem.name, elem, errorRenderer);
        });
        break;
      }
      default: {
        reportError(errorRenderer.renderUnsupportedError(node));
        break;
      }
    }
  });
};

const processExportNamedDeclaration = (node, module, errorRenderer) => {
  // When export declares new variables
  if (node.declaration) {
    processNode(node.declaration, module, errorRenderer);
  }

  // When exporting already defined variables
  node.specifiers.forEach((specifier) => {
    switch (specifier.type) {
      case "ExportSpecifier": {
        processNode(specifier.local, module, errorRenderer);
        break;
      }
      default: {
        reportError(errorRenderer.renderUnsupportedError(node));
        break;
      }
    }
  });
};

const processExportDefaultDeclaration = (node, module, errorRenderer) => {
  processNode(node.declaration, module, errorRenderer);
};

const processObjectExpression = (node, module, errorRenderer) => {
  node.properties.forEach((prop) => {
    processNode(prop.value, module, errorRenderer);
  });
};

const processArrayExpression = (node, module, errorRenderer) => {
  node.elements.forEach((elem) => {
    processNode(elem, module, errorRenderer);
  });
};

const processArrowFunctionExpression = (node, module, errorRenderer) => {
  node.params.forEach((param) => {
    switch (param.type) {
      case "Identifier": {
        declareVariable(param.name, param, errorRenderer);
        break;
      }
      default: {
        reportError(errorRenderer.renderUnsupportedError(param));
        break;
      }
    }
  });
  processNode(node.body, module, errorRenderer);
};

const processCallExpression = (node, module, errorRenderer) => {
  processNode(node.callee, module, errorRenderer);
  node.arguments.forEach((arg) => processNode(arg, module, errorRenderer));
};

const processImportDeclaration = (node, module, errorRenderer) => {
  node.specifiers.forEach((specifier) => {
    switch (specifier.type) {
      case "ImportDefaultSpecifier":
      case "ImportSpecifier":
      case "ImportNamespaceSpecifier": {
        declareVariable(specifier.local.name, specifier.local, errorRenderer);
        break;
      }
    }
  });
};

const processNode = (node, module, errorRenderer) => {
  if (errors) return; // Only process up until first error

  switch (node.type) {
    case "Program":
      processProgram(node, module, errorRenderer);
      break;
    case "Identifier":
      processIdentifier(node, module, errorRenderer);
      break;

    case "BinaryExpression":
      processBinaryExpression(node, module, errorRenderer);
      break;

    case "VariableDeclaration":
      processVariableDeclaration(node, module, errorRenderer);
      break;

    case "Literal":
      break;

    case "ExportNamedDeclaration":
      processExportNamedDeclaration(node, module, errorRenderer);
      break;

    case "ExportDefaultDeclaration":
      processExportDefaultDeclaration(node, module, errorRenderer);
      break;

    case "ImportDeclaration":
      processImportDeclaration(node, module, errorRenderer);
      break;

    case "ObjectExpression":
      processObjectExpression(node, module, errorRenderer);
      break;

    case "ArrayExpression":
      processArrayExpression(node, module, errorRenderer);
      break;

    case "ArrowFunctionExpression": {
      scopes.push(new Map());
      processArrowFunctionExpression(node, module, errorRenderer);
      scopes.pop();
      break;
    }

    case "CallExpression": {
      processCallExpression(node, module, errorRenderer);
      break;
    }

    case "ExpressionStatement":
      processNode(node.expression, module, errorRenderer);
      break;

    default:
      console.log("unsuported", node);
      reportError(errorRenderer.renderUnsupportedError(node));
      break;
  }
};

export const check = (module, errorRenderer) => {
  // Reset globals
  errors = null;
  scopes = [new Map()];

  processNode(module.ast, module, errorRenderer);

  scopes.pop();

  return { errors };
};
