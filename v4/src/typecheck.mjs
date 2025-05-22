import path from 'path';

let concreteType = (name) => ({ type: 'concrete', name });
let createModule = (exports) => ({ exports, });

let unify = (t1, t2, subst, node) => {
  if (t1 === t2) return;
  if (t1.type === 'concrete' && t2.type === 'concrete' && t1.name === t2.name) return;

  console.log(createUnificationError(node, { expected: t1.name, actual: t2.name }));
  process.exit(1);
}

export let inferExpr = (node, env, subst = {}) => {
  switch (node.type) {
    case 'Identifier':
      return env[node.name];

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
        case '>>>':
          const left = inferExpr(node.left, env, subst);
          const right = inferExpr(node.right, env, subst);
          unify(concreteType('Number'), left, subst, node.left);
          unify(concreteType('Number'), right, subst, node.right);
          return concreteType('Number');
        default:
          console.log(createUnsupportedError(node));
          process.exit(1);
      }

    case 'Literal':
      if (typeof node.value === 'number') return concreteType('Number');
      if (typeof node.value === 'string') return concreteType('String');
      if (typeof node.value === 'boolean') return concreteType('Boolean');
      console.log(createUnsupportedError(node));
      process.exit(1);

    default:
      console.log(createUnsupportedError(node));
      process.exit(1);
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
        env[name] = type; // TODO: This does not support recursive let bindings
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          for (const decl of node.declaration.declarations) {
            const name = decl.id.name;
            const expr = decl.init;
            const type = inferExpr(expr, env, subst);
            env[name] = type;
            exports[name] = type;
          }
        } else {
          console.log(createInternalError(node.declaration, { phase: 'infer' }));
          process.exit(1);
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const type = inferExpr(node.declaration, env, subst);
      env['__default__'] = type;
      exports['__default__'] = type;
    } else if (node.type === 'ImportDeclaration') {
      const importedSource = path.resolve(path.dirname(module.absoluteFilePath), node.source.value);
      let importedInterface = moduleInterfaces.get(importedSource);
      for (const spec of node.specifiers) {
        const type = importedInterface[spec.imported.name];
        env[spec.local.name] = type;
      }
    } else {
      console.log(createInternalError(node.declaration, { phase: 'infer' }));
      process.exit(1);
    }
  }
  return createModule(exports);
}

