import path from 'path';
import chalk from 'chalk';
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
export let tVar = (id) => ({ type: 'var', id });

// Type schemes for polymorphism
export let tScheme = (vars, type) => ({ type: 'scheme', vars, body: type });

let typeVarCounter = 0;
let freshTypeVar = () => {
  return { type: 'var', id: ++typeVarCounter };
}

export let stringify = (t) => {
  if (t.type === 'scheme') {
    const varNames = t.vars.map(v => `'${String.fromCharCode(97 + (v.id % 26))}`).join(', ');
    return `forall ${varNames}. ${stringify(t.body)}`;
  }
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
    case 'function': return type.paramTypes.some(paramType => occursInType(tVar, paramType)) || occursInType(tVar, type.returnType);
    case 'scheme': return occursInType(tVar, type.body);
    default: return false;
  }
}

let applySubst = (subst, type) => {
  switch (type.type) {
    case 'var':
      return subst[type.id] ? applySubst(subst, subst[type.id]) : type;
    case 'function':
      return tFunN(
        type.paramTypes.map(paramType => applySubst(subst, paramType)),
        applySubst(subst, type.returnType)
      );
    case 'scheme':
      // Don't substitute bound variables in schemes
      const filteredSubst = { ...subst };
      for (const tVar of type.vars) {
        delete filteredSubst[tVar.id];
      }
      return tScheme(type.vars, applySubst(filteredSubst, type.body));
    default:
      return type;
  }
}

// Get free type variables in a type
let freeTypeVars = (type) => {
  switch (type.type) {
    case 'var':
      return new Set([type.id]);
    case 'function':
      const paramVars = type.paramTypes.reduce((acc, param) => 
        new Set([...acc, ...freeTypeVars(param)]), new Set());
      const returnVars = freeTypeVars(type.returnType);
      return new Set([...paramVars, ...returnVars]);
    case 'scheme':
      const bodyVars = freeTypeVars(type.body);
      const boundVars = new Set(type.vars.map(v => v.id));
      return new Set([...bodyVars].filter(v => !boundVars.has(v)));
    default:
      return new Set();
  }
}

// Get free type variables in environment
let freeTypeVarsInEnv = (env) => {
  const allVars = new Set();
  for (const frame of env.stack) {
    for (const [name, type] of Object.entries(frame)) {
      const typeVars = freeTypeVars(type);
      for (const v of typeVars) {
        allVars.add(v);
      }
    }
  }
  return allVars;
}

// Generalize a type into a type scheme
let generalize = (env, type) => {
  const envVars = freeTypeVarsInEnv(env);
  const typeVars = freeTypeVars(type);
  const generalizedVars = [...typeVars].filter(v => !envVars.has(v));
  
  if (generalizedVars.length === 0) {
    return type;
  }
  
  const vars = generalizedVars.map(id => ({ type: 'var', id }));
  return tScheme(vars, type);
}

// Instantiate a type scheme with fresh type variables
let instantiate = (scheme) => {
  if (scheme.type !== 'scheme') {
    return scheme;
  }
  
  const subst = {};
  for (const tVar of scheme.vars) {
    subst[tVar.id] = freshTypeVar();
  }
  
  return applySubst(subst, scheme.body);
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
      const scheme = env.get(node.name);
      if (!scheme) {
        return error(unsupported(node, { stage: 'inferExpr.Identifier.undefined' }));
      }
      // Instantiate the type scheme
      const type = instantiate(scheme);
      return ok(type);
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
          return ok(tNumber);
        }
        case '<':
        case '>':
        case '<=':
        case '>=': {
          const left = inferExpr(node.left, env, subst);
          const right = inferExpr(node.right, env, subst);
          if (left.error) return left;
          if (right.error) return right;
          let same = unify(left.value, right.value, subst);
          if (same.error) return error(binaryExpressionMismatch(node, { types: [tNumber] }));
          let number = unify(left.value, tNumber, subst);
          if (number.error) return error(binaryExpressionUnsupportedType(node, { left: left.value, types: [tNumber] }));
          return ok(tBoolean);
        }
        case '==':
        case '!=':
        case '===':
        case '!==': {
          const left = inferExpr(node.left, env, subst);
          const right = inferExpr(node.right, env, subst);
          if (left.error) return left;
          if (right.error) return right;
          let same = unify(left.value, right.value, subst);
          if (same.error) return error(binaryExpressionMismatch(node, { types: [tNumber, tString, tBoolean] }));
          return ok(tBoolean);
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
            return error(arityMismatch(node, { types: [tFunN(call.error.paramTypes, call.error.returnType)] }));
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

    case 'ConditionalExpression': {
      const test = inferExpr(node.test, env, subst);
      if (test.error) return test;
      let testUnify = unify(test.value, tBoolean, subst);
      if (testUnify.error) return error(unsupported(node, { stage: 'inferExpr.ConditionalExpression.testNotBoolean' }));
      const consequent = inferExpr(node.consequent, env, subst);
      if (consequent.error) return consequent;
      const alternate = inferExpr(node.alternate, env, subst);
      if (alternate.error) return alternate;
      let branchUnify = unify(consequent.value, alternate.value, subst);
      if (branchUnify.error) return error(unsupported(node, { stage: 'inferExpr.ConditionalExpression.branchMismatch' }));
      return ok(applySubst(subst, consequent.value));
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
        const selfTypeVar = freshTypeVar();
        env.set(name, selfTypeVar);
        const type = inferExpr(expr, env, subst);
        if (type.error) return type;
        const unifyResult = unify(selfTypeVar, type.value, subst);
        if (unifyResult.error) return error(unsupported(decl, { stage: 'inferModule.VariableDeclaration.recursion' }));
        const finalType = applySubst(subst, selfTypeVar);
        const generalizedType = generalize(env, finalType);
        env.set(name, generalizedType);
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          for (const decl of node.declaration.declarations) {
            const name = decl.id.name;
            const expr = decl.init;
            const selfTypeVar = freshTypeVar();
            env.set(name, selfTypeVar);
            const type = inferExpr(expr, env, subst);
            if (type.error) return type;
            const unifyResult = unify(selfTypeVar, type.value, subst);
            if (unifyResult.error) return error(unsupported(decl, { stage: 'inferModule.ExportNamedDeclaration.recursion' }));
            const finalType = applySubst(subst, selfTypeVar);
            const generalizedType = generalize(env, finalType);
            env.set(name, generalizedType);
            exports[name] = generalizedType;
          }
        } else {
          return error(unsupported(node.declaration, { stage: 'inferModule.ExportNamedDeclaration' }));
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const type = inferExpr(node.declaration, env, subst);
      if (type.error) return type;
      const generalizedType = generalize(env, type.value);
      env.set('__default__', generalizedType);
      exports['__default__'] = generalizedType;
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
