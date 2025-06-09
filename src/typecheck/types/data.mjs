export let string = { type: "string" };
export let number = { type: "number" };
export let bool = { type: "boolean" };
export let null_ = { type: "null" };
export let funN = (paramTypes, returnType) => ({
  type: "function",
  paramTypes,
  returnType,
});
export let module_ = (exports) => ({ type: "module", exports });
export let typeVar = (id) => ({ type: "var", id });

export let scheme = (vars, type) => ({ type: "scheme", vars, body: type });

let typeVarCounter = 0;

export let resetTypeVarCounter = () => {
  typeVarCounter = 0;
};

export let freshTypeVar = () => {
  return { type: "var", id: ++typeVarCounter };
};

export let stringify = (t) => {
  if (t.type === "scheme") {
    const varNames = t.vars
      .map((v) => `'${String.fromCharCode(97 + (v.id % 26))}`)
      .join(", ");
    return `forall ${varNames}. ${stringify(t.body)}`;
  }
  return t.type;
};

export let freeTypeVars = (type) => {
  switch (type.type) {
    case "var":
      return new Set([type.id]);
    case "function":
      const paramVars = type.paramTypes.reduce(
        (acc, param) => new Set([...acc, ...freeTypeVars(param)]),
        new Set(),
      );
      const returnVars = freeTypeVars(type.returnType);
      return new Set([...paramVars, ...returnVars]);
    case "scheme":
      const bodyVars = freeTypeVars(type.body);
      const boundVars = new Set(type.vars.map((v) => v.id));
      return new Set([...bodyVars].filter((v) => !boundVars.has(v)));
    default:
      return new Set();
  }
};

export function occursInType(tVar, type) {
  switch (type.type) {
    case "var":
      return tVar.id === type.id;
    case "function":
      return (
        type.paramTypes.some((paramType) => occursInType(tVar, paramType)) ||
        occursInType(tVar, type.returnType)
      );
    case "scheme":
      return occursInType(tVar, type.body);
    default:
      return false;
  }
}
