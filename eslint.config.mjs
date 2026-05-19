import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "packages/*/dist/**",
      "node_modules/**",
    ],
  },
  {
    files: ["packages/*/src/**/*.ts", "packages/*/tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "./packages/cli/tsconfig.json",
          "./packages/shared/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["packages/extension/src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        AbortController: "readonly",
        Blob: "readonly",
        chrome: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        crypto: "readonly",
        document: "readonly",
        fetch: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        HTMLAnchorElement: "readonly",
        HTMLElement: "readonly",
        location: "readonly",
        navigator: "readonly",
        Promise: "readonly",
        ReadableStream: "readonly",
        Request: "readonly",
        Response: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        window: "readonly",
      },
    },
  },
);
