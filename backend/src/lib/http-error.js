export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const assert = (condition, status, code, message) => {
  if (!condition) throw new HttpError(status, code, message);
};
