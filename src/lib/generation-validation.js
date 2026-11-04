// JSON Pointer locations travel with validation failures; UI messages remain
// readable while the repair agent can identify the exact failing field.
export function contentError(path, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.path = path;
  return error;
}

export function atContentPath(path, validate) {
  try {
    return validate();
  } catch (error) {
    throw contentError(path + (error.path || ""), error.message, error);
  }
}
