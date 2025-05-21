import path from 'path';

export let topologicalSort = (graph) => {
  const visited = new Set();
  const onStack = new Set();
  const sorted = [];

  function visit(node, ancestors = []) {
    if (visited.has(node)) return;
    if (onStack.has(node)) return [...ancestors, node]

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
    let error = visit(node);
    if (error) {
      return { error };
    }
  }

  return { ok: sorted };
}

