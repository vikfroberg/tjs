let typeVarCounter = 0;

function freshTypeVar() {
  return { tag: 'var', id: ++typeVarCounter };
}

const tNumber = { tag: 'number' };
const tBoolean = { tag: 'boolean' };
const tString = { tag: 'string' };
const tEmptyRow = { tag: 'empty-row' };

function tFunN(params, result) {
  return { tag: 'funN', params, result };
}

function tArray(elemType) {
  return { tag: 'array', elemType };
}

function tRecord(fields, row = tEmptyRow) {
  return { tag: 'record', fields, row };
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
    case 'record': {
      const fieldVars = Object.values(type.fields).flatMap(t => [...freeTypeVars(t)]);
      const rowVars = freeTypeVars(type.row);
      return new Set([...fieldVars, ...rowVars]);
    }
    case 'empty-row':
      return new Set();
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
    case 'record':
      return Object.values(type.fields).some(t => occursInType(v, t)) || occursInType(v, type.row);
    case 'empty-row':
      return false;
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
    case 'record': {
      const newFields = {};
      for (const [key, val] of Object.entries(type.fields)) {
        newFields[key] = applySubst(subst, val);
      }
      return tRecord(newFields, applySubst(subst, type.row));
    }
    case 'empty-row':
      return type;
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
      case 'string':
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
      case 'record': {
        const keys1 = Object.keys(t1.fields);
        const keys2 = Object.keys(t2.fields);

        const commonKeys = keys1.filter(k => k in t2.fields);
        for (const key of commonKeys) {
          unify(t1.fields[key], t2.fields[key], subst);
        }

        const extra1 = {};
        const extra2 = {};
        for (const k of keys1) {
          if (!(k in t2.fields)) extra1[k] = t1.fields[k];
        }
        for (const k of keys2) {
          if (!(k in t1.fields)) extra2[k] = t2.fields[k];
        }

        if (t1.row.tag === 'empty-row' && Object.keys(extra2).length > 0) {
          throw new Error('Cannot add fields to closed record');
        }
        if (t2.row.tag === 'empty-row' && Object.keys(extra1).length > 0) {
          throw new Error('Cannot add fields to closed record');
        }

        unify(applySubst(subst, t1.row), tRecord(extra2, freshTypeVar()), subst);
        unify(applySubst(subst, t2.row), tRecord(extra1, freshTypeVar()), subst);
        return subst;
      }
      case 'empty-row':
        return subst;
    }
  }

  throw new Error(`Cannot unify ${showType(t1)} with ${showType(t2)}`);
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

    case 'LogicalExpression': {
      const leftType = infer(node.left, env, subst);
      const rightType = infer(node.right, env, subst);
      unify(leftType, tBoolean, subst);
      unify(rightType, tBoolean, subst);
      return tBoolean;
    }

    case 'ArrowFunctionExpression': 
    case 'FunctionDeclaration': {
      const paramTypes = node.params.map(param => {
        if (param.type === 'AssignmentPattern') {
          return infer(param.right, env, subst);
        } else {
        return freshTypeVar()
        }
      });
      let newEnv = node.type === 'FunctionDeclaration' ? extendEnv(env, node.id.name, typeScheme(tFunN(paramTypes, freshTypeVar()))) : env;
      node.params.forEach((param, i) => {
        const name = param.type === 'AssignmentPattern' ? param.left.name : param.name;
        newEnv = extendEnv(newEnv, name, typeScheme(paramTypes[i]));
      });
      const bodyType = infer(node.body, newEnv, subst);
      return tFunN(paramTypes.map(t => applySubst(subst, t)), bodyType);
    }

    case 'ReturnStatement': {
      return infer(node.argument, env, subst);
    }

    case 'ObjectExpression': {
      const fieldTypes = {};
      if (node.properties.length === 0) return tRecord({});
      if (node.properties.filter(p => p.type === 'SpreadElement').length > 1) {
        throw new Error('Only one spread allowed in object literal');
      }
      const [first, ...rest] = node.properties;
      if (first.type === 'SpreadElement') {
        const baseType = infer(node.properties[0].argument, env, subst);
        const applied = applySubst(subst, baseType);

        if (applied.tag !== 'record') throw new Error('Can only update records');

        for (const prop of rest) {
          if (prop.type !== 'Property' || prop.kind !== 'init') {
            throw new Error('Only simple properties allowed in record updates');
          }

          const key = prop.key.name || prop.key.value;
          if (!(key in applied.fields)) {
            throw new Error(`Cannot add new field '${key}' via update`);
          }

          const expectedType = applied.fields[key];
          const valueType = infer(prop.value, env, subst);
          unify(expectedType, valueType, subst);
        }

        return applied;
      } else {
        for (const prop of node.properties) {
          if (prop.type !== 'Property' || prop.kind !== 'init') {
            throw new Error('Only simple object properties are supported');
          }
          const key = prop.key.name || prop.key.value;
          fieldTypes[key] = infer(prop.value, env, subst);
        }
        return tRecord(fieldTypes, freshTypeVar());
      }
    }

    case 'MemberExpression': {
      if (node.computed) throw new Error('Only dot-access is supported');
      const objType = infer(node.object, env, subst);
      const field = node.property.name;
      const resultType = freshTypeVar();
      const expectedRecord = tRecord({ [field]: resultType }, freshTypeVar());
      unify(objType, expectedRecord, subst);
      return applySubst(subst, resultType);
    }

    case 'SwitchStatement': {
      const discType = infer(node.discriminant, env, subst);
      let resultType = freshTypeVar();
      let hasDefault = false;

      for (const switchCase of node.cases) {
        if (switchCase.test !== null) {
          const caseType = infer(switchCase.test, env, subst);
          unify(discType, caseType, subst);
        } else {
          // TODO: Does this really work?
          hasDefault = true;
        }

        for (const stmt of switchCase.consequent) {
          const stmtType = infer(stmt, env, subst);
          unify(resultType, stmtType, subst);
        }
      }

      return applySubst(subst, resultType);
    }

    case 'ExpressionStatement': {
      // console.log(node);
      return { tag: 'expression' };
    }

    // TODO: Hacky, how do we handle classes in js? Eg Set, Array, Map, etc.
    case 'NewExpression': {
      return infer(node.arguments[0], env, subst);
    }

    case 'ForOfStatement': {
      // console.log(node);
      return { tag: 'for-of' };
    }

    case 'UnaryExpression': {
      const argType = infer(node.argument, env, subst);

      switch (node.operator) {
        case '+':
        case '-':
        case '~':
          unify(argType, tNumber, subst);
          return tNumber;

        case '!':
          unify(argType, tBoolean, subst);
          return tBoolean;

        default:
          throw new Error(`Unsupported unary operator: ${node.operator}`);
      }
    }

    case 'CallExpression': {
      const fnType = infer(node.callee, env, subst);
      const argTypes = node.arguments.map(arg => infer(arg, env, subst));
      const resultType = freshTypeVar();

      unify(fnType, tFunN(argTypes.map(t => applySubst(subst, t)), resultType), subst);
      return applySubst(subst, resultType);
    }

    case 'ArrayExpression': {
      const elementTypes = [];

      for (const el of node.elements) {
        if (el === null) {
          throw new Error('Array holes are not supported');
        }

        if (el.type === 'SpreadElement') {
          const spreadType = infer(el.argument, env, subst);

          if (spreadType.tag !== 'array') {
            throw new Error(`Spread elements must be arrays, was ${showType(spreadType)}`);
          }

          elementTypes.push(spreadType.elemType);
        } else {
          const elType = infer(el, env, subst);
          elementTypes.push(elType);
        }
      }

      if (elementTypes.length === 0) {
        return tArray(freshTypeVar());
      }

      const baseType = elementTypes[0];
      for (const et of elementTypes.slice(1)) {
        unify(baseType, et, subst);
      }

      return tArray(applySubst(subst, baseType));
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

    case 'UpdateExpression': {
      return infer(node.argument, env, subst);
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

// Helper to print types (optional)
export function showType(type) {
  if (type.tag === 'number') {
    return 'number';
  } else if (type.tag === 'boolean') {
    return 'boolean';
  } else if (type.tag === 'string') {
    return 'string';
  } else if (type.tag === 'var') {
    return type.id;
  } else if (type.tag === 'array') {
    if (type.elemType.tag === 'var') {
      return `[]`;
    }
    return `[${showType(type.elemType)}]`;
  } else if (type.tag === 'funN') {
    return `(${type.params.map(showType).join(', ')}) => ${showType(type.result)}`;
  } else if (type.tag === 'record') {
    if (Object.entries(type.fields).length === 0) {
      return '{}';
    }
    return `{ ${Object.entries(type.fields).map(([k, v]) => `${k}: ${showType(v)}`).join(', ')} }`;
  } else {
    throw new Error(`Unknown type: ${JSON.stringify(type)}`);
  }
}
