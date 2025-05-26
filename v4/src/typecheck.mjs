import path from 'path';
import chalk from 'chalk';
import { createUnificationError, createUnsupportedError, createInternalError } from './error.mjs';
import { ok, error } from './result.mjs';
import * as E from './error.mjs';
import util from 'util';

export class Env {
  constructor() {
    this.stack = [{}];
  }
  push() {
    this.stack.push({});
  }
  pop() {
    this.stack.pop();
  }
  get(name) {
    for (const env of this.stack) {
      if (env[name]) return env[name];
    }
    return undefined;
  }
  set(name, type) {
    this.stack[this.stack.length - 1][name] = type;
  }
}

// TYPES

export let tString = { type: 'string' };
export let tNumber = { type: 'number' };
export let tBoolean = { type: 'boolean' };
export let tFunN = (paramTypes, returnType) => ({ type: 'function', paramTypes, returnType });
export let tModule = (exports) => ({ type: 'module', exports });

let typeVarCounter = 0;
let freshTypeVar = () => {
  return { type: 'var', id: ++typeVarCounter };
}

export let stringify = (t) => {
  return t.type;
}

// ERRORS

export let unsupported = (node, context) => ({ type: 'unsupported', node, context });
export let binaryExpressionMismatch = (node, context) => ({ type: 'binaryExpressionMismatch', node, context });
export let binaryExpressionUnsupportedType = (node, context) => ({ type: 'binaryExpressionUnsupportedType', node, context });
export let unaryExpressionUnsupportedType = (node, context) => ({ type: 'unaryExpressionUnsupportedType', node, context });
export let arityMismatch = (node, context) => ({ type: 'arityMismatch', node, context });
export let paramMismatch = (node, context) => ({ type: 'paramMismatch', node, context });

let formatN = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

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
          E.reflow(E.hint(`If you're a compiler developer you might want to know that this happened in the ${E.type(error.context.stage)} stage on node type ${E.type(error.node.type)}.`)) : undefined,
      ]);
    }
    case 'binaryExpressionMismatch': {
      return E.stack({ spacing: 2 }, [
        E.header('TYPE MISMATCH', module.relativeFilePath),
        E.reflow(`I cannot perform ${E.operator(error.node.operator)} on different types:`),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.node.loc),
          E.reflow(`The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map(t => E.type(stringify(t))).join(' | ')}.`),
        ]),
        E.hint('Implicit casting is not allowed, you must explicitly cast the types.'),
      ]);
    }
    case 'binaryExpressionUnsupportedType': {
      return E.stack({ spacing: 2 }, [
        E.header('TYPE MISMATCH', module.relativeFilePath),
        E.reflow(`I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.context.left))}`),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.node.loc),
          E.reflow(`The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map(t => E.type(stringify(t))).join(' | ')}.`),
        ]),
      ]);
    }
    case 'unaryExpressionUnsupportedType': {
      return E.stack({ spacing: 2 }, [
        E.header('TYPE MISMATCH', module.relativeFilePath),
        E.reflow(`I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.context.left))}`),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.node.loc),
          E.reflow(`The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map(t => E.type(stringify(t))).join(' | ')}.`),
        ]),
      ]);
    }
    case 'arityMismatch': {
      return E.stack({ spacing: 2 }, [
        E.header('ARITY MISMATCH', module.relativeFilePath),
        E.reflow(`The function \`${error.context.fnName}\` is called with the wrong number of arguments:`),
        E.stack({}, [
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.argumentsLoc),
          E.reflow(`You passed ${E.strong(error.context.actualArity)} ${pluralize('argument', error.context.actualArity)}.`),
        ]),
        E.reflow(`But \`${error.context.fnName}\` needs exactly ${error.context.expectedArity} ${pluralize('argument', error.context.expectedArity)}.`),
      ]);
    }
    case 'paramMismatch': {
      return E.stack({ spacing: 2 }, [
        E.header('TYPE MISMATCH', module.relativeFilePath),
        E.reflow(`The ${formatN(error.context.paramIndex + 1)} argument to \`${error.context.fnName}\` is not what I expect:.`),
        E.stack({}, [
          // TODO: Support multiline, pass whole source lines instead
          E.highlightCode(module.sourceLines[error.node.loc.start.line - 1], error.actualParamLoc),
          E.reflow(`This argument is of type ${E.type(stringify(error.context.actualParamType))}.`),
        ]),
        E.reflow(`But \`${error.context.fnName}\` needs the ${formatN(error.context.paramIndex + 1)} argument to be of type ${E.type(stringify(error.context.expectedParamType))}.`),
      ]);
    }
  }
}

let occursInType = (tVar, type) => {
  switch (type.type) {
    case 'var': return tVar.id === type.id;
    case 'funN': return type.paramsTypes.some(paramType => occursInType(tVar, paramType)) || occursInType(tVar, type.returnType);
    default: return false;
  }
}

let applySubst = (subst, type) => {
  switch (type.type) {
    case 'var':
      return subst[type.id] ? applySubst(subst, subst[type.id]) : type;
    case 'funN':
      return tFunN(
        type.paramTypes.map(paramType => applySubst(subst, paramType)),
        applySubst(subst, type.returnType)
      );
    default:
      return type;
  }
}

let unify = (t1, t2, subst = {}) => {
  t1 = applySubst(subst, t1);
  t2 = applySubst(subst, t2);

  if (t1.type === 'var') {
    if (t1.id === t2.id) {
      return ok(subst);
    } else {
      if (occursInType(t1, t2)) return error({ type: "occursCheck", subst });
      subst[t1.id] = t2;
      return ok(subst);
    }
  }

  if (t2.type === 'var') return unify(t2, t1, subst);

  if (t1.type === t2.type) {
    if (t1.type === 'number' || t1.type === 'boolean' || t1.type === 'string') {
      return ok(subst);
    }
    else if (t1.type === 'function') {
      if (t1.paramTypes.length !== t2.paramTypes.length) {
        return error({ type: "arityMismatch", subst });
      }
      for (let i = 0; i < t1.paramTypes.length; i++) {
        let paramResult = unify(t1.paramTypes[i], t2.paramTypes[i], subst);
        if (paramResult.error) return error({ type: "paramMismatch", paramIndex: i, subst });
      }
      let returnResult = unify(t1.returnType, t2.returnType, subst);
      if (returnResult.error) return error({ type: "returnMismatch", subst });
      return ok(subst);
    }
    throw new Error(`Unknown type ${t1.type}`);
  }

  return error({ type: "typeMismatch", subst });
}

export let inferExpr = (node, env, subst = {}) => {
  switch (node.type) {
    case 'Identifier': {
      return ok(env.get(node.name));
    }

    case 'UnaryExpression':
      switch (node.operator) {
        case '~':
        case '+':
        case '-': {
          const right = inferExpr(node.argument, env, subst);
          if (right.error) return right;

          let number = unify(right.value, tNumber, subst);
          if (number.error) return error(unaryExpressionUnsupportedType(node, { types: [tNumber] }));
          return ok(tNumber);
        }
        case '!': {
          const right = inferExpr(node.argument, env, subst);
          if (right.error) return right;

          let boolean = unify(right.value, tBoolean, subst);
          if (boolean.error) return error(unaryExpressionUnsupportedType(node, { types: [tBoolean] }));
          return ok(tBoolean);
        }
        default: {
          return error(unsupported(node, { stage: 'inferExpr.UnaryExpression' }));
        }
      }

    case 'BinaryExpression':
      switch (node.operator) {
        case '+':
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
          if (same.error) return error(binaryExpressionMismatch(node, { types: [tNumber] }));
          let number = unify(left.value, tNumber, subst);
          if (number.error) return error(binaryExpressionUnsupportedType(node, { left: left.value, types: [tNumber] }));
          return left;
        }
        default: {
          return error(unsupported(node, { stage: 'inferExpr.BinaryExpression' }));
        }
      }

    case 'ArrowFunctionExpression': {
      env.push();
      const paramTypes = [];

      for (const param of node.params) {
        if (param.type !== 'Identifier') {
          return error(unsupported(param, { stage: 'inferExpr.ArrowFunctionExpression.params' }));
        }
        const typeVar = freshTypeVar();
        env.set(param.name, typeVar);
        paramTypes.push(typeVar);
      }

      const body = inferExpr(node.body, env, subst);
      if (body.error) return body;

      env.pop();
      let fun = tFunN(paramTypes.map(paramType => applySubst(subst, paramType)), applySubst(subst, body.value));
      return ok(fun);
    }

    case 'CallExpression': {
      const fnType = inferExpr(node.callee, env, subst);
      if (fnType.error) return fnType;
      const argTypes = [];
      for (const arg of node.arguments) {
        const argType = inferExpr(arg, env, subst);
        if (argType.error) return argType;
        argTypes.push(argType.value);
      }
      const returnType = freshTypeVar();

      let call = unify(fnType.value, tFunN(argTypes, returnType), subst);
      if (call.error) {
        switch (call.error.type) {
          case 'arityMismatch': {
            return error(aiarityMismatch(node, { types: [tFunN(call.error.paramTypes, call.error.returnType)] }));
          }
          case 'paramMismatch': {
            return error(paramMismatch(node, { types: [tFunN(call.error.paramTypes, call.error.returnType)] }));
          }
          default: {
            return error(unsupported(node, { stage: 'inferExpr.CallExpression' }));
          }
        }
      }

      return ok(applySubst(subst, returnType));
    }

    case 'Literal': {
      if (typeof node.value === 'number') return ok(tNumber);
      if (typeof node.value === 'string') return ok(tString);
      if (typeof node.value === 'boolean') return ok(tBoolean);
      return error(unsupported(node, { stage: 'inferExpr.Literal' }));
    }

    default: {
      return error(unsupported(node, { stage: 'inferExpr' }));
    }
  }
}

export let inferModule = (module, moduleInterfaces, env = new Env(), subst = {}) => {
  let exports = {};

  for (const node of module.ast.body) {
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        const name = decl.id.name;
        const expr = decl.init;
        const type = inferExpr(expr, env, subst);
        if (type.error) return type;
        env.set(name, type.value);
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          for (const decl of node.declaration.declarations) {
            const name = decl.id.name;
            const expr = decl.init;
            const type = inferExpr(expr, env, subst);
            if (type.error) return type;
            env.set(name, type.value);
            exports[name] = type.value;
          }
        } else {
          return error(unsupported(node.declaration, { stage: 'inferModule.ExportNamedDeclaration' }));
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const type = inferExpr(node.declaration, env, subst);
      if (type.error) return type;
      env.set('__default__', type.value);
      exports['__default__'] = type.value;
    } else if (node.type === 'ImportDeclaration') {
      const importedSource = path.resolve(path.dirname(module.absoluteFilePath), node.source.value);
      let importedInterface = moduleInterfaces.get(importedSource);
      for (const spec of node.specifiers) {
        const type = importedInterface[spec.imported.name];
        env.set(spec.local.name, type);
      }
    } else {
      return error(unsupported(node, { stage: 'inferModule' }));
    }
  }

  return ok(tModule(exports));
}

