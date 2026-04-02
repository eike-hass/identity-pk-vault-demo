import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// Polyfill crypto.subtle — happy-dom delegates to the host Node.js runtime,
// but some versions need an explicit assignment.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, writable: true });
}

// Polyfill URL.createObjectURL / revokeObjectURL — not implemented in happy-dom.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-url";
  URL.revokeObjectURL = () => {};
}
