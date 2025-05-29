import inferExpr from "./expr.mjs";

/* MODULES ---------------------------------------- */

export default function inferModule(
  module,
  moduleInterfaces,
  env = new Env(),
  subst = {},
) {
  let exports = {};

  for (const node of module.ast.body) {
    console.log(node);
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
      let result = inferImportDeclaration(node, env, subst);
      if (result.error) return result;
    } else {
      return error(unsupported(node, { stage: "inferModule" }));
    }
  }

  return ok(T.module_(exports));
}

/* VARIABLES ---------------------------------------- */

function inferVariableDeclaration(node, env, subst) {
  for (const decl of node.declarations) {
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
          stage: "inferModule.VariableDeclaration.recursion",
        }),
      );
    const finalType = applySubst(subst, selfTypeVar);
    const generalizedType = generalize(env, finalType);
    env.set(name, generalizedType);
  }
  return ok();
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
      }
    } else {
      return error(
        unsupported(node.declaration, {
          stage: "inferModule.ExportNamedDeclaration",
        }),
      );
    }
  }
  return ok();
}

function inferExportDefaultDeclaration(node, env, subst, exports) {
  const type = inferExpr(node.declaration, env, subst);
  if (type.error) return type;
  const generalizedType = generalize(env, type.value);
  env.set("__default__", generalizedType);
  exports["__default__"] = generalizedType;
  return ok();
}

/* IMPORTS ---------------------------------------- */

function inferImportDeclaration(node, env, subst) {
  const importedSource = path.resolve(
    path.dirname(module.absoluteFilePath),
    node.source.value,
  );
  let importedInterface = moduleInterfaces.get(importedSource);
  for (const spec of node.specifiers) {
    const type = importedInterface[spec.imported.name];
    env.set(spec.local.name, type);
  }
  return ok();
}
