export let ok = (value) => ({ error: false, ok: true, value });
export let error = (value) => ({ error: true, ok: false, value });

export let getError = (result) => (result.error ? result.value : null);

export let cata = (result, handleOk, handleError) => {
  if (result.error) return handleError(result.value);
  return handleOk(result.value);
};
