import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "dist-tests/**",
      "out/**",
      ".vercel/**",
      "coverage/**",
      "ku-online/**",
      "ku-online-1/**",
    ],
  },
  ...compat.extends("next", "next/core-web-vitals"),
];

export default config;
