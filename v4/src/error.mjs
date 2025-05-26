import chalk from 'chalk';

export let operator = (s) => chalk.green('(' + s + ')');
export let type = (s) => chalk.yellow(s);
export let hint = (s) => chalk.underline('Hint') + `: ${s}`;

export let stack = (style, items) => {
  let { spacing = 1 } = style || {};
  const separator = '\n'.repeat(spacing);
  return items.filter(Boolean).join(separator);
}

export let header = (left, right, columns) => {
  let finalColumns = columns || process.stdout.columns || 80;
  return chalk.cyan(`-- ${left} ${"-".repeat(finalColumns - left.length - right.length - 5)} ${right}`);
}

export let reflow = (content, columns) => {
  const words = content.split(/\s+/);
  const lines = [];
  let currentLine = '';
  let finalColumns = columns || process.stdout.columns || 80;

  for (const word of words) {
    if ((currentLine + word).length + (currentLine ? 1 : 0) <= finalColumns) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);

  return lines.join('\n');
};

const numDigits = n => Math.abs(n).toString().length;

export let highlightCode = (line, location) => {
  const caretLine = ' '.repeat(location.start.column + 3 + numDigits(location.start.line)) + '^'.repeat(Math.max(1, location.end.column - location.start.column));
  return `${location.start.line} | ${line}\n${chalk.red(caretLine)}`;
}

export let indent = (line, indentWidth = 4) => {
  return line.split('\n').map(line => " ".repeat(indentWidth) + line).join('\n');
}

export let createCycleError = (cycle) => {
  const formatted = cycle.join(' -> ');
  const first = cycle[0];

  return stack({ spacing: 2 }, [
    header('CYCLIC DEPENDENCY', first),
    "I found a cycle in your dependency graph:",
    indent(formatted),
    "This means that one of your modules is indirectly importing itself.",
    reflow(`Hint: Start from the first module in the chain \`${first}\` and trace where it leads.`),
  ]);
}

export let createMissingModuleError = ({
  filePath,
  importSource,
  resolvedPath,
}) => {
  return `
Missing Module Import

While processing:

    ${filePath}

I could not resolve the following import:

    import "${importSource}"

It was expected to exist at:

    ${resolvedPath}

But no module was found there.

This might be because:
  - The file is missing or was renamed
  - The path is incorrect or relative to the wrong base
  - There's a typo in the import statement

Please check the import in ${filePath} and ensure that the path is correct.
`.trim();
}

export let createMissingExportError = ({ node, importSpec, filePath, importPath, availableExports }) => {
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

let sourceLines = [];
let fileName = '';

export let createInternalError = (node, { phase }) => {
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
    `Hint: Add a case to '${phase}' to support this type.`
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
  const { aside, message, expected, actual, hint, filePath, sourceLines } = context;
  const loc = node.loc

  return chalk.white(stack({spacing: 2}, [
    header('TYPE MISMATCH', filePath),
    message,
    stack({}, [
      highlightCode(sourceLines[loc.start.line - 1], loc),
      aside,
    ]),
    hint ? chalk.underline('Hint') + `: ${hint}` : undefined,
  ]));
}
