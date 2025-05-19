import * as Ast from './ast.mjs';
import path from 'path';

export function buildDependencyGraph(files) {
  const graph = new Map();
  for (const [filePath, ast] of files) {
    const imports = Ast.extractImports(ast);
    const dependencies = imports.map(imp =>
      path.resolve(path.dirname(filePath), imp.source)
    );
    graph.set(filePath, dependencies);
  }
  return graph;
}

export function topologicalSort(graph) {
  const visited = new Set();
  const onStack = new Set();
  const sorted = [];

  function visit(node, ancestors = []) {
    if (visited.has(node)) return;
    if (onStack.has(node)) {
      const cycle = [...ancestors, node].join(' -> ');
      throw new Error(`Cyclic import detected: ${cycle}`);
    }

    onStack.add(node);
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      visit(dep, [...ancestors, node]);
    }
    onStack.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  for (const node of graph.keys()) {
    visit(node);
  }

  return sorted;
}

