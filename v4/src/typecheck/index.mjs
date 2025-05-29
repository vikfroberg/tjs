import path from "path";
import chalk from "chalk";
import { ok, error } from "../result.mjs";
import * as E from "../error.mjs";
import util from "util";
import Env from "./env.mjs";
import * as T from "./types/data.mjs";
import { applySubst, unify } from "./types/unfify.mjs";
import { generalize, instantiate } from "./types/generalize.mjs";
import inferExprImpl from "./infer/expression.mjs";
import inferModule from "./infer/module.mjs";
import {
  unsupported,
  binaryExpressionMismatch,
  binaryExpressionUnsupportedType,
  unaryExpressionUnsupportedType,
  arityMismatch,
  paramMismatch,
} from "./errors/data.mjs";
import { renderError } from "./errors/rendering.mjs";

export {
  string as tString,
  number as tNumber,
  bool as tBoolean,
  funN as tFunN,
  typeVar as tVar,
  scheme as tScheme,
} from "./types/data.mjs";
export { default as Env } from "./env.mjs";
// Wrapper for simple expression inference without env/subst
export let inferExpr = (node, env = new Env(), subst = {}) => {
  return inferExprImpl(node, env, subst);
};

export { inferModule, renderError };
export {
  unsupported,
  binaryExpressionMismatch,
  binaryExpressionUnsupportedType,
  unaryExpressionUnsupportedType,
  arityMismatch,
  paramMismatch,
};

// Re-export the actual implementation with a different name
export { default as inferExprImpl } from "./infer/expression.mjs";
