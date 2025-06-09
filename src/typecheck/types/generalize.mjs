import * as T from "./data.mjs";
import { applySubst } from "./unfify.mjs";

let freeTypeVarsInEnv = (env) => {
  const allVars = new Set();
  for (const frame of env.stack) {
    for (const [name, type] of Object.entries(frame)) {
      const typeVars = T.freeTypeVars(type);
      for (const v of typeVars) {
        allVars.add(v);
      }
    }
  }
  return allVars;
};

export let generalize = (env, type) => {
  const envVars = freeTypeVarsInEnv(env);
  const typeVars = T.freeTypeVars(type);
  const generalizedVars = [...typeVars].filter((v) => !envVars.has(v));

  if (generalizedVars.length === 0) {
    return type;
  }

  const vars = generalizedVars.map((id) => ({ type: "var", id }));
  return T.scheme(vars, type);
};

export let instantiate = (scheme) => {
  if (scheme.type !== "scheme") {
    return scheme;
  }

  const subst = {};
  for (const tVar of scheme.vars) {
    subst[tVar.id] = T.freshTypeVar();
  }

  return applySubst(subst, scheme.body);
};
