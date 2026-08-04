/**
 * Vendored Zustand vanilla store core, compatible with Zustand 5.0.14.
 *
 * This local copy keeps the 3D Edit store framework-scoped without adding a
 * React dependency or changing the application-wide state architecture.
 * Upstream: https://github.com/pmndrs/zustand (MIT License).
 */
const createStoreImpl = (createState) => {
  let state;
  const listeners = new Set();

  const setState = (partial, replace) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    if (Object.is(nextState, state)) return;
    const previousState = state;
    state = replace ?? (typeof nextState !== 'object' || nextState === null)
      ? nextState
      : Object.assign({}, state, nextState);
    listeners.forEach((listener) => listener(state, previousState));
  };

  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};

export const createStore = (createState) => (
  createState ? createStoreImpl(createState) : createStoreImpl
);
