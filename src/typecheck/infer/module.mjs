import path from "path";
import { ok, error } from "../../result.mjs";
import * as T from "../types/data.mjs";
import { applySubst, unify } from "../types/unfify.mjs";
import { generalize, instantiate } from "../types/generalize.mjs";
import Env from "../env.mjs";
import inferExpr from "./expression.mjs";
import { unsupported } from "../error/data.mjs";

/* MODULES ---------------------------------------- */

export default function inferModule(
  mod,
  moduleInterfaces,
  env = new Env(),
  subst = {},
) {
  let exports = {};

  for (const node of mod.ast.body) {
    if (node.type === "VariableDeclaration") {
      let result = inferVariableDeclaration(node, env, subst);
      if (result.error) return result;
    } else if (node.type === "ExportNamedDeclaration") {
      let result = inferExportNamedDeclaration(node, env, subst, exports);
      if (result.error) return result;
    } else if (node.type === "ExportDefaultDeclaration") {
      let result = inferExportDefaultDeclaration(node, env, subst, exports);
      if (result.error) return result;
    } else if (node.type === "ImportDeclaration") {
      let result = inferImportDeclaration(
        node,
        env,
        subst,
        mod,
        moduleInterfaces,
      );
      if (result.error) return result;
    } else {
      return error(unsupported(node, { stage: "inferModule" }));
    }
  }

  return ok(T.module_(exports));
}

/* VARIABLES ---------------------------------------- */

function inferVariableDeclaration(node, env, subst) {
  if (node.declarations.length > 1) {
    return error(
      unsupported(node, {
        stage: "inferModule.VariableDeclaration",
        message: "Only single declarations are supported",
      }),
    );
  }

  const isRec = true; // node.rec === true;
  const decl = node.declarations[0];
  const name = decl.id.name;
  const expr = decl.init;

  const selfTypeVar = T.freshTypeVar();
  env.set(name, selfTypeVar);

  const type = inferExpr(expr, env, subst);
  if (type.error) return type;

  const unifyResult = unify(selfTypeVar, type.value, subst);
  if (unifyResult.error) {
    throw new Error("This should never happen");
  }

  const finalType = applySubst(subst, selfTypeVar);
  const generalizedType = generalize(env, finalType);
  env.set(name, generalizedType);

  // Store the inferred type on the identifier node
  if (decl.id) {
    decl.id._inferredType = generalizedType;
  }

  return ok(undefined);
}

/* EXPORTS ---------------------------------------- */

function inferExportNamedDeclaration(node, env, subst, exports) {
  if (node.declaration) {
    if (node.declaration.type === "VariableDeclaration") {
      for (const decl of node.declaration.declarations) {
        const name = decl.id.name;
        const expr = decl.init;
        const selfTypeVar = T.freshTypeVar();
        env.set(name, selfTypeVar);
        const type = inferExpr(expr, env, subst);
        if (type.error) return type;
        const unifyResult = unify(selfTypeVar, type.value, subst);
        if (unifyResult.error)
          return error(
            unsupported(decl, {
              stage: "inferModule.ExportNamedDeclaration.recursion",
            }),
          );
        const finalType = applySubst(subst, selfTypeVar);
        const generalizedType = generalize(env, finalType);
        env.set(name, generalizedType);
        exports[name] = generalizedType;
        
        // Store the inferred type on the identifier node
        if (decl.id) {
          decl.id._inferredType = generalizedType;
        }
      }
    } else {
      return error(
        unsupported(node.declaration, {
          stage: "inferModule.ExportNamedDeclaration",
        }),
      );
    }
  }
  return ok(undefined);
}

function inferExportDefaultDeclaration(node, env, subst, exports) {
  const type = inferExpr(node.declaration, env, subst);
  if (type.error) return type;
  const generalizedType = generalize(env, type.value);
  env.set("__default__", generalizedType);
  exports["__default__"] = generalizedType;
  return ok(undefined);
}

/* IMPORTS ---------------------------------------- */

function inferImportDeclaration(node, env, subst, mod, moduleInterfaces) {
  const importedSource = path.resolve(
    path.dirname(mod.absoluteFilePath),
    node.source.value,
  );
  let importedInterface = moduleInterfaces.get(importedSource);
  for (const spec of node.specifiers) {
    const type = importedInterface[spec.imported.name];
    env.set(spec.local.name, type);
  }
  return ok(undefined);
}
