import assert from "node:assert";
import { test, suite } from "node:test";
import { parseModule } from "meriyah";
import * as Result from "../result.mjs";
import path from "node:path";
import * as T from "./types/data.mjs";
import inferExpr from "./infer/expression.mjs";
import inferModule from "./infer/module.mjs";
import renderError from "./error/rendering.mjs";
// TODO: inferStatement for var declarations
import Env from "./env.mjs";

// Test helpers
function createTestModule(source) {
  return {
    ast: parseModule(source, { loc: true, next: true }),
    sourceLines: source.split("\n"),
    relativeFilePath: "test.mjs",
    absoluteFilePath: "/fake/path/test.mjs",
  };
}

function testExpr(description, source, expectedType) {
  test(description, () => {
    T.resetTypeVarCounter();
    let result = inferExpr(parseModule(source).body[0].expression);
    assert.deepEqual(result, Result.ok(expectedType));
  });
}

function testModule(description, source, shouldHave) {
  test(description, () => {
    let module = createTestModule(source);
    let env = new Env();
    let interfaces = new Map();

    // Set up mock imports if provided
    if (shouldHave.imports) {
      Object.entries(shouldHave.imports).forEach(([modulePath, exports]) => {
        // Resolve the import path the same way the import inference does
        const resolvedPath = path.resolve(
          path.dirname(module.absoluteFilePath),
          modulePath,
        );
        interfaces.set(resolvedPath, exports);
      });
    }

    T.resetTypeVarCounter();
    let moduleT = inferModule(module, interfaces, env);
    assert.equal(
      moduleT.error,
      false,
      "\n" + renderError(moduleT.value, module),
    );

    // Test environment bindings
    if (shouldHave.env) {
      Object.entries(shouldHave.env).forEach(([name, expectedType]) => {
        assert.deepEqual(env.get(name), expectedType);
      });
    }

    // Test module exports
    if (shouldHave.exports) {
      Object.entries(shouldHave.exports).forEach(([name, expectedType]) => {
        assert.deepEqual(moduleT.value.exports[name], expectedType);
      });
    }

    // Legacy support: if shouldHave is not an object with env/exports/imports,
    // treat it as environment bindings for backward compatibility
    if (!shouldHave.env && !shouldHave.exports && !shouldHave.imports) {
      Object.entries(shouldHave).forEach(([name, expectedType]) => {
        assert.deepEqual(env.get(name), expectedType);
      });
    }
  });
}

function testError(description, source, expectedErrorType) {
  test(description, () => {
    let module = createTestModule(source);
    let env = new Env();
    let interfaces = new Map();
    T.resetTypeVarCounter();
    let moduleT = inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, expectedErrorType);
  });
}

function testExprError(description, source, expectedErrorType) {
  test(description, () => {
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    T.resetTypeVarCounter();
    let result = inferExpr(node);
    assert.equal(result.error, true);
    assert.equal(result.value.type, expectedErrorType);
  });
}

suite("Expressions", () => {
  // Basic literals
  suite("Literals", () => {
    testExpr("string literal", "'a'", T.string);
    testExpr("number literal", "1", T.number);
    testExpr("boolean literal", "true", T.bool);
    testExpr("null literal", "null", T.null_);
  });

  // Binary expression errors
  suite("Binary expressions", () => {
    testExpr("binary expression", "1 + 1", T.number);

    testExprError(
      "binary expression mismatch",
      "1 + 'a'",
      "binaryExpressionMismatch",
    );
    testExprError(
      "binary expression mismatch reversed",
      "'a' + 1",
      "binaryExpressionMismatch",
    );
    testExprError(
      "(+) unsupported type",
      "false + true",
      "binaryExpressionUnsupportedType",
    );
    testExprError(
      "(-) unsupported type",
      "'a' - 'b'",
      "binaryExpressionUnsupportedType",
    );
  });

  // Unary expressions
  suite("Unary expressions", () => {
    testExpr("unary expression number", "-1", T.number);
    testExpr("unary expression boolean", "!true", T.bool);
    testExprError(
      "unary expression unsupported type",
      "!1",
      "unaryExpressionUnsupportedType",
    );
  });

  suite("OTHER", () => {
    // Variable bindings and functions
    testModule(
      "variable binding",
      `
    let x = 1;
    let y = x + 2;
  `,
      {
        x: T.number,
        y: T.number,
      },
    );

    testModule(
      "arrow function",
      `
    let f = (x) => x + 1;
    let y = f(1);
  `,
      {
        f: T.funN([T.number], T.number),
        y: T.number,
      },
    );

    testModule(
      "arrow function with multiple arguments",
      `
    let f = (x, y) => x + (y + 1);
    let g = (x, y) => (x + y) + 1;
    let y = f(1, 2);
    let z = g(1, 2);
  `,
      {
        f: T.funN([T.number, T.number], T.number),
        g: T.funN([T.number, T.number], T.number),
        y: T.number,
        z: T.number,
      },
    );

    // Polymorphic function - keeping detailed test for complex assertion
    test("polymorphic function", () => {
      let module = createTestModule(`
      let id = x => x;
      let a = id(42);      // id: number -> number
      let b = id("hello"); // id: string -> string
    `);
      let env = new Env();
      let interfaces = new Map();
      let moduleT = inferModule(module, interfaces, env);
      assert.equal(moduleT.error, false);
      assert.deepEqual(env.get("id").type, "scheme");
      assert.deepEqual(env.get("id").vars.length, 1);
      assert.deepEqual(env.get("id").vars[0].type, "var");
      let quantifiedVar = env.get("id").vars[0];
      assert.deepEqual(
        env.get("id").body,
        T.funN([T.typeVar(quantifiedVar.id)], T.typeVar(quantifiedVar.id)),
      );
      assert.deepEqual(env.get("a"), T.number);
      assert.deepEqual(env.get("b"), T.string);
    });

    testModule(
      "recursive function",
      `
    let factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let a = factorial(5);
  `,
      {
        a: T.number,
      },
    );

    // Comparison operators
    testModule(
      "comparison expressions",
      `
    let a = 1 < 2;
    let b = 1 <= 2;
    let c = 1 > 2;
    let d = 1 >= 2;
    let e = 1 == 2;
    let f = 1 != 2;
  `,
      {
        a: T.bool,
        b: T.bool,
        c: T.bool,
        d: T.bool,
        e: T.bool,
        f: T.bool,
      },
    );

    testError(
      "comparison expression mismatch",
      "let a = 1 < 'a';",
      "binaryExpressionMismatch",
    );
    testError(
      "equality expression mismatch",
      "let a = 1 == 'a';",
      "binaryExpressionMismatch",
    );

    // Conditional expressions
    testModule(
      "conditional expressions",
      `
    let a = true ? 1 : 2;
    let b = false ? "hello" : "world";
  `,
      {
        a: T.number,
        b: T.string,
      },
    );

    testError(
      "conditional expression type mismatch",
      "let a = true ? 1 : 'hello';",
      "unsupported",
    );

    testModule(
      "nested conditional expression",
      `
    let a = true ? (false ? 1 : 2) : 3;
  `,
      {
        a: T.number,
      },
    );

    // Function call errors
    testError(
      "function call arity mismatch - too few",
      "let f = (x, y) => x + y; let a = f(1);",
      "arityMismatch",
    );
    testError(
      "function call arity mismatch - too many",
      "let f = (x) => x + 1; let a = f(1, 2, 3);",
      "arityMismatch",
    );
    testError(
      "function call parameter type mismatch",
      "let f = (x) => x + 1; let a = f('hello');",
      "paramMismatch",
    );
    testError(
      "function call multiple parameter type mismatch",
      "let f = (x, y) => x + y; let a = f(1, 'hello');",
      "paramMismatch",
    );

    // Arithmetic operators (table-driven)
    const arithmeticOps = [
      ["5 % 3", "modulo"],
      ["2 ** 3", "exponentiation"],
      ["5 | 3", "bitwise OR"],
      ["5 & 3", "bitwise AND"],
      ["5 ^ 3", "bitwise XOR"],
      ["5 << 2", "left shift"],
      ["20 >> 2", "right shift"],
      ["20 >>> 2", "unsigned right shift"],
    ];
    arithmeticOps.forEach(([source, desc]) =>
      testExpr(`${desc} operator`, source, T.number),
    );

    testExprError(
      "bitwise operator type mismatch",
      "'hello' | 3",
      "binaryExpressionMismatch",
    );

    // Strict equality operators
    testModule(
      "strict equality operators",
      `
    let a = 1 === 1;
    let b = "hello" === "world";
    let c = 1 !== 2;
    let d = "hello" !== "world";
  `,
      {
        a: T.bool,
        b: T.bool,
        c: T.bool,
        d: T.bool,
      },
    );

    testError(
      "strict equality type mismatch",
      "let a = 1 === 'hello';",
      "binaryExpressionMismatch",
    );

    // Additional unary operators
    testExpr("bitwise NOT operator", "~5", T.number);
    testExpr("unary plus operator", "+5", T.number);
    testExprError(
      "bitwise NOT unsupported type",
      "~'hello'",
      "unaryExpressionUnsupportedType",
    );
    testExprError(
      "unary plus unsupported type",
      "+'hello'",
      "unaryExpressionUnsupportedType",
    );

    // Complex expressions and edge cases
    testModule(
      "complex nested arithmetic",
      `
    let a = ((1 + 2) * 3) - (4 / 2);
    let b = 2 ** (3 + 1) % 5;
  `,
      {
        a: T.number,
        b: T.number,
      },
    );

    testModule(
      "complex nested function calls",
      `
    let add = (x, y) => x + y;
    let multiply = (x, y) => x * y;
    let result = add(multiply(2, 3), multiply(4, 5));
  `,
      {
        result: T.number,
      },
    );

    testModule(
      "higher-order functions",
      `
    let apply = (f, x) => f(x);
    let double = x => x * 2;
    let result = apply(double, 5);
  `,
      {
        result: T.number,
      },
    );

    // Logical operators
    testModule(
      "logical operators",
      `
    let a = true && false;
    let b = true && true;
    let c = true || false;
    let d = false || false;
  `,
      {
        a: T.bool,
        b: T.bool,
        c: T.bool,
        d: T.bool,
      },
    );

    testError(
      "logical operator type mismatch",
      "let a = 1 && true;",
      "binaryExpressionUnsupportedType",
    );

    testModule(
      "mixed operators precedence",
      `
    let a = 1 + 2 * 3;
    let b = (1 + 2) * 3;
    let c = 1 < 2 && 3 > 2;
  `,
      {
        a: T.number,
        b: T.number,
        c: T.bool,
      },
    );

    testModule(
      "polymorphic function complex usage",
      `
    let first = (x, y) => x;
    let a = first(42, "hello");
    let b = first("world", 99);
    let c = first(true, false);
  `,
      {
        a: T.number,
        b: T.string,
        c: T.bool,
      },
    );

    // Import/Export tests
    suite("Import/Export", () => {
      // Basic named imports
      testModule(
        "named imports",
        `
      import { add, PI } from "./math.mjs";
      let result = add(1, 2);
      let circumference = 2 * PI;
    `,
        {
          imports: {
            "./math.mjs": {
              add: T.funN([T.number, T.number], T.number),
              PI: T.number,
            },
          },
          env: {
            add: T.funN([T.number, T.number], T.number),
            PI: T.number,
            result: T.number,
            circumference: T.number,
          },
        },
      );

      // Default imports (currently not implemented - would need spec.imported handling)
      // testModule("default import", `
      //   import Calculator from "./calc.mjs";
      //   let result = Calculator(5);
      // `, {
      //   imports: {
      //     "./calc.mjs": {
      //       default: T.funN([T.number], T.number)
      //     }
      //   },
      //   env: {
      //     Calculator: T.funN([T.number], T.number),
      //     result: T.number
      //   }
      // });

      // Renamed imports
      testModule(
        "renamed imports",
        `
      import { add as sum, multiply as mult } from "./math.mjs";
      let result = sum(1, 2);
      let product = mult(3, 4);
    `,
        {
          imports: {
            "./math.mjs": {
              add: T.funN([T.number, T.number], T.number),
              multiply: T.funN([T.number, T.number], T.number),
            },
          },
          env: {
            sum: T.funN([T.number, T.number], T.number),
            mult: T.funN([T.number, T.number], T.number),
            result: T.number,
            product: T.number,
          },
        },
      );

      // Mixed imports (named and default) - commented out since default imports not implemented
      // testModule("mixed imports", `
      //   import Calculator, { add, PI } from "./math.mjs";
      //   let result1 = Calculator(5);
      //   let result2 = add(1, 2);
      //   let area = PI * 2;
      // `, {
      //   imports: {
      //     "./math.mjs": {
      //       default: T.funN([T.number], T.number),
      //       add: T.funN([T.number, T.number], T.number),
      //       PI: T.number
      //     }
      //   },
      //   env: {
      //     Calculator: T.funN([T.number], T.number),
      //     add: T.funN([T.number, T.number], T.number),
      //     PI: T.number,
      //     result1: T.number,
      //     result2: T.number,
      //     area: T.number
      //   }
      // });

      // Multiple modules
      testModule(
        "multiple module imports",
        `
      import { add } from "./math.mjs";
      import { format } from "./string.mjs";
      let sum = add(1, 2);
      let text = format("result: {}", sum);
    `,
        {
          imports: {
            "./math.mjs": {
              add: T.funN([T.number, T.number], T.number),
            },
            "./string.mjs": {
              format: T.funN([T.string, T.number], T.string),
            },
          },
          env: {
            add: T.funN([T.number, T.number], T.number),
            format: T.funN([T.string, T.number], T.string),
            sum: T.number,
            text: T.string,
          },
        },
      );

      // Polymorphic imported functions
      testModule(
        "polymorphic imported function",
        `
      import { identity } from "./utils.mjs";
      let a = identity(42);
      let b = identity("hello");
    `,
        {
          imports: {
            "./utils.mjs": {
              identity: T.scheme(
                [T.typeVar(1)],
                T.funN([T.typeVar(1)], T.typeVar(1)),
              ),
            },
          },
          env: {
            a: T.number,
            b: T.string,
          },
        },
      );

      // Using imported functions in higher-order contexts
      testModule(
        "imported function as argument",
        `
      import { add } from "./math.mjs";
      let apply = (f, x, y) => f(x, y);
      let result = apply(add, 1, 2);
    `,
        {
          imports: {
            "./math.mjs": {
              add: T.funN([T.number, T.number], T.number),
            },
          },
          env: {
            add: T.funN([T.number, T.number], T.number),
            result: T.number,
          },
        },
      );

      // Export tests - named exports with specifiers not implemented yet
      // testModule("named exports", `
      //   let add = (x, y) => x + y;
      //   let PI = 3.14;
      //   export { add, PI };
      // `, {
      //   env: {
      //     add: T.funN([T.number, T.number], T.number),
      //     PI: T.number
      //   },
      //   exports: {
      //     add: T.funN([T.number, T.number], T.number),
      //     PI: T.number
      //   }
      // });

      testModule(
        "export with declaration",
        `
      export const multiply = (x, y) => x * y;
      export let count = 0;
    `,
        {
          env: {
            multiply: T.funN([T.number, T.number], T.number),
            count: T.number,
          },
          exports: {
            multiply: T.funN([T.number, T.number], T.number),
            count: T.number,
          },
        },
      );

      testModule(
        "default export",
        `
      let calculator = (x) => x * 2;
      export default calculator;
    `,
        {
          env: {
            calculator: T.funN([T.number], T.number),
          },
          exports: {
            __default__: T.funN([T.number], T.number),
          },
        },
      );
    });

    testModule(
      "simple recursive function",
      `
    let factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let result = factorial(5);
  `,
      {
        factorial: T.funN([T.number], T.number),
        result: T.number,
      },
    );

    // Recursive function with multiple parameters
    testModule(
      "recursive function with multiple parameters",
      `
    let gcd = (a, b) => b == 0 ? a : gcd(b, a % b);
    let result = gcd(48, 18);
  `,
      {
        gcd: T.funN([T.number, T.number], T.number),
        result: T.number,
      },
    );

    // Recursive function with polymorphic type
    testModule(
      "polymorphic recursive function",
      `
    let length = list => true ? 0 : 1 + length(list);
  `,
      {
        length: T.scheme([T.typeVar(2)], T.funN([T.typeVar(2)], T.number)),
      },
    );

    // Higher-order recursive function
    testModule(
      "higher-order recursive function",
      `
    let map = (f, list) => 
      list == null ? null : f(list);
    let double = x => x * 2;
    let result = map(double, someList);
  `,
      {
        double: T.funN([T.number], T.number),
        someList: T.null_, // THIS DOESNT WORK!
      },
    );
    /*

    // Recursive function returning function
    testModule(
      "recursive function returning function",
      `
    let rec curry = (f, x) => y => f(x, y);
    let add = (a, b) => a + b;
    let add5 = curry(add, 5);
    let result = add5(3);
  `,
      {
        add: T.funN([T.number, T.number], T.number),
        result: T.number,
      },
    );

  // Export recursive function
  testModule(
    "export recursive function",
    `
    export let rec fibonacci = n => 
      n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2);
  `,
    {
      env: {
        fibonacci: T.funN([T.number], T.number),
      },
      exports: {
        fibonacci: T.funN([T.number], T.number),
      },
    },
  );

  // Recursive function with conditional
  testModule(
    "recursive function with conditional",
    `
    let rec countdown = n => 
      n <= 0 ? "done" : countdown(n - 1);
    let result = countdown(3);
  `,
    {
      countdown: T.funN([T.number], T.string),
      result: T.string,
    },
  );

  // Test error case: multiple declarations in let rec
  testError(
    "multiple declarations in let rec",
    `
    let rec f = x => x, g = y => y;
  `,
    "unsupported",
  );

  // Test error case: multiple declarations in regular let
  testError(
    "multiple declarations in regular let",
    `
    let x = 1, y = 2;
  `,
    "unsupported",
  );

  // Test error case: type mismatch in recursive function
  testError(
    "recursive function type mismatch",
    `
    let rec broken = n => n <= 0 ? 0 : "string" + broken(n - 1);
  `,
    "binaryExpressionMismatch",
  );

  // Test error case: arity mismatch in recursive call
  testError(
    "recursive function arity mismatch",
    `
    let rec broken = (x, y) => x + broken(y);
  `,
    "arityMismatch",
  );
  */
  });
});
