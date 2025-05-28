import path from "path";
import chalk from "chalk";
import { ok, error } from "../result.mjs";
import * as E from "../error.mjs";
import util from "util";
import Env from "./env.mjs";
import * as T from "./types.mjs";

function debug(result) {
  console.log(result);
  return result;
}

export {
  string as tString,
  number as tNumber,
  bool as tBoolean,
  funN as tFunN,
  typeVar as tVar,
  scheme as tScheme,
} from "./types.mjs";
export { default as Env } from "./env.mjs";

// ERRORS

export let unsupported = (node, context) => ({
  type: "unsupported",
  node,
  context,
});
export let binaryExpressionMismatch = (node, context) => ({
  type: "binaryExpressionMismatch",
  node,
  context,
});
export let binaryExpressionUnsupportedType = (node, context) => ({
  type: "binaryExpressionUnsupportedType",
  node,
  context,
});
export let unaryExpressionUnsupportedType = (node, context) => ({
  type: "unaryExpressionUnsupportedType",
  node,
  context,
});
export let arityMismatch = (node, context) => ({
  type: "arityMismatch",
  node,
  context,
});
export let paramMismatch = (node, context) => ({
  type: "paramMismatch",
  node,
  context,
});

let formatN = (n) =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
let pluralize = (word, count) => (count === 1 ? word : word + "s");

export let renderError = (error, module) => {
  switch (error.type) {
    case "unsupported": {
      return E.stack({ spacing: 2 }, [
        E.header("UNSUPPORTED", module.relativeFilePath),
        E.reflow("You used a feature that is not supported"),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            "This feature is most likely not supported because it makes it harder to type check or it's encuraged not to be used.",
          ),
        ]),
        process.env.NODE_ENV === "development"
          ? E.reflow(
              E.hint(
                `If you're a compiler developer you might want to know that this happened in the ${E.type(error.context.stage)} stage on node type ${E.type(error.node.type)}.`,
              ),
            )
          : undefined,
      ]);
    }
    case "binaryExpressionMismatch": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `I cannot perform ${E.operator(error.node.operator)} on different types:`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            `The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map((t) => E.type(stringify(t))).join(" | ")}.`,
          ),
        ]),
        E.hint(
          "Implicit casting is not allowed, you must explicitly cast the types.",
        ),
      ]);
    }
    case "binaryExpressionUnsupportedType": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.context.left))}`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            `The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map((t) => E.type(stringify(t))).join(" | ")}.`,
          ),
        ]),
      ]);
    }
    case "unaryExpressionUnsupportedType": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.context.left))}`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            `The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map((t) => E.type(stringify(t))).join(" | ")}.`,
          ),
        ]),
      ]);
    }
    case "arityMismatch": {
      return E.stack({ spacing: 2 }, [
        E.header("ARITY MISMATCH", module.relativeFilePath),
        E.reflow(
          `${
            error.context.fnName
              ? `The \`${error.context.fnName}\` function`
              : "This function"
          } expects ${error.context.expectedArity} ${pluralize("argument", error.context.expectedArity)} but got ${error.context.actualArity} instead.`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
        ]),
      ]);
    }
    case "paramMismatch": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `The ${formatN(error.context.paramIndex + 1)} argument to \`${error.context.fnName || "this function"}\` is not what I expect:`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.context.actualParamLoc.start.line - 1],
            error.context.actualParamLoc,
          ),
          E.reflow(
            `This argument is of type ${E.type(stringify(error.context.actualParamType))}.`,
          ),
        ]),
        E.reflow(
          `But \`${error.context.fnName}\` needs the ${formatN(error.context.paramIndex + 1)} argument to be of type ${E.type(stringify(error.context.expectedParamType))}.`,
        ),
      ]);
    }
  }
};

let occursInType = (tVar, type) => {
  switch (type.type) {
    case "var":
      return tVar.id === type.id;
    case "function":
      return (
        type.paramTypes.some((paramType) => occursInType(tVar, paramType)) ||
        occursInType(tVar, type.returnType)
      );
    case "scheme":
      return occursInType(tVar, type.body);
    default:
      return false;
  }
};

let applySubst = (subst, type) => {
  switch (type.type) {
    case "var":
      return subst[type.id] ? applySubst(subst, subst[type.id]) : type;
    case "function":
      return T.funN(
        type.paramTypes.map((paramType) => applySubst(subst, paramType)),
        applySubst(subst, type.returnType),
      );
    case "scheme":
      // Don't substitute bound variables in schemes
      const filteredSubst = { ...subst };
      for (const tVar of type.vars) {
        delete filteredSubst[tVar.id];
      }
      return T.scheme(type.vars, applySubst(filteredSubst, type.body));
    default:
      return type;
  }
};

let freeTypeVars = (type) => {
  switch (type.type) {
    case "var":
      return new Set([type.id]);
    case "function":
      const paramVars = type.paramTypes.reduce(
        (acc, param) => new Set([...acc, ...freeTypeVars(param)]),
        new Set(),
      );
      const returnVars = freeTypeVars(type.returnType);
      return new Set([...paramVars, ...returnVars]);
    case "scheme":
      const bodyVars = freeTypeVars(type.body);
      const boundVars = new Set(type.vars.map((v) => v.id));
      return new Set([...bodyVars].filter((v) => !boundVars.has(v)));
    default:
      return new Set();
  }
};

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
};

let generalize = (env, type) => {
  const envVars = freeTypeVarsInEnv(env);
  const typeVars = freeTypeVars(type);
  const generalizedVars = [...typeVars].filter((v) => !envVars.has(v));

  if (generalizedVars.length === 0) {
    return type;
  }

  const vars = generalizedVars.map((id) => ({ type: "var", id }));
  return T.scheme(vars, type);
};

let instantiate = (scheme) => {
  if (scheme.type !== "scheme") {
    return scheme;
  }

  const subst = {};
  for (const tVar of scheme.vars) {
    subst[tVar.id] = T.freshTypeVar();
  }

  return applySubst(subst, scheme.body);
};

let unify = (t1, t2, subst = {}) => {
  t1 = applySubst(subst, t1);
  t2 = applySubst(subst, t2);

  if (t1.type === "var") {
    if (t1.id === t2.id) {
      return ok(subst);
    } else {
      if (occursInType(t1, t2)) return error({ type: "occursCheck", subst });
      subst[t1.id] = t2;
      return ok(subst);
    }
  }

  if (t2.type === "var") return unify(t2, t1, subst);

  if (t1.type === t2.type) {
    if (t1.type === "number" || t1.type === "boolean" || t1.type === "string") {
      return ok(subst);
    } else if (t1.type === "function") {
      if (t1.paramTypes.length !== t2.paramTypes.length) {
        return error({ type: "arityMismatch", subst });
      }
      for (let i = 0; i < t1.paramTypes.length; i++) {
        let paramResult = unify(t1.paramTypes[i], t2.paramTypes[i], subst);
        if (paramResult.error)
          return error({ type: "paramMismatch", paramIndex: i, subst });
      }
      let returnResult = unify(t1.returnType, t2.returnType, subst);
      if (returnResult.error) return error({ type: "returnMismatch", subst });
      return ok(subst);
    }
    throw new Error(`Unknown type ${t1.type}`);
  }

  return error({ type: "typeMismatch", subst });
};

/* MODULES ---------------------------------------- */

export function inferModule(
  module,
  moduleInterfaces,
  env = new Env(),
  subst = {},
) {
  let exports = {};

  for (const node of module.ast.body) {
    console.log(node);
    if (node.type === "VariableDeclaration") {
      let result = inferVariableDeclaration(node, env, subst);
      if (result.error) return result;
    } else if (node.type === "ExportNamedDeclaration") {
      let result = inferExportNamedDeclaration(node, env, subst, exports);
      if (result.error) return result;
    } else if (node.type === "ExportDefaultDeclaration") {
      let result = inferExportDefaultDeclaration(node, env, subst, exports);
      if (result.error) return result;
    } else if (node.type === "ImportDeclaration") {
      let result = inferImportDeclaration(node, env, subst);
      if (result.error) return result;
    } else {
      return error(unsupported(node, { stage: "inferModule" }));
    }
  }

  return ok(T.module_(exports));
}

/* EXPRESSIONS ---------------------------------------- */

export function inferExpr(node, env, subst = {}) {
  switch (node.type) {
    case "Identifier":
      return inferIdentifier(node, env, subst);

    case "UnaryExpression":
      return inferUnaryExpression(node, env, subst);

    case "BinaryExpression":
      return inferBinaryExpression(node, env, subst);

    case "ArrowFunctionExpression":
      return inferArrowFunctionExpression(node, env, subst);

    case "CallExpression":
      return inferCallExpression(node, env, subst);

    case "ConditionalExpression":
      return inferConditionalExpression(node, env, subst);

    case "Literal":
      return inferLiteral(node);

    default:
      return error(unsupported(node, { stage: "inferExpr" }));
  }
}

/* IDENTIFIER ---------------------------------------- */

function inferIdentifier(node, env, subst) {
  const scheme = env.get(node.name);
  if (!scheme) {
    return error(
      unsupported(node, { stage: "inferExpr.Identifier.undefined" }),
    );
  }
  // Instantiate the type scheme
  const type = instantiate(scheme);
  return ok(type);
}

/* UNARY ---------------------------------------- */

function inferUnaryExpression(node, env, subst) {
  switch (node.operator) {
    case "~":
    case "+":
    case "-": {
      const right = inferExpr(node.argument, env, subst);
      if (right.error) return right;
      let number = unify(right.value, T.number, subst);
      if (number.error)
        return error(
          unaryExpressionUnsupportedType(node, { types: [T.number] }),
        );
      return ok(T.number);
    }
    case "!": {
      const right = inferExpr(node.argument, env, subst);
      if (right.error) return right;
      let boolean = unify(right.value, T.bool, subst);
      if (boolean.error)
        return error(unaryExpressionUnsupportedType(node, { types: [T.bool] }));
      return ok(T.bool);
    }
    default: {
      return error(unsupported(node, { stage: "inferExpr.UnaryExpression" }));
    }
  }
}

/* BINARY ---------------------------------------- */

function inferBinaryExpression(node, env, subst) {
  switch (node.operator) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "**":
    case "|":
    case "&":
    case "^":
    case "<<":
    case ">>":
    case ">>>":
      return inferBinaryExpressionArithmetic(node, env, subst);
    case "<":
    case ">":
    case "<=":
    case ">=":
      return debug(inferBinaryExpressionComparison(node, env, subst));
    case "==":
    case "!=":
    case "===":
    case "!==":
      return inferBinaryExpressionEquality(node, env, subst);
    default: {
      return error(unsupported(node, { stage: "inferExpr.BinaryExpression" }));
    }
  }
}

function inferBinaryExpressionArithmetic(node, env, subst) {
  const left = inferExpr(node.left, env, subst);
  const right = inferExpr(node.right, env, subst);
  if (left.error) return left;
  if (right.error) return right;
  let same = unify(left.value, right.value, subst);
  if (same.error)
    return error(binaryExpressionMismatch(node, { types: [T.number] }));
  let number = unify(left.value, T.number, subst);
  if (number.error)
    return error(
      binaryExpressionUnsupportedType(node, {
        left: left.value,
        types: [T.number],
      }),
    );
  return ok(T.number);
}

function inferBinaryExpressionComparison(node, env, subst) {
  const left = inferExpr(node.left, env, subst);
  const right = inferExpr(node.right, env, subst);
  if (left.error) return left;
  if (right.error) return right;
  let same = unify(left.value, right.value, subst);
  if (same.error)
    return error(binaryExpressionMismatch(node, { types: [T.number] }));
  let number = unify(left.value, T.number, subst);
  if (number.error)
    return error(
      binaryExpressionUnsupportedType(node, {
        left: left.value,
        types: [T.number],
      }),
    );
  return ok(T.bool);
}

function inferBinaryExpressionEquality(node, env, subst) {
  const left = inferExpr(node.left, env, subst);
  const right = inferExpr(node.right, env, subst);
  if (left.error) return left;
  if (right.error) return right;
  let same = unify(left.value, right.value, subst);
  if (same.error)
    return error(
      binaryExpressionMismatch(node, {
        types: [T.number, T.string, T.bool],
      }),
    );
  return ok(T.bool);
}

/* FUNCTIONS ----------------------------------------------------- */

function inferArrowFunctionExpression(node, env, subst) {
  env.push();
  const paramTypes = [];

  for (const param of node.params) {
    if (param.type !== "Identifier") {
      return error(
        unsupported(param, {
          stage: "inferExpr.ArrowFunctionExpression.params",
        }),
      );
    }
    const typeVar = T.freshTypeVar();
    env.set(param.name, typeVar);
    paramTypes.push(typeVar);
  }

  const body = inferExpr(node.body, env, subst);
  if (body.error) return body;

  env.pop();
  let fun = T.funN(
    paramTypes.map((paramType) => applySubst(subst, paramType)),
    applySubst(subst, body.value),
  );
  return ok(fun);
}

function inferCallExpression(node, env, subst) {
  const fnType = inferExpr(node.callee, env, subst);
  if (fnType.error) return fnType;

  const argTypes = [];
  for (const arg of node.arguments) {
    const argType = inferExpr(arg, env, subst);
    if (argType.error) return argType;
    argTypes.push(argType.value);
  }

  const returnType = T.freshTypeVar();
  const expectedFnType = T.funN(argTypes, returnType);

  let call = unify(fnType.value, expectedFnType, subst);
  if (call.error) {
    if (fnType.value.type === "function") {
      const actualArity = argTypes.length;
      const expectedArity = fnType.value.paramTypes.length;

      if (actualArity !== expectedArity) {
        const fnName =
          node.callee.type === "Identifier" ? node.callee.name : null;
        return error(
          arityMismatch(node, {
            fnName,
            actualArity,
            expectedArity,
          }),
        );
      } else {
        for (let i = 0; i < argTypes.length; i++) {
          let paramCheck = unify(argTypes[i], fnType.value.paramTypes[i], {});
          if (paramCheck.error) {
            const fnName =
              node.callee.type === "Identifier" ? node.callee.name : null;

            return error(
              paramMismatch(node, {
                fnName,
                paramIndex: i,
                actualParamType: argTypes[i],
                expectedParamType: fnType.value.paramTypes[i],
                actualParamLoc: node.arguments[i].loc,
              }),
            );
          }
        }
      }
    }

    // If we get here, it's some other kind of type error
    return error(unsupported(node, { stage: "inferExpr.CallExpression" }));
  }
  return ok(applySubst(subst, returnType));
}

/* CONDITIONAL ---------------------------------------- */

function inferConditionalExpression(node, env, subst) {
  const test = inferExpr(node.test, env, subst);
  if (test.error) return test;
  let testUnify = unify(test.value, T.bool, subst);
  if (testUnify.error)
    return error(
      unsupported(node, {
        stage: "inferExpr.ConditionalExpression.testNotBoolean",
      }),
    );
  const consequent = inferExpr(node.consequent, env, subst);
  if (consequent.error) return consequent;
  const alternate = inferExpr(node.alternate, env, subst);
  if (alternate.error) return alternate;
  let branchUnify = unify(consequent.value, alternate.value, subst);
  if (branchUnify.error)
    return error(
      unsupported(node, {
        stage: "inferExpr.ConditionalExpression.branchMismatch",
      }),
    );
  return ok(applySubst(subst, consequent.value));
}

/* LITERALS ---------------------------------------- */

function inferLiteral(node) {
  if (typeof node.value === "number") return ok(T.number);
  if (typeof node.value === "string") return ok(T.string);
  if (typeof node.value === "boolean") return ok(T.bool);
  return error(unsupported(node, { stage: "inferLiteral" }));
}

/* VARIABLES ---------------------------------------- */

function inferVariableDeclaration(node, env, subst) {
  for (const decl of node.declarations) {
    const name = decl.id.name;
    const expr = decl.init;
    const selfTypeVar = T.freshTypeVar();
    env.set(name, selfTypeVar);
    const type = inferExpr(expr, env, subst);
    if (type.error) return type;
    const unifyResult = unify(selfTypeVar, type.value, subst);
    if (unifyResult.error)
      return error(
        unsupported(decl, {
          stage: "inferModule.VariableDeclaration.recursion",
        }),
      );
    const finalType = applySubst(subst, selfTypeVar);
    const generalizedType = generalize(env, finalType);
    env.set(name, generalizedType);
  }
  return ok();
}

/* EXPORTS ---------------------------------------- */

function inferExportNamedDeclaration(node, env, subst, exports) {
  if (node.declaration) {
    if (node.declaration.type === "VariableDeclaration") {
      for (const decl of node.declaration.declarations) {
        const name = decl.id.name;
        const expr = decl.init;
        const selfTypeVar = T.freshTypeVar();
        env.set(name, selfTypeVar);
        const type = inferExpr(expr, env, subst);
        if (type.error) return type;
        const unifyResult = unify(selfTypeVar, type.value, subst);
        if (unifyResult.error)
          return error(
            unsupported(decl, {
              stage: "inferModule.ExportNamedDeclaration.recursion",
            }),
          );
        const finalType = applySubst(subst, selfTypeVar);
        const generalizedType = generalize(env, finalType);
        env.set(name, generalizedType);
        exports[name] = generalizedType;
      }
    } else {
      return error(
        unsupported(node.declaration, {
          stage: "inferModule.ExportNamedDeclaration",
        }),
      );
    }
  }
  return ok();
}

function inferExportDefaultDeclaration(node, env, subst, exports) {
  const type = inferExpr(node.declaration, env, subst);
  if (type.error) return type;
  const generalizedType = generalize(env, type.value);
  env.set("__default__", generalizedType);
  exports["__default__"] = generalizedType;
  return ok();
}

/* IMPORTS ---------------------------------------- */

function inferImportDeclaration(node, env, subst) {
  const importedSource = path.resolve(
    path.dirname(module.absoluteFilePath),
    node.source.value,
  );
  let importedInterface = moduleInterfaces.get(importedSource);
  for (const spec of node.specifiers) {
    const type = importedInterface[spec.imported.name];
    env.set(spec.local.name, type);
  }
  return ok();
}
