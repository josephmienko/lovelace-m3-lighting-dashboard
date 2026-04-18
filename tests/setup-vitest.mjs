import { afterEach, beforeAll } from "vitest";

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
