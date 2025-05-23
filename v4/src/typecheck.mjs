import path from 'path';
import chalk from 'chalk';
import { createUnificationError, createUnsupportedError, createInternalError } from './error.mjs';

let currentRelativeFilePath = '';
let currentSourceLines = [];

let concreteType = (name) => ({ type: 'concrete', name });
let createSum = (types) => ({ type: 'sum', types });
let createModule = (exports) => ({ exports, });

let stringify = (t) => {
  if (t.type === 'concrete') return t.name;
  return t.name;
}

let unify = (t1, t2, subst) => {
  if (t1 === t2) return { ok: true, subst };
  if (t1.type === 'concrete' && t2.type === 'concrete' && t1.name === t2.name) return { ok: true, subst };

  return { error: true, subst };
}

export let inferExpr = (node, env, subst = {}) => {
  switch (node.type) {
    case 'Identifier':
      return env[node.name];

    case 'BinaryExpression':
      switch (node.operator) {
        case '+': {
          const left = inferExpr(node.left, env, subst);
          const right = inferExpr(node.right, env, subst);

          let aside = `The ${chalk.green('(' + node.operator + ')')} operator only works with either ${chalk.yellow('string')} or ${chalk.yellow('number')}.`;
          let hint = 'Casting is not allowed, like in regular JavaScript.';
          if (left.type === 'concrete' && left.name === 'string') {
            let tLeft = unify(concreteType('string'), left, subst)
            let tRight = unify(concreteType('string'), right, subst)
            let message = `I cannot perform ${chalk.green('(' + node.operator + ')')} with string and ${chalk.yellow(stringify(right))}:`;
            if (tRight.error) {
              console.error(createUnificationError(node.right, { hint, aside, message, expected: "string", actual: right.name, filePath: currentRelativeFilePath, sourceLines: currentSourceLines }));
              process.exit(1);
            } else {
              return concreteType('string');
            }
          } else if (left.type === 'concrete' && left.name === 'number') {
            let tLeft = unify(concreteType('number'), left, subst)
            let tRight = unify(concreteType('number'), right, subst)
            let message = `I cannot perform ${chalk.green('(' + node.operator + ')')} with ${chalk.yellow('number')} and ${chalk.yellow(stringify(right))}:`;
            if (tRight.error) {
              console.error(createUnificationError(node.right, { hint, aside, message, expected: "number", actual: right.name, filePath: currentRelativeFilePath, sourceLines: currentSourceLines }));
              process.exit(1);
            } else {
              return concreteType('number');
            }
          }
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
          let tLeft = unify(concreteType('number'), left, subst)
          let tRight = unify(concreteType('number'), right, subst)
          let aside = `The ${chalk.green('(' + node.operator + ')')} operator only works with numbers.`;
          if (tLeft.error) {
            let message = `I cannot perform (${node.operator}) with ${stringify(left)} values like this one:`;
            console.error(createUnificationError(node.left, { hint, aside, message,  expected: "number", actual: left.name, filePath: currentRelativeFilePath, sourceLines: currentSourceLines }));
            process.exit(1);
          } else if (tRight.error) {
            let message = `I cannot perform (${node.operator}) with ${stringify(right)} values like this one:`;
            console.error(createUnificationError(node.right, { hint, aside, message, expected: "number", actual: right.name, filePath: currentRelativeFilePath, sourceLines: currentSourceLines }));
            process.exit(1);
          }
          return concreteType('number');
        }
        default: {
          console.log(createUnsupportedError(node));
          process.exit(1);
        }
      }

    case 'Literal':
      if (typeof node.value === 'number') return concreteType('number');
      if (typeof node.value === 'string') return concreteType('string');
      if (typeof node.value === 'boolean') return concreteType('boolean');
      console.log(createUnsupportedError(node));
      process.exit(1);

    default:
      console.log(createUnsupportedError(node));
      process.exit(1);
  }
}

export let inferModule = (module, moduleInterfaces, env = {}, subst = {}) => {
  currentRelativeFilePath = module.relativeFilePath;
  currentSourceLines = module.sourceLines;
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

