import * as E from "../../error.mjs";

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
