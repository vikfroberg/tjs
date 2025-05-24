import path from 'path';
import chalk from 'chalk';
import { createUnificationError, createUnsupportedError, createInternalError } from './error.mjs';
import { ok, error } from './result.mjs';
import * as E from './error.mjs';

// TYPES

let tString = { type: 'string' };
let tNumber = { type: 'number' };
let tBoolean = { type: 'boolean' };
let tSum = (types) => ({ type: 'sum', types });
let tModule = (exports) => ({ type: 'module', exports });

let stringify = (t) => {
  return t.type;
}

// ERRORS

let unsupported = (node, stage) => ({ type: 'unsupported', node, stage });
let binaryExpressionMismatch = (node) => ({ type: 'binaryExpressionMismatch', node });
let binaryExpressionUnsupportedType = (node, left, types) => ({ type: 'binaryExpressionUnsupportedType', node, left, types });
let concatOrAdditionUnsupportedType = (node) => ({ type: 'concatOrAdditionUnsupportedType', node });

export let renderError = (error, module) => {
  switch (error.type) {
    case 'unsupported': {
      return E.stack({ spacing: 2 }, [
        E.header('UNSUPPORTED', module.relativeFilePath),
        E.reflow("You used a feature that is not supported"),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.node.loc),
          E.reflow("This feature is most likely not supported because it makes it harder to type check or it's encuraged not to be used."),
        ]),
        process.env.NODE_ENV === 'development' ?
          E.reflow(E.hint(`If you're a compiler developer you might want to know that this happened in the ${E.type(error.stage)} stage on node type ${E.type(error.node.type)}.`)) : undefined,
      ]);
    }
    case 'binaryExpressionMismatch': {
      return E.stack({ spacing: 2 }, [
        E.header('TYPE MISMATCH', module.relativeFilePath),
        E.reflow(`I cannot perform ${E.operator(error.node.operator)} on different types:`),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.node.loc),
          E.hint('Implicit casting is not allowed, you must explicitly cast the types.'),
        ]),
      ]);
    }
    case 'binaryExpressionUnsupportedType': {
      return E.stack({ spacing: 2 }, [
        E.header('TYPE MISMATCH', module.relativeFilePath),
        E.reflow(`I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.left))}`),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.node.loc),
          E.reflow(`The ${E.operator(error.node.operator)} operator only works on ${error.types.map(t => E.type(stringify(t))).join(' | ')}.`),
        ]),
      ]);
    }
  }
}

let unify = (t1, t2, subst) => {
  if (t1 === t2) return ok(subst);
  if (t1.type === 'sum') {
    for (const t of t1.types) {
      let result = unify(t, t2, subst);
      if (result.ok) return result;
    }
  }
  if (t2.type === 'sum') return unify(t2, t1, subst);

  if (t1.type === t2.type) return ok(subst);

  return error(subst);
}

export let inferExpr = (node, env, subst = {}) => {
  switch (node.type) {
    case 'Identifier': {
      return ok(env[node.name]);
    }

    case 'BinaryExpression':
      switch (node.operator) {
        case '+': {
          const left = inferExpr(node.left, env, subst);
          const right = inferExpr(node.right, env, subst);
          if (left.error) return left;
          if (right.error) return right;

          let same = unify(left.value, right.value, subst);
          if (same.error) return error(binaryExpressionMismatch(node));
          let stringOrNumber = unify(left.value, tSum([tString, tNumber]), subst);
          if (stringOrNumber.error) return error(binaryExpressionUnsupportedType(node, left.value, [tString, tNumber]));
          return left;
        }
        case '-':
        case '*':
        case '/':
        case '%':
        case '**':
        case '|':
        case '&':
        case '^':
        case '<<':
        case '>>':
        case '>>>': {
          const left = inferExpr(node.left, env, subst);
          const right = inferExpr(node.right, env, subst);
          if (left.error) return left;
          if (right.error) return right;

          let same = unify(left.value, right.value, subst);
          if (same.error) return error(binaryExpressionMismatch(node));
          let number = unify(left.value, tNumber, subst);
          if (number.error) return error(binaryExpressionUnsupportedType(node, left.value, [tNumber]));
          return left;
        }
        default: {
          return error(unsupported(node, 'inferExpr.BinaryExpression'));
        }
      }

    case 'Literal': {
      if (typeof node.value === 'number') return ok(tNumber);
      if (typeof node.value === 'string') return ok(tString);
      if (typeof node.value === 'boolean') return ok(tBoolean);
      return error(unsupported(node, 'inferExpr.Literal'));
    }

    default: {
      return error(unsupported(node, 'inferExpr'));
    }
  }
}

export let inferModule = (module, moduleInterfaces, env = {}, subst = {}) => {
  let exports = {};

  for (const node of module.ast.body) {
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        const name = decl.id.name;
        const expr = decl.init;
        const type = inferExpr(expr, env, subst);
        if (type.error) return type;
        env[name] = type.value;
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          for (const decl of node.declaration.declarations) {
            const name = decl.id.name;
            const expr = decl.init;
            const type = inferExpr(expr, env, subst);
            if (type.error) return type;
            env[name] = type.value;
            exports[name] = type.value;
          }
        } else {
          return error(unsupported(node.declaration, 'inferModule.ExportNamedDeclaration'));
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const type = inferExpr(node.declaration, env, subst);
      if (type.error) return type;
      env['__default__'] = type.value;
      exports['__default__'] = type.value;
    } else if (node.type === 'ImportDeclaration') {
      const importedSource = path.resolve(path.dirname(module.absoluteFilePath), node.source.value);
      let importedInterface = moduleInterfaces.get(importedSource);
      for (const spec of node.specifiers) {
        const type = importedInterface[spec.imported.name];
        env[spec.local.name] = type;
      }
    } else {
      return error(unsupported(node, 'inferModule'));
    }
  }

  return ok(tModule(exports));
}

