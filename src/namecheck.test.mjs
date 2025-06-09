import { test, suite } from "node:test";
import assert from "node:assert";
import * as Namecheck from "./namecheck.mjs";
import { parseModule } from "meriyah";
import * as Result from "./result.mjs";
import * as Ast from "./ast.mjs";

const checkProgram = (program, exports = new Map()) => {
  const ast = parseModule(program);
  Ast.checkAndTagImports(ast, (source) => source); // Add resolved module paths to AST nodes for imports
  return Namecheck.check(
    {
      ast: ast,
      source: program,
      relativeFilePath: "./program.js",
      absoluteFilePath: "/rootDir/src/program.js",
      sourceLines: program.split("/n"),
      exports: exports,
    },
    exports,
  );
};

suite("Namecheck", function () {
  test("Variable declarations", function () {
    // Should error out
    [
      `let x = 5
    const x = 2
    `,
      `let x = 5, y = 2;
    const y = 2
    `,
      `let x = 5, y = 2;
    const x = y
    `,
      `let x = "hello"
      let { fn } = { fn: () => {
        let x = 1;
        return x + 1;
      }}
      `,
      `let x = "hello"
      let [ fn ] = [() => {
        let x = 1;
        return x + 1;
      }]
      `,
    ].forEach((program) =>
      assert.strictEqual(
        Result.getError(checkProgram(program))?.type,
        "DuplicateDeclarationError",
      ),
    );
    // Should also error out
    [`const x = y + 5`, `let x = y + 5`, `var x = y + 5`].forEach((program) =>
      assert.strictEqual(
        Result.getError(checkProgram(program))?.type,
        "UndefinedVariableError",
      ),
    );
    // Should not error out
    [
      `let x = 5, y = 2
    let z = x * y
    `,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program), Result.ok({})),
    );
  });

  test("Import statements", function () {
    // Shoulr error out
    [
      `import { x } from "test"`,
      `import { y as x } from "test"`,
      `import x from "test"`,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(
          checkProgram(program, new Map([["test", ["X", "Y", "Z"]]])),
        )?.type,
        "NameNotExportedError",
      ),
    );
    // Should error out
    [
      `import { x } from "test"
    let x = 2;
    `,
      `import { y as x } from "test"
    let x = 2;
    `,
      `import { y as x, z as x } from "test"
    `,
      `import x from "test"
    let x = 2;
    `,
      `import * as x from "test"
    let x = 2;
    `,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(
          checkProgram(
            program,
            new Map([["test", ["x", "y", "z", "__default__"]]]),
          ),
        )?.type,
        "DuplicateDeclarationError",
      ),
    );
    // Should not error out
    [
      `import { x as y } from "test"
    let x = 2;
    `,
    ].forEach((program) =>
      assert.deepEqual(
        checkProgram(program, new Map([["test", ["x"]]])),
        Result.ok({}),
      ),
    );
  });

  test("Export statements", function () {
    // Should error out
    [
      `export default x`,
      `export { x }`,
      `let y = 3;
      export { x as y }`,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "UndefinedVariableError",
      ),
    );
    // Should not error out
    [
      `const x = 1
      let y = 3
      export { x as y }
      `,
      `export default 47`,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program), Result.ok({})),
    );
    // Should error out
    [
      `let x = 1
      export const x = 2
      `,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "DuplicateDeclarationError",
      ),
    );
  });
  test("Records", function () {
    // Should error out
    [`let x = { y }`].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "UndefinedVariableError",
      ),
    );
    [
      `let x = 4
      const { x } = { x: 5 }`,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "DuplicateDeclarationError",
      ),
    );
    // Should not error out
    [
      `let y = 5;
      let x = { y }`,
      `let x = 4
      const { x: y } = { x: 5 }`,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program), Result.ok({})),
    );
  });
  test("Arrays", function () {
    // Should error out
    [`let x = [1, 2, y]`].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "UndefinedVariableError",
      ),
    );
    [
      `let x = 4
      const [ x ] = [ 5 ]`,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "DuplicateDeclarationError",
      ),
    );
    // Should not error out
    [
      `let y = 5;
      let x = [ 2, y ]`,
      `let x = 4
      const [ y ] = [ 5 ]`,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program), Result.ok({})),
    );
  });
  test("Arrow functions and function calls", function () {
    [
      `const fn = (x, y) => x + y`,
      `const add = (x, y) => x + y
        const sub = (x, y) => x - y
        `,
      `const add = (x, y) => x + y
          const alsoAdd = (x, y) => add(x, y)
          `,
      `const x = 1
      const fn = (y) => y + 1
          fn(x)
          `,
      `let z = 1
        const fn = (x, y) => {
          return x + y + z
        }`,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program), Result.ok({})),
    );
    // Should report error
    [
      `const fn = (x) => x + y`,
      `fn(true)`,
      `const id = (x) => x
      id(y)`,
      `const a = (x) => x + 12
      const b = x + 13`,
      `const a = (x) => x + 12
      const b = (y) => x+ 13`,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "UndefinedVariableError",
      ),
    );
    [
      `let x = true
      const fn = (x) => x`,
    ].forEach((program) =>
      assert.deepEqual(
        Result.getError(checkProgram(program))?.type,
        "DuplicateDeclarationError",
      ),
    );
  });
});
