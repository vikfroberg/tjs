import path from 'path';

export let topologicalSort = (graph) => {
  const visited = new Set();
  const onStack = new Set();
  const sorted = [];

  function visit(node, ancestors = []) {
    if (visited.has(node)) return null;
    if (onStack.has(node)) return [...ancestors, node];

    onStack.add(node);
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      const cycle = visit(dep, [...ancestors, node]);
      if (cycle) return cycle;
    }
    onStack.delete(node);
    visited.add(node);
    sorted.push(node);

    return null;
  }

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return { error: cycle };
  }

  return { ok: sorted };
}
