import { test, suite } from "node:test";
import assert from "node:assert";
import * as Namecheck from "./namecheck.mjs";
import { parseModule } from "meriyah";

const errorRenderer = {
  renderUndefinedVariableError: (node_) => "UndefinedVariableError",
  renderDuplicateDeclarationError: (node_) => "DuplicateDeclarationError",
  renderUnsupportedError: (node) => "UnsupportedError",
};

const checkProgram = (program) => {
  const ast = parseModule(program);
  const sourceLines = program.split("\n");
  return Namecheck.check(ast, errorRenderer);
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
    ].forEach((program) =>
      assert.deepEqual(
        checkProgram(program).errors,
        "DuplicateDeclarationError",
      ),
    );
    // Should also error out
    [`const x = y + 5`, `let x = y + 5`, `var x = y + 5`].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, "UndefinedVariableError"),
    );
    // Should not error out
    [
      `let x = 5, y = 2
    let z = x * y
    `,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, null),
    );
  });

  test("Import statements", function () {
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
        checkProgram(program).errors,
        "DuplicateDeclarationError",
      ),
    );
    // Should not error out
    [
      `import { x as y } from "test"
    let x = 2;
    `,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, null),
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
      assert.deepEqual(checkProgram(program).errors, "UndefinedVariableError"),
    );
    // Should not error out
    [
      `const x = 1
      let y = 3
      export { x as y }
      `,
      `export default 47`,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, null),
    );
    // Should error out
    [
      `let x = 1
      export const x = 2
      `,
    ].forEach((program) =>
      assert.deepEqual(
        checkProgram(program).errors,
        "DuplicateDeclarationError",
      ),
    );
  });
  test("Records", function () {
    // Should error out
    [`let x = { y }`].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, "UndefinedVariableError"),
    );
    [
      `let x = 4
      const { x } = { x: 5 }`,
    ].forEach((program) =>
      assert.deepEqual(
        checkProgram(program).errors,
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
      assert.deepEqual(checkProgram(program).errors, null),
    );
  });
  test("Arrays", function () {
    // Should error out
    [`let x = [1, 2, y]`].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, "UndefinedVariableError"),
    );
    [
      `let x = 4
      const [ x ] = [ 5 ]`,
    ].forEach((program) =>
      assert.deepEqual(
        checkProgram(program).errors,
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
      assert.deepEqual(checkProgram(program).errors, null),
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
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, null),
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
      assert.deepEqual(checkProgram(program).errors, "UndefinedVariableError"),
    );
    [
      `let x = true
      const fn = (x) => x`,
    ].forEach((program) =>
      assert.deepEqual(
        checkProgram(program).errors,
        "DuplicateDeclarationError",
      ),
    );
  });
});
