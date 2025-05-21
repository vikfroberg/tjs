export let createCycleError = (cycle) => {
  const formatted = cycle.join(' -> ');
  const first = cycle[0];

  return `
Cyclic Dependency Detected

I found a cycle in your dependency graph:

    ${formatted}

This means that one of your modules is indirectly importing itself.
Please check your imports and break the cycle.

Hint: Start from the first module in the chain (${first})
and trace where it leads.
`.trim();
}

export let createMissingModuleError = ({ filePath, import_, importPath }) => {
  return `
Missing Module Import

While processing:

    ${filePath}

I could not resolve the following import:

    import "${import_.source}"

It was expected to exist at:

    ${importPath}

But no module was found there.

This might be because:
  - The file is missing or was renamed
  - The path is incorrect or relative to the wrong base
  - There's a typo in the import statement

Please check the import in ${filePath} and ensure that the path is correct.
`.trim();
}

export let createMissingExportError = ({ node, importSpec, filePath, importPath, availableExports }) => {
  console.log(node, importSpec);
  const exportList = availableExports.length > 0
    ? `Available exports:\n\n    ${availableExports.join('\n    ')}`
    : `Available exports:\n\n    (none)`;

  return `
Missing Export

While processing:

    ${filePath}

You tried to import:

    

But the module at:

    ${importPath}

does not export "${importSpec.local}".

${exportList}

This might be because:
  - The export name is misspelled or was renamed
  - The export does not exist in the source module
  - You are importing from the wrong file

Please check your import statement and the exports of the target file.
`.trim();
}

export let createInternalError = (node, context) => {
  const loc = node.loc?.start ?? { line: 0, column: 0 };
  const line = sourceLines[loc.line - 1] ?? '';
  const pointer = ' '.repeat(loc.column) + '^';

  return [
    `-- ERROR --------------------------------- ${fileName}`,
    '',
    `This tool doesn't yet handle the syntax at line ${loc.line}, column ${loc.column}:`,
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    `Node type: '${node.type}'`,
    '',
    context.phase === 'infer'
      ? `Hint: Add a case to 'infer()' to support this type.`
      : `Hint: Add a case to 'nameCheck()' to support this type.`,
  ].join('\n');
}

export let createUnsupportedError = (node) => {
  const loc = node.loc?.start ?? { line: 0, column: 0 };
  const line = sourceLines[loc.line - 1] ?? '';
  const pointer = ' '.repeat(loc.column) + '^';

  return [
    `-- UNSUPPORTED ERROR --------------------------------- ${fileName}`,
    '',
    'You used a feature that is not suported.',
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    'This feature is not allowed in TJS because it makes code harder to analyze and optimize.',
    '',
    'Instead, try to refactor your code to use a different feature. See the documentation for more information:',
    'https://github.com/vikfroberg/tjs/blob/main/docs/unsupported.md',
  ].join('\n');
}

export let createUnificationError = (node, context = {}) => {
  const { expected, actual, hint } = context;
  const loc = node?.loc || { start: { line: 0, column: 0 }, end: { column: 1 } };
  const line = sourceLines[loc.start.line - 1] || '';
  const pointer =
    ' '.repeat(loc.start.column) +
    '^'.repeat(Math.max(1, loc.end.column - loc.start.column));

  return [
    `-- TYPE MISMATCH ----------------------------------------- ${fileName}`,
    '',
    `I ran into a problem at line ${loc.start.line}, column ${loc.start.column}:`,
    '',
    `    ${line}`,
    `    ${pointer}`,
    '',
    expected ? `Expected:\n    ${expected}` : '',
    actual ? `But got:\n    ${actual}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
