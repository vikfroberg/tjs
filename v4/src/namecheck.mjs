/**
 * @todo
 * - Undefined import variables - Checking against index of exported variables per file
 * - Import * as Something syntax, both the as Something it self but also the usages of Something.variable access.
 * - Object destruction in declarations
 * - List destruction in declarations
 */
let errors = [];
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
      "You used a feature that is not suported.",
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
export const errorRenderer = (programMeta) => ({
  renderUndefinedVariableError: renderUndefinedVariableError(programMeta),
  renderDuplicateDeclarationError: renderDuplicateDeclarationError(programMeta),
  renderUnsupportedError: renderUnsupportedError(programMeta),
});

function reportError(message) {
  console.log(message);
  process.exit(1);
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

const processProgram = (node, errorRenderer) => {
  node.body.forEach((statement) => {
    processNode(statement, errorRenderer);
  });
};

const processIdentifier = (node, errorRenderer) => {
  if (!lookupVariable(node.name)) {
    reportError(errorRenderer.renderUndefinedVariableError(node));
  }
};

const processBinaryExpression = (node, errorRenderer) => {
  processNode(node.left, errorRenderer);
  processNode(node.right, errorRenderer);
};

const processVariableDeclaration = (node, errorRenderer) => {
  node.declarations.forEach((declaration) => {
    switch (declaration.id.type) {
      case "Identifier": {
        declareVariable(declaration.id.name, declaration.id, errorRenderer);
        processNode(declaration.init, errorRenderer);
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
    }
  });
};

const processImportDeclaration = (node, errorRenderer) => {
  node.specifiers.forEach((specifier) => {
    processNode(specifier, errorRenderer);
  });
};

const processImportSpecifier = (node, errorRenderer) => {
  declareVariable(node.local.name, node, errorRenderer);
};

const processNode = (node, errorRenderer) => {
  switch (node.type) {
    case "Program":
      processProgram(node, errorRenderer);
      break;
    case "Identifier":
      processIdentifier(node, errorRenderer);
      break;

    case "BinaryExpression":
      processBinaryExpression(node, errorRenderer);
      break;

    case "VariableDeclaration":
      processVariableDeclaration(node, errorRenderer);
      break;

    case "Literal":
      break;

    case "ExportNamedDeclaration":
      // Do we need to do anything here?
      break;

    case "ExportDefaultDeclaration":
      // Do we need to do anything here?
      break;

    case "ImportDeclaration":
      processImportDeclaration(node, errorRenderer);
      break;

    case "ImportSpecifier":
      processImportSpecifier(node, errorRenderer);
      break;

    default:
      reportError(errorRenderer.renderUnsupportedError(node));
      break;
  }
};

export const check = (ast, errorRenderer) => {
  // Reset globals
  errors = [];
  scopes = [new Map()];

  processNode(ast, errorRenderer);

  scopes.pop();

  return { errors };
};
