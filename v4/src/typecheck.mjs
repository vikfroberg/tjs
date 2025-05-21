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
    case 'Program': {
      let exports = {};
      console.log(node);
      for (const node of ast.body) {
        if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations) {
            const name = decl.id.name;
            const expr = decl.init;
            const type = infer(expr, env, subst);
            env[name] = type;
          }
        } else if (node.type === 'ExportNamedDeclaration') {
          if (node.declaration) {
            if (node.declaration.type === 'VariableDeclaration') {
              for (const decl of node.declaration.declarations) {
                const name = decl.id.name;
                const expr = decl.init;
                const type = infer(expr, env, subst);
                env[name] = type;
                exports[name] = type;
              }
            } else {
              console.log(createInternalError(node.declaration, { phase: 'infer' }));
              process.exit(1);
            }
          }
        } else if (node.type === 'ExportDefaultDeclaration') {
          const type = infer(node.declaration, env, subst);
          env['__default__'] = type;
          exports['__default__'] = type;
        } else if (node.type === 'ImportDeclaration') {
          // Is this where I set the env and inject dependencies into env?
        } else {
          console.log(createInternalError(node.declaration, { phase: 'infer' }));
          process.exit(1);
        }
      }
    }

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

export let inferModule = (node, env, subst = {}) => {
  let exports = {};
  for (const subNode of node.body) {
    if (subNode.type === 'VariableDeclaration') {
      for (const decl of subNode.declarations) {
        const name = decl.id.name;
        const expr = decl.init;
        const type = inferExpr(expr, env, subst);
        env[name] = type;
      }
    } else if (subNode.type === 'ExportNamedDeclaration') {
      if (subNode.declaration) {
        if (subNode.declaration.type === 'VariableDeclaration') {
          for (const decl of subNode.declaration.declarations) {
            const name = decl.id.name;
            const expr = decl.init;
            const type = inferExpr(expr, env, subst);
            env[name] = type;
            exports[name] = type;
          }
        } else {
          console.log(createInternalError(subNode.declaration, { phase: 'infer' }));
          process.exit(1);
        }
      }
    } else if (subNode.type === 'ExportDefaultDeclaration') {
      const type = inferExpr(subNode.declaration, env, subst);
      env['__default__'] = type;
      exports['__default__'] = type;
    } else if (subNode.type === 'ImportDeclaration') {
      // Is this where I set the env and inject dependencies into env?
    } else {
      console.log(createInternalError(subNode.declaration, { phase: 'infer' }));
      process.exit(1);
    }
  }
  return createModule(exports);
}

