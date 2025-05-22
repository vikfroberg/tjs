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
  test("Accessing undefined variable inside variable declaration fails", function () {
    [`const x = y + 5`, `let x = y + 5`, `var x = y + 5`].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, "UndefinedVariableError"),
    );
  });

  test("Variable declaration registers correctly", function () {
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
    // Should not error out
    [
      `let x = 5, y = 2
    let z = x * y
    `,
    ].forEach((program) =>
      assert.deepEqual(checkProgram(program).errors, null),
    );
  });

  test("Import statements registers variables correctly", function () {
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
});
