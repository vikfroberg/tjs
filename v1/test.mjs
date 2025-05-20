import { parseScript } from 'meriyah';
import { infer, showType } from './type-inference.mjs';

const tests = [
  { code: '42', expected: 'number' },
  { code: 'true', expected: 'boolean' },
  { code: '1 + 2', expected: 'number' },
  { code: '1 < 2', expected: 'boolean' },
  { code: '[1, 2, 3]', expected: '[number]' },
  { code: '(x => x + 1)', expected: "(number) => number" },
  { code: '(x => x + 1)(2)', expected: 'number' },
  { code: '({ a: 1, b: true })', expected: '{ a: number, b: boolean }' },
  { code: '({ a: 1 }).a', expected: 'number' },
  { code: 'true ? 1 : 2', expected: 'number' },
  { code: '((x, y) => x + y)', expected: '(number, number) => number' },
  { code: '(x => x ? 1 : 0)', expected: '(boolean) => number' },
  { code: '1 + true', expectedError: true },
  { code: '1 && 2', expectedError: true },
  { code: 'null', expectedError: true },
  { code: '({})', expected: '{}' },
  { code: '({...({a:"a"}) , a:"b"})', expected: '{ a: string }' },
  { code: '[]', expected: '[]' },
];

function runTests() {
  for (const { code, expected, expectedError } of tests) {
    try {
      const ast = parseScript(code, { next: true });
      const exprNode = ast.body[0].type === 'ExpressionStatement' ? ast.body[0].expression : ast.body[0];
      const subst = {};
      const env = {};
      const inferred = infer(exprNode, env, subst);
      const actual = showType(inferred);

      if (expectedError) {
        console.error(`FAIL: ${code} - expected error, got ${actual}`);
      } else if (actual !== expected) {
        console.error(`FAIL: ${code} - expected ${expected}, got ${actual}`);
      } else {
        console.log(`PASS: ${code}`);
      }
    } catch (e) {
      if (expectedError) {
        console.log(`PASS: ${code} - ${e.message}`);
      } else {
        console.error(`FAIL: ${code} - unexpected error: ${e.message}`);
      }
    }
  }
}

runTests();
