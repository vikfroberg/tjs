import assert from "node:assert";
import { test, suite } from "node:test";
import * as E from "./error.mjs";
import chalk from "chalk";

suite("Error layout", () => {
  test("header", () => {
    let expected = chalk.cyan("-- TYPE MISMATCH " + "-".repeat(55) + " main.js");
    let actual = E.header("TYPE MISMATCH", "main.js", 80);
    assert.equal(actual, expected);
  });

  test("indent", () => {
    let expected = "    a\n    b\n    c";
    let actual = E.indent("a\nb\nc");
    assert.equal(actual, expected);
  });

  test("highlight", () => {
    let expected = "1 | Hejsan hoppsan\n" + chalk.red("           ^^^^^^^");
    let actual = E.highlightCode("Hejsan hoppsan", { start: { line: 1, column: 7 }, end: { column: 14 } });
    assert.equal(actual, expected);
  });

  test("stack, no spacing", () => {
    let expected = "a\nb\nc";
    let actual = E.stack({}, ['a', 'b', 'c']);
    assert.equal(actual, expected);
  });

  test("stack, with spacing", () => {
    let expected = "a\n\nb\n\nc";
    let actual = E.stack({ spacing: 2 }, ['a', 'b', 'c']);
    assert.equal(actual, expected);
  });

  test("reflow", () => {
    let expected = "a b\nc";
    let actual = E.reflow("a b c", 3);
    assert.equal(actual, expected);
  });

  test("operator", () => {
    let expected = chalk.green("(a)");
    let actual = E.operator("a");
    assert.equal(actual, expected);
  });

  test("type", () => {
    let expected = chalk.yellow("a");
    let actual = E.type("a");
    assert.equal(actual, expected);
  });
});
