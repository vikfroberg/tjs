import fs from 'fs/promises';
import path from 'path';
import { parseModule } from 'meriyah';

// =============== Globals ===============

let db = [];
let globalScope = new Map();
let fileScope = new Map();
let errors = [];
let nextTypeId = 0;
let sourceLines = [];
let fileName = '';

// =============== Types ===============

function freshTypeVar() {
  const id = nextTypeId++;
  db[id] = null;
  return id;
}

function concreteType(name) {
  const id = nextTypeId++;
  db[id] = { concrete: name };
  return id;
}

function functionType(paramTypes, returnType) {
  const id = nextTypeId++;
  db[id] = { fn: { params: paramTypes, ret: returnType } };
  return id;
}

function resolve(typeId) {
  const entry = db[typeId];
  if (entry?.symlink !== undefined) {
    const root = resolve(entry.symlink);
    db[typeId] = { symlink: root };
    return root;
  }
  return typeId;
}

function describe(typeId) {
  const id = resolve(typeId);
  const entry = db[id];
  if (!entry) return `unknown`;
  if (entry.concrete) return entry.concrete;
  if (entry.fn) {
    return `(${entry.fn.params.map(describe).join(', ')}) -> ${describe(entry.fn.ret)}`;
  }
  return `t${id}`;
}

// =============== Error Reporting (Improved Elm Style) ===============

function reportError(message, node, context = {}) {
  const { expected, actual, hint } = context;
  const loc = node?.loc || { start: { line: 0, column: 0 }, end: { column: 1 } };
  const line = sourceLines[loc.start.line - 1] || '';
  const pointer =
    ' '.repeat(loc.start.column) +
    '^'.repeat(Math.max(1, loc.end.column - loc.start.column));

  const formatted = [
    `-- TYPE ERROR ------------------------------------------------ ${fileName}`,
    '',
    `I ran into a problem at line ${loc.start.line}, column ${loc.start.column}:`,
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    `${message}`,
    '',
    expected ? `Expected:\n    ${expected}` : '',
    actual ? `But got:\n    ${actual}` : '',
    hint ? `\nHint: ${hint}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  console.error(formatted);
  errors.push(message);
}

function reportDevLimitation(node, context) {
  const loc = node.loc?.start ?? { line: 0, column: 0 };
  const line = sourceLines[loc.line - 1] ?? '';
  const pointer = ' '.repeat(loc.column) + '^';

  const formatted = [
    `-- INTERNAL LIMITATION --------------------------------- ${fileName}`,
    '',
    `This tool doesn't yet handle the syntax at line ${loc.line}, column ${loc.column}:`,
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    `Node type: '${node.type}'`,
    '',
    context.phase === 'infer'
      ? `Hint: Add a case to 'infer()' to support this type.`
      : `Hint: Add a case to 'nameCheck()' to support this type.`,
  ].join('\n');

  console.error(formatted);
  process.exit(1); // This is a hard fail: the checker needs to be extended
}

// =============== Unification ===============

function unify(a, b, node, label = 'Types do not match') {
  const aId = resolve(a);
  const bId = resolve(b);
  if (aId === bId) return;

  const aEntry = db[aId];
  const bEntry = db[bId];

  if (aEntry?.concrete && bEntry?.concrete) {
    if (aEntry.concrete !== bEntry.concrete) {
      reportError(label, node, {
        expected: aEntry.concrete,
        actual: bEntry.concrete,
        hint: guessHint(aEntry.concrete, bEntry.concrete),
      });
    }
  } else if (aEntry?.fn && bEntry?.fn) {
    if (aEntry.fn.params.length !== bEntry.fn.params.length) {
      reportError('Function arity mismatch', node);
    } else {
      for (let i = 0; i < aEntry.fn.params.length; i++) {
        unify(aEntry.fn.params[i], bEntry.fn.params[i], node);
      }
      unify(aEntry.fn.ret, bEntry.fn.ret, node);
    }
  } else if (aEntry?.concrete || aEntry?.fn) {
    db[bId] = { symlink: aId };
  } else {
    db[aId] = { symlink: bId };
  }
}

function guessHint(expected, actual) {
  if (expected === 'String' && actual === 'Number') {
    return 'Try converting the number to a string using String(n).';
  }
  if (expected === 'Boolean' && actual === 'Number') {
    return 'Did you mean to compare with > or === ?';
  }
  return null;
}

// =============== Type Inference ===============

function infer(node, scope) {
  if (!node) return freshTypeVar();

  switch (node.type) {
    case 'Program':
      for (const stmt of node.body) {
        infer(stmt, scope);
      }

    case 'Literal':
      switch (typeof node.value) {
        case 'number': return concreteType('Number');
        case 'string': return concreteType('String');
        case 'boolean': return concreteType('Boolean');
        default: return freshTypeVar();
      }

    case 'Identifier':
      if (!scope.has(node.name)) {
        reportError(`I couldn't find a definition for '${node.name}'`, node);
        return freshTypeVar();
      }
      return scope.get(node.name);

    case 'VariableDeclaration':
      for (const decl of node.declarations) {
        const initType = infer(decl.init, scope);
        scope.set(decl.id.name, initType);
      }
      return concreteType('Void');

    case 'BinaryExpression': {
      const left = infer(node.left, scope);
      const right = infer(node.right, scope);
      unify(left, concreteType('Number'), node);
      unify(right, concreteType('Number'), node);
      return left;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      const local = new Map(scope);
      const paramTypes = node.params.map(p => {
        const t = freshTypeVar();
        local.set(p.name, t);
        return t;
      });
      const bodyType = infer(node.body, local);
      return functionType(paramTypes, bodyType);
    }

    case 'CallExpression': {
      const fnType = infer(node.callee, scope);
      const argTypes = node.arguments.map(arg => infer(arg, scope));
      const ret = freshTypeVar();
      const expected = functionType(argTypes, ret);
      unify(fnType, expected, node);
      return ret;
    }

    case 'BlockStatement': {
      const local = new Map(scope);
      let result = concreteType('Void');
      for (const stmt of node.body) {
        result = infer(stmt, local);
      }
      return result;
    }

    case 'ReturnStatement':
      return infer(node.argument, scope);

    case 'IfStatement': {
      const cond = infer(node.test, scope);
      unify(cond, concreteType('Boolean'), node.test);
      infer(node.consequent, scope);
      if (node.alternate) infer(node.alternate, scope);
      return concreteType('Void');
    }

    default: {
      reportDevLimitation(node, { phase: 'infer' });
    }
  }
}

// =============== Name Resolution ===============

function nameCheck(ast) {
  const scopes = [new Set()];

  function declare(name, node) {
    const current = scopes[scopes.length - 1];
    if (current.has(name)) {
      reportError(`You already declared '${name}' in this scope.`, node);
    } else {
      current.add(name);
    }
  }

  function resolve(name, node) {
    if (!scopes.some(s => s.has(name))) {
      reportError(`I couldn't find a declaration for '${name}'.`, node);
    }
  }

  function visit(node) {
    if (!node) return;

    switch (node.type) {
      case 'Program':
        node.body.forEach(visit);
        break;
      case 'BlockStatement':
        scopes.push(new Set());
        node.body.forEach(visit);
        scopes.pop();
        break;
      case 'VariableDeclaration':
        node.declarations.forEach(d => {
          visit(d.init);
          declare(d.id.name, d.id);
        });
        break;
      case 'FunctionDeclaration':
        declare(node.id.name, node.id);
        visit(node);
        break;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        scopes.push(new Set());
        node.params.forEach(p => declare(p.name, p));
        visit(node.body);
        scopes.pop();
        break;
      case 'Identifier':
        resolve(node.name, node);
        break;
      case 'ReturnStatement':
        visit(node.argument);
        break;
      case 'IfStatement':
        visit(node.test);
        visit(node.consequent);
        visit(node.alternate);
        break;
      case 'CallExpression':
        visit(node.callee);
        node.arguments.forEach(visit);
        break;
      case 'BinaryExpression':
        visit(node.left);
        visit(node.right);
        break;
    }
  }

  visit(ast);
}

// =============== File System ===============

async function findJSFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await findJSFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function parseAndCheck(filePath) {
  fileName = path.basename(filePath);
  const code = await fs.readFile(filePath, 'utf8');
  sourceLines = code.split('\n');

  let ast;
  try {
    ast = parseModule(code, { loc: true, next: true });
  } catch (e) {
    console.error(`Syntax error in ${fileName}:\n\n${e.message}`);
    process.exit(1);
  }

  nameCheck(ast);
  infer(ast, fileScope);

  if (errors.length === 0) {
    console.log(`[OK] ${filePath}`);
  } else {
    process.exit(1);
  }
}

async function main(entry = './src') {
  const files = await findJSFiles(entry);
  for (const file of files) {
    db = [];
    errors = [];
    fileScope = new Map(globalScope);
    nextTypeId = 0;
    await parseAndCheck(file);
  }

  console.log('All files passed type checking.');
}

main(process.argv[2]);
