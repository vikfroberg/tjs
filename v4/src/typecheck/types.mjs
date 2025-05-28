export let string = { type: "string" };
export let number = { type: "number" };
export let bool = { type: "boolean" };
export let funN = (paramTypes, returnType) => ({
  type: "function",
  paramTypes,
  returnType,
});
export let module_ = (exports) => ({ type: "module", exports });
export let typeVar = (id) => ({ type: "var", id });

export let scheme = (vars, type) => ({ type: "scheme", vars, body: type });

let typeVarCounter = 0;
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
