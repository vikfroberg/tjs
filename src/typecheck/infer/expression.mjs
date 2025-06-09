import { ok, error } from "../../result.mjs";
import * as T from "../types/data.mjs";
import { applySubst, unify } from "../types/unfify.mjs";
import { generalize, instantiate } from "../types/generalize.mjs";
import {
  unsupported,
  binaryExpressionMismatch,
  binaryExpressionUnsupportedType,
  unaryExpressionUnsupportedType,
  arityMismatch,
  paramMismatch,
} from "../error/data.mjs";

/* EXPRESSIONS ---------------------------------------- */

export default function inferExpr(node, env, subst = {}) {
  switch (node.type) {
    case "Identifier":
      return inferIdentifier(node, env, subst);

    case "UnaryExpression":
      return inferUnaryExpression(node, env, subst);

    case "BinaryExpression":
      return inferBinaryExpression(node, env, subst);

    case "LogicalExpression":
      return inferLogicalExpression(node, env, subst);

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
      return inferBinaryExpressionComparison(node, env, subst);
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

function inferLogicalExpression(node, env, subst) {
  switch (node.operator) {
    case "&&":
    case "||":
      return inferLogicalExpressionBoolean(node, env, subst);
    default: {
      return error(unsupported(node, { stage: "inferExpr.LogicalExpression" }));
    }
  }
}

function inferLogicalExpressionBoolean(node, env, subst) {
  const left = inferExpr(node.left, env, subst);
  const right = inferExpr(node.right, env, subst);
  if (left.error) return left;
  if (right.error) return right;
  let leftBool = unify(left.value, T.bool, subst);
  if (leftBool.error)
    return error(
      binaryExpressionUnsupportedType(node, {
        left: left.value,
        types: [T.bool],
      }),
    );
  let rightBool = unify(right.value, T.bool, subst);
  if (rightBool.error)
    return error(
      binaryExpressionUnsupportedType(node, {
        left: right.value,
        types: [T.bool],
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
          stage: "inferExpr.ArrowFunctionExpression",
          message: "Only Identifiers are supported in parameter lists",
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
  if (node.value === null) return ok(T.null_);
  return error(unsupported(node, { stage: "inferLiteral" }));
}
