import assert from "node:assert";
import { test, suite } from "node:test";
import * as Typecheck from "./typecheck.mjs";
import { parseModule } from "meriyah";
import * as Result from "./result.mjs";

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
    let expected = Result.error(Typecheck.binaryExpressionMismatch(node, { types: [Typecheck.tNumber] }));
    assert.deepEqual(actual, expected);
  });

  test("binary expression mismatch reversed", () => {
    let node = parseModule("'a' + 1").body[0].expression;
    let actual = Typecheck.inferExpr(node);
    let expected = Result.error(Typecheck.binaryExpressionMismatch(node, { types: [Typecheck.tNumber] }));
    assert.deepEqual(actual, expected);
  });

  test("(+) unsupported type", () => {
    let source = "false + true";
    let node = parseModule(source, { loc: true, next: true }).body[0].expression;
    let actual = Typecheck.inferExpr(node);
    let out = Typecheck.binaryExpressionUnsupportedType(node, { left: Typecheck.tBoolean, types: [Typecheck.tNumber] });
    let expected = Result.error(out);
    assert.deepEqual(actual, expected);
  });

  test("(-) unsupported type", () => {
    let source = "'a' - 'b'";
    let node = parseModule(source, { loc: true, next: true }).body[0].expression;
    let actual = Typecheck.inferExpr(node);
    let out = Typecheck.binaryExpressionUnsupportedType(node, { left: Typecheck.tString, types: [Typecheck.tNumber] });
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
    let node = parseModule(source, { loc: true, next: true }).body[0].expression;
    let actual = Typecheck.inferExpr(node);
    let out = Typecheck.unaryExpressionUnsupportedType(node, { types: [Typecheck.tBoolean] });
    let expected = Result.error(out);
    assert.deepEqual(actual, expected);
  });

  test("variable binding", () => {
    let source = `
      let x = 1;
      let y = x + 2;
    `;
    let module = { ast: parseModule(source, { loc: true, next: true }), sourceLines: source.split("\n") };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get('x'), Typecheck.tNumber);
    assert.deepEqual(env.get('y'), Typecheck.tNumber);
  });

  test("arrow function", () => {
    let source = `
      let f = (x) => x + 1;
      let y = f(1);
    `;
    let module = { ast: parseModule(source, { loc: true, next: true }), sourceLines: source.split("\n"), relativeFilePath: "test.mjs" };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    if (moduleT.error) return console.error(Typecheck.renderError(moduleT.value, module));
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get('f'), Typecheck.tFunN([Typecheck.tNumber], Typecheck.tNumber));
    assert.deepEqual(env.get('y'), Typecheck.tNumber);
  });

  test("arrow function with multiple arguments", () => {
    let source = `
      let f = (x, y) => x + (y + 1);
      let g = (x, y) => (x + y) + 1;
      let y = f(1, 2);
      let z = g(1, 2);
    `;
    let module = { ast: parseModule(source, { loc: true, next: true }), sourceLines: source.split("\n"), relativeFilePath: "test.mjs" };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    if (moduleT.error) return console.error(Typecheck.renderError(moduleT.value, module));
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get('f'), Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber));
    assert.deepEqual(env.get('y'), Typecheck.tNumber);
    assert.deepEqual(env.get('g'), Typecheck.tFunN([Typecheck.tNumber, Typecheck.tNumber], Typecheck.tNumber));
    assert.deepEqual(env.get('z'), Typecheck.tNumber);
  });

  test("polymorphic function", () => {
    let source = `
      let id = x => x;
      let a = id(42);      // id: number -> number
      let b = id("hello"); // id: string -> string
    `;
    let module = { ast: parseModule(source, { loc: true, next: true }), sourceLines: source.split("\n"), relativeFilePath: "test.mjs" };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    if (moduleT.error) return console.error(Typecheck.renderError(moduleT.value, module));
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get('id').type, "scheme");
    assert.deepEqual(env.get('id').vars.length, 1);
    assert.deepEqual(env.get('id').vars[0].type, "var");
    let quantifiedVar = env.get('id').vars[0];
    assert.deepEqual(env.get('id').body, Typecheck.tFunN([Typecheck.tVar(quantifiedVar.id)], Typecheck.tVar(quantifiedVar.id)));
    assert.deepEqual(env.get('a'), Typecheck.tNumber);
    assert.deepEqual(env.get('b'), Typecheck.tString);
  });

  test("recursive function", () => {
    let source = `
      let factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
      let a = factorial(5);
    `;
    let module = { ast: parseModule(source, { loc: true, next: true }), sourceLines: source.split("\n"), relativeFilePath: "test.mjs" };
    let env = new Typecheck.Env();
    let interfaces = new Map();
    let moduleT = Typecheck.inferModule(module, interfaces, env);
    if (moduleT.error) return console.error(Typecheck.renderError(moduleT.value, module));
    assert.equal(moduleT.error, false);
    assert.deepEqual(env.get('a'), Typecheck.tNumber);
  });
});
