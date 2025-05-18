let typeVarCounter = 0;

function freshTypeVar() {
  return { tag: 'var', id: ++typeVarCounter };
}

const tNumber = { tag: 'number' };
const tBoolean = { tag: 'boolean' };
const tString = { tag: 'string' };

function tFunN(params, result) {
  return { tag: 'funN', params, result };
}

function tArray(elemType) {
  return { tag: 'array', elemType };
}

export function typeScheme(type, quantifiers = []) {
  return { type, quantifiers };
}

function freeTypeVars(type) {
  switch (type.tag) {
    case 'var': return new Set([type.id]);
    case 'funN':
      return new Set([
        ...type.params.flatMap(p => [...freeTypeVars(p)]),
        ...freeTypeVars(type.result)
      ]);
    case 'array': return freeTypeVars(type.elemType);
    default: return new Set();
  }
}

function freeVarsInScheme(scheme) {
  const ftv = freeTypeVars(scheme.type);
  scheme.quantifiers.forEach(q => ftv.delete(q));
  return ftv;
}

function freeVarsInEnv(env) {
  const result = new Set();
  for (const scheme of Object.values(env)) {
    for (const v of freeVarsInScheme(scheme)) result.add(v);
  }
  return result;
}

function generalize(env, type) {
  const ftv = freeTypeVars(type);
  const envFtv = freeVarsInEnv(env);
  const quantifiers = [...ftv].filter(id => !envFtv.has(id));
  return typeScheme(type, quantifiers);
}

function instantiate(scheme) {
  const subst = {};
  for (const q of scheme.quantifiers) {
    subst[q] = freshTypeVar();
  }
  return applySubst(subst, scheme.type);
}

function occursInType(v, type) {
  switch (type.tag) {
    case 'var': return v.id === type.id;
    case 'funN': return type.params.some(p => occursInType(v, p)) || occursInType(v, type.result);
    case 'array': return occursInType(v, type.elemType);
    default: return false;
  }
}

function applySubst(subst, type) {
  switch (type.tag) {
    case 'var':
      return subst[type.id] ? applySubst(subst, subst[type.id]) : type;
    case 'funN':
      return tFunN(
        type.params.map(p => applySubst(subst, p)),
        applySubst(subst, type.result)
      );
    case 'array':
      return tArray(applySubst(subst, type.elemType));
    default:
      return type;
  }
}

function unify(t1, t2, subst = {}) {
  t1 = applySubst(subst, t1);
  t2 = applySubst(subst, t2);

  if (t1.tag === 'var') {
    if (t1.id !== t2.id) {
      if (occursInType(t1, t2)) throw new Error('occurs check failed');
      subst[t1.id] = t2;
    }
    return subst;
  }

  if (t2.tag === 'var') return unify(t2, t1, subst);

  if (t1.tag === t2.tag) {
    switch (t1.tag) {
      case 'number':
      case 'boolean':
        return subst;
      case 'funN':
        if (t1.params.length !== t2.params.length) {
          throw new Error('Function arity mismatch');
        }
        for (let i = 0; i < t1.params.length; i++) {
          unify(t1.params[i], t2.params[i], subst);
        }
        unify(t1.result, t2.result, subst);
        return subst;
      case 'array':
        unify(t1.elemType, t2.elemType, subst);
        return subst;
    }
  }

  throw new Error(`Cannot unify ${JSON.stringify(t1)} with ${JSON.stringify(t2)}`);
}

function extendEnv(env, name, scheme) {
  return { ...env, [name]: scheme };
}

function lookup(env, name) {
  if (!(name in env)) throw new Error(`Unbound variable: ${name}`);
  return instantiate(env[name]);
}

export function infer(node, env, subst) {
  switch (node.type) {
    case 'Literal': {
      if (typeof node.value === 'number') return tNumber;
      if (typeof node.value === 'boolean') return tBoolean;
      if (typeof node.value === 'string') return tString;
      throw new Error(`Unsupported literal type: ${typeof node.value}`);
    }

    case 'Identifier': {
      return lookup(env, node.name);
    }

    case 'ArrowFunctionExpression': {
      const paramTypes = node.params.map(() => freshTypeVar());
      let newEnv = env;
      node.params.forEach((param, i) => {
        newEnv = extendEnv(newEnv, param.name, typeScheme(paramTypes[i]));
      });
      const bodyType = infer(node.body, newEnv, subst);
      return tFunN(paramTypes.map(t => applySubst(subst, t)), bodyType);
    }

    case 'CallExpression': {
      const fnType = infer(node.callee, env, subst);
      const argTypes = node.arguments.map(arg => infer(arg, env, subst));
      const resultType = freshTypeVar();

      unify(fnType, tFunN(argTypes.map(t => applySubst(subst, t)), resultType), subst);
      return applySubst(subst, resultType);
    }

    case 'ArrayExpression': {
      if (node.elements.length === 0) return tArray(freshTypeVar());
      const elemType = infer(node.elements[0], env, subst);
      for (const el of node.elements.slice(1)) {
        unify(elemType, infer(el, env, subst), subst);
      }
      return tArray(applySubst(subst, elemType));
    }

    case 'BinaryExpression': {
      const left = infer(node.left, env, subst);
      const right = infer(node.right, env, subst);
      unify(left, tNumber, subst);
      unify(right, tNumber, subst);
      if (['<', '>', '<=', '>=', '==', '!='].includes(node.operator)) return tBoolean;
      if (['+', '-', '*', '/'].includes(node.operator)) return tNumber;
      throw new Error(`Unsupported operator: ${node.operator}`);
    }

    case 'ConditionalExpression': {
      const testType = infer(node.test, env, subst);
      unify(testType, tBoolean, subst);
      const consType = infer(node.consequent, env, subst);
      const altType = infer(node.alternate, env, subst);
      unify(consType, altType, subst);
      return applySubst(subst, consType);
    }

    case 'VariableDeclaration': {
      if (node.kind !== 'let') throw new Error('Only let bindings are supported');
      let newEnv = { ...env };

      for (const decl of node.declarations) {
        const name = decl.id.name;
        const assumedType = freshTypeVar();
        const recursiveEnv = extendEnv(newEnv, name, typeScheme(assumedType));
        const initType = infer(decl.init, recursiveEnv, subst);
        unify(assumedType, initType, subst);
        const gen = generalize(newEnv, applySubst(subst, assumedType));
        newEnv = extendEnv(newEnv, name, gen);
      }

      return newEnv;
    }

    case 'BlockStatement': {
      let currentEnv = env;
      let lastType = null;
      for (const stmt of node.body) {
        if (stmt.type === 'VariableDeclaration') {
          currentEnv = infer(stmt, currentEnv, subst);
        } else {
          lastType = infer(stmt, currentEnv, subst);
        }
      }
      return lastType;
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

// Helper to print types (optional)
export function showType(type) {
  switch (type.tag) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'var': return `'${type.id}`;
    case 'array': return `[${showType(type.elemType)}]`;
    case 'funN': return `(${type.params.map(showType).join(', ')}) => ${showType(type.result)}`;
  }
}
