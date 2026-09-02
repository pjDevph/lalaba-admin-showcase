import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // T10 (2026-08-22): this repo is the only one with ZERO `any`, and that is
    // currently an accident of the eslint-config-next/typescript preset rather
    // than a stated rule — swap or override that preset and the guarantee
    // disappears silently. Pin it explicitly so the one clean repo stays clean.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Never the browser's blocking dialogs. An action to confirm goes through
    // <ConfirmDialog> (components/ui/confirm-dialog.tsx); anything that is only
    // telling the admin something goes through a toast.
    //
    // A rule rather than a convention: two window.confirm calls survived on
    // pages that were already importing ConfirmDialog for other actions, so
    // reviewing for it clearly does not catch it.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // BOTH forms. `no-restricted-globals` only matches the bare identifier —
      // `window.confirm(...)` is a member expression and sails past it, and
      // window-prefixed is exactly how the two real violations were written.
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "confirm",
          message: "Use <ConfirmDialog> — not the blocking browser dialog.",
        },
        {
          object: "window",
          property: "alert",
          message: "Use a toast — not the blocking browser dialog.",
        },
        {
          object: "window",
          property: "prompt",
          message:
            "Use a real modal with a text field — not the blocking browser dialog.",
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message: "Use <ConfirmDialog> — not the blocking browser dialog.",
        },
        {
          name: "alert",
          message: "Use a toast — not the blocking browser dialog.",
        },
        {
          name: "prompt",
          message:
            "Use a real modal with a text field — not the blocking browser dialog.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
