import renderError from "./rendering.mjs";
import * as ErrorData from "./data.mjs";
import * as T from "../types/data.mjs";

function getErrorSamples() {
  return [
    {
      name: "Unsupported Syntax",
      module: {
        relativeFilePath: "src/unsupported.js",
        sourceLines: ["for (let key in obj) { console.log(key); }"],
      },
      error: ErrorData.unsupported(
        {
          type: "ForInStatement",
          loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 37 } },
        },
        {
          stage: "type-inference",
        },
      ),
    },
    {
      name: "Binary Expression Type Mismatch",
      module: {
        relativeFilePath: "src/binary-mismatch.js",
        sourceLines: ['let sum = 42 + "hello";'],
      },
      error: ErrorData.binaryExpressionMismatch(
        {
          type: "BinaryExpression",
          operator: "+",
          loc: { start: { line: 1, column: 10 }, end: { line: 1, column: 23 } },
        },
        {
          types: [T.number, T.string],
        },
      ),
    },
    {
      name: "Binary Expression Unsupported Type",
      module: {
        relativeFilePath: "src/binary-unsupported.js",
        sourceLines: ["let result = obj + 42;"],
      },
      error: ErrorData.binaryExpressionUnsupportedType(
        {
          type: "BinaryExpression",
          operator: "+",
          loc: { start: { line: 1, column: 13 }, end: { line: 1, column: 22 } },
        },
        {
          left: { type: "object" },
          types: [T.number, T.string],
        },
      ),
    },
    {
      name: "Unary Expression Unsupported Type",
      module: {
        relativeFilePath: "src/unary-unsupported.js",
        sourceLines: ["let result = !someString;"],
      },
      error: ErrorData.unaryExpressionUnsupportedType(
        {
          type: "UnaryExpression",
          operator: "!",
          loc: { start: { line: 1, column: 13 }, end: { line: 1, column: 24 } },
        },
        {
          left: T.string,
          types: [T.bool],
        },
      ),
    },
    {
      name: "Function Arity Mismatch",
      module: {
        relativeFilePath: "src/arity-mismatch.js",
        sourceLines: ["calculateArea(1, 2, 3, 4, 5);"],
      },
      error: ErrorData.arityMismatch(
        {
          type: "CallExpression",
          loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 26 } },
        },
        {
          fnName: "calculateArea",
          expectedArity: 2,
          actualArity: 5,
        },
      ),
    },
    {
      name: "Parameter Type Mismatch",
      module: {
        relativeFilePath: "src/param-mismatch.js",
        sourceLines: ['processNumber("not a number");'],
      },
      error: ErrorData.paramMismatch(
        {
          type: "CallExpression",
          loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 26 } },
        },
        {
          fnName: "processNumber",
          paramIndex: 0,
          actualParamType: T.string,
          expectedParamType: T.number,
          actualParamLoc: {
            start: { line: 1, column: 14 },
            end: { line: 1, column: 26 },
          },
        },
      ),
    },
  ];
}

const examples = getErrorSamples().map((sample) => {
  return {
    name: sample.name,
    value: renderError(sample.error, sample.module),
  };
});

export default examples;
