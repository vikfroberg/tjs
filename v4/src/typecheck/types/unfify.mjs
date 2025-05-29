import { ok, error } from "../../result.mjs";
import * as T from "./data.mjs";

export let applySubst = (subst, type) => {
  switch (type.type) {
    case "var":
      return subst[type.id] ? applySubst(subst, subst[type.id]) : type;
    case "function":
      return T.funN(
        type.paramTypes.map((paramType) => applySubst(subst, paramType)),
        applySubst(subst, type.returnType),
      );
    case "scheme":
      // Don't substitute bound variables in schemes
      const filteredSubst = { ...subst };
      for (const tVar of type.vars) {
        delete filteredSubst[tVar.id];
      }
      return T.scheme(type.vars, applySubst(filteredSubst, type.body));
    default:
      return type;
  }
};

export let unify = (t1, t2, subst = {}) => {
  t1 = applySubst(subst, t1);
  t2 = applySubst(subst, t2);

  if (t1.type === "var") {
    if (t1.id === t2.id) {
      return ok(subst);
    } else {
      if (T.occursInType(t1, t2)) return error({ type: "occursCheck", subst });
      subst[t1.id] = t2;
      return ok(subst);
    }
  }

  if (t2.type === "var") return unify(t2, t1, subst);

  if (t1.type === t2.type) {
    if (t1.type === "number" || t1.type === "boolean" || t1.type === "string") {
      return ok(subst);
    } else if (t1.type === "function") {
      if (t1.paramTypes.length !== t2.paramTypes.length) {
        return error({ type: "arityMismatch", subst });
      }
      for (let i = 0; i < t1.paramTypes.length; i++) {
        let paramResult = unify(t1.paramTypes[i], t2.paramTypes[i], subst);
        if (paramResult.error)
          return error({ type: "paramMismatch", paramIndex: i, subst });
      }
      let returnResult = unify(t1.returnType, t2.returnType, subst);
      if (returnResult.error) return error({ type: "returnMismatch", subst });
      return ok(subst);
    }
    throw new Error(`Unknown type ${t1.type}`);
  }

  return error({ type: "typeMismatch", subst });
};
