import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
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
  ...nextCoreWebVitals,
  {
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
