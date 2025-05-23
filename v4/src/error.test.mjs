
import assert from "node:assert";
import { test, suite } from "node:test";
import { header, indent, highlight, stack } from "./error.mjs";

suite("Error layout", () => {
  test("header", () => {
    assert.equal(header("TYPE MISMATCH", "main.js"), "-- TYPE MISMATCH " + "-".repeat(55) + " main.js");
  });

  test("indent", () => {
    assert.equal(indent("a\nb\nc"), "    a\n    b\n    c");
  });

  test("highlight", () => {
    assert.equal(highlight("Hejsan hoppsan", { start: { column: 7 }, end: { column: 14 } }), "Hejsan hoppsan\n       ^^^^^^^");
  });

  test("stack", () => {
    assert.equal(stack({}, ['a', 'b', 'c']), "a\nb\nc");
    assert.equal(stack({ spacing: 2 }, ['a', 'b', 'c']), "a\n\nb\n\nc");
  });
});
