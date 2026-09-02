import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmount between tests.
 *
 * Testing Library registers this itself only when Vitest runs with
 * `globals: true`, which this project does not — so without it every rendered
 * component stayed in the document and a query like `document.querySelector`
 * silently returned the PREVIOUS test's markup. The first two component tests
 * written against this setup both failed that way, and both would have passed
 * for the wrong reason had they asserted something less specific.
 */
afterEach(cleanup);
