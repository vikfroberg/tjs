import assert from "node:assert";
import { test, suite } from "node:test";
import * as Typecheck from "./index.mjs";
import { parseModule } from "meriyah";
import * as Result from "../result.mjs";

suite("Typecheck", () => {
  test("string", () => {
    let expected = Result.ok(Typecheck.tString);
    let actual = Typecheck.inferExpr(parseModule("'a'").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("number", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("1").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("boolean", () => {
    let expected = Result.ok(Typecheck.tBoolean);
    let actual = Typecheck.inferExpr(parseModule("true").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("binary expression", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("1 + 1").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("binary expression mismatch", () => {
    let node = parseModule("1 + 'a'").body[0].expression;
    let actual = Typecheck.inferExpr(node);
    let expected = Result.error(
      Typecheck.binaryExpressionMismatch(node, { types: [Typecheck.tNumber] }),
    );
    assert.deepEqual(actual, expected);
  });

  test("binary expression mismatch reversed", () => {
    let node = parseModule("'a' + 1").body[0].expression;
    let actual = Typecheck.inferExpr(node);
    let expected = Result.error(
      Typecheck.binaryExpressionMismatch(node, { types: [Typecheck.tNumber] }),
    );
    assert.deepEqual(actual, expected);
  });

  test("(+) unsupported type", () => {
    let source = "false + true";
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    let actual = Typecheck.inferExpr(node);
    let out = Typecheck.binaryExpressionUnsupportedType(node, {
      left: Typecheck.tBoolean,
      types: [Typecheck.tNumber],
    });
    let expected = Result.error(out);
    assert.deepEqual(actual, expected);
  });

  test("(-) unsupported type", () => {
    let source = "'a' - 'b'";
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    let actual = Typecheck.inferExpr(node);
    let out = Typecheck.binaryExpressionUnsupportedType(node, {
      left: Typecheck.tString,
      types: [Typecheck.tNumber],
    });
    let expected = Result.error(out);
    assert.deepEqual(actual, expected);
  });

  test("unary expression number", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("-1").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("unary expression boolean", () => {
    let expected = Result.ok(Typecheck.tBoolean);
    let actual = Typecheck.inferExpr(parseModule("!true").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("unary expression unsupported type", () => {
    let source = "!1";
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    let actual = Typecheck.inferExpr(node);
    let out = Typecheck.unaryExpressionUnsupportedType(node, {
      types: [Typecheck.tBoolean],
    });
    let expected = Result.error(out);
    assert.deepEqual(actual, expected);
  });

  test("variable binding", () => {
    let source = `
      let x = 1;
      let y = x + 2;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("x"), Typecheck.tNumber);
    assert.deepEqual(env.get("y"), Typecheck.tNumber);
  });

  test("arrow function", () => {
    let source = `
      let f = (x) => x + 1;
      let y = f(1);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(
      env.get("f"),
      Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber),
    );
    assert.deepEqual(env.get("y"), Typecheck.tNumber);
  });

  test("arrow function with multiple arguments", () => {
    let source = `
      let f = (x, y) => x + (y + 1);
      let g = (x, y) => (x + y) + 1;
      let y = f(1, 2);
      let z = g(1, 2);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(
      env.get("f"),
      Typecheck.tFunN(
        [Typecheck.tNumber, Typecheck.tNumber],
        Typecheck.tNumber,
      ),
    );
    assert.deepEqual(env.get("y"), Typecheck.tNumber);
    assert.deepEqual(
      env.get("g"),
      Typecheck.tFunN(
        [Typecheck.tNumber, Typecheck.tNumber],
        Typecheck.tNumber,
      ),
    );
    assert.deepEqual(env.get("z"), Typecheck.tNumber);
  });

  test("polymorphic function", () => {
    let source = `
      let id = x => x;
      let a = id(42);      // id: number -> number
      let b = id("hello"); // id: string -> string
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
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

  test("recursive function", () => {
    let source = `
      let factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
      let a = factorial(5);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
  });

  test("comparison expression", () => {
    let source = `
      let a = 1 < 2;
      let b = 1 <= 2;
      let c = 1 > 2;
      let d = 1 >= 2;
      let e = 1 == 2;
      let f = 1 != 2;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tBoolean);
    assert.deepEqual(env.get("b"), Typecheck.tBoolean);
    assert.deepEqual(env.get("c"), Typecheck.tBoolean);
    assert.deepEqual(env.get("d"), Typecheck.tBoolean);
    assert.deepEqual(env.get("e"), Typecheck.tBoolean);
    assert.deepEqual(env.get("f"), Typecheck.tBoolean);
  });

  test("comparison expression mismatch", () => {
    let source = `
      let a = 1 < "a";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "binaryExpressionMismatch");
  });

  test("equality expression", () => {
    let source = `
      let a = 1 == 2;
      let b = 1 != 2;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tBoolean);
    assert.deepEqual(env.get("b"), Typecheck.tBoolean);
  });

  test("equality expression mismatch", () => {
    let source = `
      let a = 1 == "a";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "binaryExpressionMismatch");
  });

  test("conditional expression", () => {
    let source = `
      let a = true ? 1 : 2;
      let b = false ? "hello" : "world";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
    assert.deepEqual(env.get("b"), Typecheck.tString);
  });

  test("conditional expression type mismatch", () => {
    let source = `
      let a = true ? 1 : "hello";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
  });

  test("nested conditional expression", () => {
    let source = `
      let a = true ? (false ? 1 : 2) : 3;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
  });

  test("function call arity mismatch - too few arguments", () => {
    let source = `
      let f = (x, y) => x + y;
      let a = f(1);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "arityMismatch");
  });

  test("function call arity mismatch - too many arguments", () => {
    let source = `
      let f = (x) => x + 1;
      let a = f(1, 2, 3);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "arityMismatch");
  });

  test("function call parameter type mismatch", () => {
    let source = `
      let f = (x) => x + 1;
      let a = f("hello");
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "paramMismatch");
  });

  test("function call multiple parameter type mismatch", () => {
    let source = `
      let f = (x, y) => x + y;
      let a = f(1, "hello");
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "paramMismatch");
  });

  test("modulo operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("5 % 3").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("exponentiation operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("2 ** 3").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("bitwise OR operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("5 | 3").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("bitwise AND operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("5 & 3").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("bitwise XOR operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("5 ^ 3").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("left shift operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("5 << 2").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("right shift operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("20 >> 2").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("unsigned right shift operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("20 >>> 2").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("bitwise operator type mismatch", () => {
    let source = "'hello' | 3";
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    let actual = Typecheck.inferExpr(node);
    let expected = Result.error(
      Typecheck.binaryExpressionMismatch(node, {
        types: [Typecheck.tNumber],
      }),
    );
    assert.deepEqual(actual, expected);
  });

  test("strict equality operator", () => {
    let source = `
      let a = 1 === 1;
      let b = "hello" === "world";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tBoolean);
    assert.deepEqual(env.get("b"), Typecheck.tBoolean);
  });

  test("strict inequality operator", () => {
    let source = `
      let a = 1 !== 2;
      let b = "hello" !== "world";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tBoolean);
    assert.deepEqual(env.get("b"), Typecheck.tBoolean);
  });

  test("strict equality type mismatch", () => {
    let source = `
      let a = 1 === "hello";
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "binaryExpressionMismatch");
  });

  test("bitwise NOT operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("~5").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("unary plus operator", () => {
    let expected = Result.ok(Typecheck.tNumber);
    let actual = Typecheck.inferExpr(parseModule("+5").body[0].expression);
    assert.deepEqual(actual, expected);
  });

  test("bitwise NOT unsupported type", () => {
    let source = "~'hello'";
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    let actual = Typecheck.inferExpr(node);
    let expected = Result.error(
      Typecheck.unaryExpressionUnsupportedType(node, {
        types: [Typecheck.tNumber],
      }),
    );
    assert.deepEqual(actual, expected);
  });

  test("unary plus unsupported type", () => {
    let source = "+'hello'";
    let node = parseModule(source, { loc: true, next: true }).body[0]
      .expression;
    let actual = Typecheck.inferExpr(node);
    let expected = Result.error(
      Typecheck.unaryExpressionUnsupportedType(node, {
        types: [Typecheck.tNumber],
      }),
    );
    assert.deepEqual(actual, expected);
  });

  test("complex nested arithmetic", () => {
    let source = `
      let a = ((1 + 2) * 3) - (4 / 2);
      let b = 2 ** (3 + 1) % 5;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
    assert.deepEqual(env.get("b"), Typecheck.tNumber);
  });

  test("complex nested function calls", () => {
    let source = `
      let add = (x, y) => x + y;
      let multiply = (x, y) => x * y;
      let result = add(multiply(2, 3), multiply(4, 5));
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("result"), Typecheck.tNumber);
  });

  test("higher-order functions", () => {
    let source = `
      let apply = (f, x) => f(x);
      let double = x => x * 2;
      let result = apply(double, 5);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("result"), Typecheck.tNumber);
  });

  test("logical AND operator", () => {
    let source = `
      let a = true && false;
      let b = true && true;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tBoolean);
    assert.deepEqual(env.get("b"), Typecheck.tBoolean);
  });

  test("logical OR operator", () => {
    let source = `
      let a = true || false;
      let b = false || false;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tBoolean);
    assert.deepEqual(env.get("b"), Typecheck.tBoolean);
  });

  test("logical operator type mismatch", () => {
    let source = `
      let a = 1 && true;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, true);
    assert.equal(moduleT.value.type, "binaryExpressionUnsupportedType");
  });

  test("mixed operators precedence", () => {
    let source = `
      let a = 1 + 2 * 3;
      let b = (1 + 2) * 3;
      let c = 1 < 2 && 3 > 2;
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
    assert.deepEqual(env.get("b"), Typecheck.tNumber);
    assert.deepEqual(env.get("c"), Typecheck.tBoolean);
  });

  test("polymorphic function complex usage", () => {
    let source = `
      let first = (x, y) => x;
      let a = first(42, "hello");
      let b = first("world", 99);
      let c = first(true, false);
    `;
    let module = {
      ast: parseModule(source, { loc: true, next: true }),
      sourceLines: source.split("\n"),
      relativeFilePath: "test.mjs",
    };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get("a"), Typecheck.tNumber);
    assert.deepEqual(env.get("b"), Typecheck.tString);
    assert.deepEqual(env.get("c"), Typecheck.tBoolean);
  });
});
