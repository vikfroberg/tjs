#!/usr/bin/env node
// Minimal Hindley-Milner Inference: Only Literals + Imports/Exports
import fs from 'fs/promises';
import path from 'path';
import util from 'util';
import * as TypeCheck from '../type-check.mjs';
import * as Ast from '../ast.mjs';
import * as Dag from '../dag.mjs';

// --- Type Checking Driver ---
const globalModuleTypes = new Map();

async function processFiles(entryDir) {
  const entries = await fs.readdir(entryDir);
  const fileData = await Promise.all(entries
    .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
    .map(async f => {
      const absoluteFilePath = path.resolve(entryDir, f);
      const { ast } = await Ast.parseFile(full);
      return [absoluteFilePath, ast];
    }));

  const fileMap = new Map(fileData);
  const depGraph = Dag.buildDependencyGraph(fileMap);
  const sortedPaths = Dag.topologicalSort(depGraph);

  for (const filePath of sortedPaths) {
    const ast = fileMap.get(filePath);
    const imports = Ast.extractImports(ast);
    debugger;
    const importedEnv = {};
    for (const imp of imports) {
      const resolved = path.resolve(path.dirname(filePath), imp.source);
      const modEnv = globalModuleTypes.get(resolved);
      if (!modEnv) throw new Error(`Missing module: ${resolved}`);
      for (const spec of imp.specifiers) {
        const sch = modEnv[spec.imported];
        if (!sch) throw new Error(`Missing export: ${spec.imported} from ${resolved}`);
        importedEnv[spec.local] = sch;
      }
    }

    const env = { ...importedEnv };
    for (const node of ast.body) {
//      console.log("processing", util.inspect(node, false, null, true));
      const typ = TypeCheck.infer(node, env, {});
      const bindings = Ast.isTopLevelBinding(node);
      // This can be many bindings to the same value eg. var x = 3, y = 2;
      for (const [name, expr] of bindings) {
        env[name] = TypeCheck.typeScheme(typ);
      }
    }
    globalModuleTypes.set(filePath, env);
  }
}

processFiles(path.resolve(process.cwd())).catch(console.error);
