import assert from "node:assert";
import { test, suite } from "node:test";
import * as Typecheck from "./index.mjs";
import { parseModule } from "meriyah";
import * as Result from "../result.mjs";
import path from "node:path";

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
    let result = Typecheck.inferExpr(parseModule(source).body[0].expression);
    assert.deepEqual(result, Result.ok(expectedType));
  });
}

function testModule(description, source, shouldHave) {
  test(description, () => {
    let module = createTestModule(source);
    let env = new Typecheck.Env();
    let interfaces = new Map();
    
    // Set up mock imports if provided
    if (shouldHave.imports) {
      Object.entries(shouldHave.imports).forEach(([modulePath, exports]) => {
        // Resolve the import path the same way the import inference does
        const resolvedPath = path.resolve(
          path.dirname(module.absoluteFilePath),
          modulePath
        );
        interfaces.set(resolvedPath, exports);
      });
    }
    
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    
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
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, expectedErrorType);
  });
}

function testExprError(description, source, expectedErrorType) {
  test(description, () => {
    let node = parseModule(source, { loc: true, next: true }).body[0].expression;
    let result = Typecheck.inferExpr(node);
    assert.equal(result.error, true);
    assert.equal(result.value.type, expectedErrorType);
  });
}

suite("Typecheck", () => {
  // Basic literals
  testExpr("string literal", "'a'", Typecheck.tString);
  testExpr("number literal", "1", Typecheck.tNumber);
  testExpr("boolean literal", "true", Typecheck.tBoolean);
  testExpr("binary expression", "1 + 1", Typecheck.tNumber);

  // Binary expression errors
  testExprError("binary expression mismatch", "1 + 'a'", "binaryExpressionMismatch");
  testExprError("binary expression mismatch reversed", "'a' + 1", "binaryExpressionMismatch");
  testExprError("(+) unsupported type", "false + true", "binaryExpressionUnsupportedType");
  testExprError("(-) unsupported type", "'a' - 'b'", "binaryExpressionUnsupportedType");

  // Unary expressions
  testExpr("unary expression number", "-1", Typecheck.tNumber);
  testExpr("unary expression boolean", "!true", Typecheck.tBoolean);
  testExprError("unary expression unsupported type", "!1", "unaryExpressionUnsupportedType");

  // Variable bindings and functions
  testModule("variable binding", `
    let x = 1;
    let y = x + 2;
  `, {
    x: Typecheck.tNumber,
    y: Typecheck.tNumber
  });

  testModule("arrow function", `
    let f = (x) => x + 1;
    let y = f(1);
  `, {
    f: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber),
    y: Typecheck.tNumber
  });

  testModule("arrow function with multiple arguments", `
    let f = (x, y) => x + (y + 1);
    let g = (x, y) => (x + y) + 1;
    let y = f(1, 2);
    let z = g(1, 2);
  `, {
    f: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
    g: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
    y: Typecheck.tNumber,
    z: Typecheck.tNumber
  });

  // Polymorphic function - keeping detailed test for complex assertion
  test("polymorphic function", () => {
    let module = createTestModule(`
      let id = x => x;
      let a = id(42);      // id: number -> number
      let b = id("hello"); // id: string -> string
    `);
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("id").type, "scheme");
    assert.deepEqual(env.get("id").vars.length, 1);
    assert.deepEqual(env.get("id").vars[0].type, "var");
    let quantifiedVar = env.get("id").vars[0];
    assert.deepEqual(
      env.get("id").body,
      Typecheck.tFunN(
        [Typecheck.tVar(quantifiedVar.id)],
        Typecheck.tVar(quantifiedVar.id),
      ),
    );
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
    assert.deepEqual(env.get("b"), Typecheck.tString);
  });

  testModule("recursive function", `
    let factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
    let a = factorial(5);
  `, {
    a: Typecheck.tNumber
  });

  // Comparison operators
  testModule("comparison expressions", `
    let a = 1 < 2;
    let b = 1 <= 2;
    let c = 1 > 2;
    let d = 1 >= 2;
    let e = 1 == 2;
    let f = 1 != 2;
  `, {
    a: Typecheck.tBoolean,
    b: Typecheck.tBoolean,
    c: Typecheck.tBoolean,
    d: Typecheck.tBoolean,
    e: Typecheck.tBoolean,
    f: Typecheck.tBoolean
  });

  testError("comparison expression mismatch", "let a = 1 < 'a';", "binaryExpressionMismatch");
  testError("equality expression mismatch", "let a = 1 == 'a';", "binaryExpressionMismatch");

  // Conditional expressions
  testModule("conditional expressions", `
    let a = true ? 1 : 2;
    let b = false ? "hello" : "world";
  `, {
    a: Typecheck.tNumber,
    b: Typecheck.tString
  });

  testError("conditional expression type mismatch", "let a = true ? 1 : 'hello';", "unsupported");
  
  testModule("nested conditional expression", `
    let a = true ? (false ? 1 : 2) : 3;
  `, {
    a: Typecheck.tNumber
  });

  // Function call errors
  testError("function call arity mismatch - too few", "let f = (x, y) => x + y; let a = f(1);", "arityMismatch");
  testError("function call arity mismatch - too many", "let f = (x) => x + 1; let a = f(1, 2, 3);", "arityMismatch");
  testError("function call parameter type mismatch", "let f = (x) => x + 1; let a = f('hello');", "paramMismatch");
  testError("function call multiple parameter type mismatch", "let f = (x, y) => x + y; let a = f(1, 'hello');", "paramMismatch");

  // Arithmetic operators (table-driven)
  const arithmeticOps = [
    ["5 % 3", "modulo"],
    ["2 ** 3", "exponentiation"],
    ["5 | 3", "bitwise OR"],
    ["5 & 3", "bitwise AND"], 
    ["5 ^ 3", "bitwise XOR"],
    ["5 << 2", "left shift"],
    ["20 >> 2", "right shift"],
    ["20 >>> 2", "unsigned right shift"]
  ];
  arithmeticOps.forEach(([source, desc]) => 
    testExpr(`${desc} operator`, source, Typecheck.tNumber)
  );

  testExprError("bitwise operator type mismatch", "'hello' | 3", "binaryExpressionMismatch");

  // Strict equality operators
  testModule("strict equality operators", `
    let a = 1 === 1;
    let b = "hello" === "world";
    let c = 1 !== 2;
    let d = "hello" !== "world";
  `, {
    a: Typecheck.tBoolean,
    b: Typecheck.tBoolean,
    c: Typecheck.tBoolean,
    d: Typecheck.tBoolean
  });

  testError("strict equality type mismatch", "let a = 1 === 'hello';", "binaryExpressionMismatch");

  // Additional unary operators
  testExpr("bitwise NOT operator", "~5", Typecheck.tNumber);
  testExpr("unary plus operator", "+5", Typecheck.tNumber);
  testExprError("bitwise NOT unsupported type", "~'hello'", "unaryExpressionUnsupportedType");
  testExprError("unary plus unsupported type", "+'hello'", "unaryExpressionUnsupportedType");

  // Complex expressions and edge cases
  testModule("complex nested arithmetic", `
    let a = ((1 + 2) * 3) - (4 / 2);
    let b = 2 ** (3 + 1) % 5;
  `, {
    a: Typecheck.tNumber,
    b: Typecheck.tNumber
  });

  testModule("complex nested function calls", `
    let add = (x, y) => x + y;
    let multiply = (x, y) => x * y;
    let result = add(multiply(2, 3), multiply(4, 5));
  `, {
    result: Typecheck.tNumber
  });

  testModule("higher-order functions", `
    let apply = (f, x) => f(x);
    let double = x => x * 2;
    let result = apply(double, 5);
  `, {
    result: Typecheck.tNumber
  });

  // Logical operators
  testModule("logical operators", `
    let a = true && false;
    let b = true && true;
    let c = true || false;
    let d = false || false;
  `, {
    a: Typecheck.tBoolean,
    b: Typecheck.tBoolean,
    c: Typecheck.tBoolean,
    d: Typecheck.tBoolean
  });

  testError("logical operator type mismatch", "let a = 1 && true;", "binaryExpressionUnsupportedType");

  testModule("mixed operators precedence", `
    let a = 1 + 2 * 3;
    let b = (1 + 2) * 3;
    let c = 1 < 2 && 3 > 2;
  `, {
    a: Typecheck.tNumber,
    b: Typecheck.tNumber,
    c: Typecheck.tBoolean
  });

  testModule("polymorphic function complex usage", `
    let first = (x, y) => x;
    let a = first(42, "hello");
    let b = first("world", 99);
    let c = first(true, false);
  `, {
    a: Typecheck.tNumber,
    b: Typecheck.tString,
    c: Typecheck.tBoolean
  });

  // Import/Export tests
  suite("Import/Export", () => {
    // Basic named imports
    testModule("named imports", `
      import { add, PI } from "./math.mjs";
      let result = add(1, 2);
      let circumference = 2 * PI;
    `, {
      imports: {
        "./math.mjs": {
          add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
          PI: Typecheck.tNumber
        }
      },
      env: {
        add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        PI: Typecheck.tNumber,
        result: Typecheck.tNumber,
        circumference: Typecheck.tNumber
      }
    });

    // Default imports (currently not implemented - would need spec.imported handling)
    // testModule("default import", `
    //   import Calculator from "./calc.mjs";
    //   let result = Calculator(5);
    // `, {
    //   imports: {
    //     "./calc.mjs": {
    //       default: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber)
    //     }
    //   },
    //   env: {
    //     Calculator: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber),
    //     result: Typecheck.tNumber
    //   }
    // });

    // Renamed imports
    testModule("renamed imports", `
      import { add as sum, multiply as mult } from "./math.mjs";
      let result = sum(1, 2);
      let product = mult(3, 4);
    `, {
      imports: {
        "./math.mjs": {
          add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
          multiply: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber)
        }
      },
      env: {
        sum: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        mult: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        result: Typecheck.tNumber,
        product: Typecheck.tNumber
      }
    });

    // Mixed imports (named and default) - commented out since default imports not implemented
    // testModule("mixed imports", `
    //   import Calculator, { add, PI } from "./math.mjs";
    //   let result1 = Calculator(5);
    //   let result2 = add(1, 2);
    //   let area = PI * 2;
    // `, {
    //   imports: {
    //     "./math.mjs": {
    //       default: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber),
    //       add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
    //       PI: Typecheck.tNumber
    //     }
    //   },
    //   env: {
    //     Calculator: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber),
    //     add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
    //     PI: Typecheck.tNumber,
    //     result1: Typecheck.tNumber,
    //     result2: Typecheck.tNumber,
    //     area: Typecheck.tNumber
    //   }
    // });

    // Multiple modules
    testModule("multiple module imports", `
      import { add } from "./math.mjs";
      import { format } from "./string.mjs";
      let sum = add(1, 2);
      let text = format("result: {}", sum);
    `, {
      imports: {
        "./math.mjs": {
          add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber)
        },
        "./string.mjs": {
          format: Typecheck.tFunN([Typecheck.tString, Typecheck.tNumber], Typecheck.tString)
        }
      },
      env: {
        add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        format: Typecheck.tFunN([Typecheck.tString, Typecheck.tNumber], Typecheck.tString),
        sum: Typecheck.tNumber,
        text: Typecheck.tString
      }
    });

    // Polymorphic imported functions
    testModule("polymorphic imported function", `
      import { identity } from "./utils.mjs";
      let a = identity(42);
      let b = identity("hello");
    `, {
      imports: {
        "./utils.mjs": {
          identity: Typecheck.tScheme(
            [Typecheck.tVar(1)],
            Typecheck.tFunN([Typecheck.tVar(1)], Typecheck.tVar(1))
          )
        }
      },
      env: {
        a: Typecheck.tNumber,
        b: Typecheck.tString
      }
    });

    // Using imported functions in higher-order contexts
    testModule("imported function as argument", `
      import { add } from "./math.mjs";
      let apply = (f, x, y) => f(x, y);
      let result = apply(add, 1, 2);
    `, {
      imports: {
        "./math.mjs": {
          add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber)
        }
      },
      env: {
        add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        result: Typecheck.tNumber
      }
    });

    // Export tests - named exports with specifiers not implemented yet
    // testModule("named exports", `
    //   let add = (x, y) => x + y;
    //   let PI = 3.14;
    //   export { add, PI };
    // `, {
    //   env: {
    //     add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
    //     PI: Typecheck.tNumber
    //   },
    //   exports: {
    //     add: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
    //     PI: Typecheck.tNumber
    //   }
    // });

    testModule("export with declaration", `
      export const multiply = (x, y) => x * y;
      export let count = 0;
    `, {
      env: {
        multiply: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        count: Typecheck.tNumber
      },
      exports: {
        multiply: Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber),
        count: Typecheck.tNumber
      }
    });

    testModule("default export", `
      let calculator = (x) => x * 2;
      export default calculator;
    `, {
      env: {
        calculator: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber)
      },
      exports: {
        __default__: Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber)
      }
    });
  });
});
