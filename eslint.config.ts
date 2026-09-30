import js from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";

export default [
  js.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    ignores: ["**/dist/**", "**/.astro/**", "**/node_modules/**", "cdk/cdk.out/**"],
  },
  {
    files: ["cdk/**/*.js"],
    languageOptions: {
      globals: {
        exports: "writable",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
];
