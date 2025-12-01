import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

export function requestContextMiddleware(req, _res, next) {
  const route = req.originalUrl ?? req.url ?? null;
  store.run({ route }, () => next());
}

export function getRequestContext() {
  return store.getStore() ?? {};
}
