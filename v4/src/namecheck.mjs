let errors = [];
let scopes = new Set();

function reportError(message, astNode) {
  console.log(message);
  process.exit(1);
  // errors.push({ message, astNode });
}

const lookupVariable = (name) => {
  // Will look in the entire scope stack, not allowing shadowing.
  return scopes.some((scope) => scope.has(name));
};

const declareVariable = (name) => {
  if (lookupVariable(name)) {
    reportError(`Duplicate declarations of variable \`${name}\` found.`);
  } else {
    let currentScope = scopes[scopes.length - 1];
    currentScope.add(name);
  }
};

const processIdentifier = (node) => {
  if (!lookupVariable(node.name)) {
    reportError(`Undefined variable ${node.name}`);
  }
};

const processBinaryExpression = (node) => {
  processNode(node.left);
  processNode(node.right);
};

const processVariableDeclaration = (node) => {
  node.declarations.forEach((declaration) => {
    declareVariable(declaration.id.name);
    processNode(declaration.init);
  });
};

const processNode = (node) => {
  switch (node.type) {
    case "Identifier":
      processIdentifier(node);
      break;

    case "BinaryExpression":
      processBinaryExpression(node);
      break;

    case "VariableDeclaration":
      processVariableDeclaration(node);
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
      // @todo
      break;

    default:
      reportError(
        `Unsupported/unknown syntax while checking names: ${node.type}`,
        node,
      );
      break;
  }
};

export const check = (ast) => {
  // Reset globals
  errors = [];
  scopes = [new Set()];

  ast.body.forEach((node) => {
    processNode(node);
  });

  scopes.pop();

  return { errors };
};
