import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React rules
      ...react.configs.recommended.rules,

      // Accessibility rules
      ...jsxA11y.flatConfigs.recommended.rules,
      // Custom dropdowns/menus use div elements with click handlers - proper keyboard
      // support would require significant refactoring. Set to warn for tracking.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      // autoFocus is used intentionally for better UX in search inputs and modal forms
      "jsx-a11y/no-autofocus": "off",
      // Custom select/tablist components need tabIndex refactoring
      "jsx-a11y/interactive-supports-focus": "warn",
      "react/react-in-jsx-scope": "off", // Not needed with React 17+ JSX transform
      "react/prop-types": "off", // Using TypeScript for type checking

      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      // Re-enable no-dupe-keys: typescript-eslint disables it assuming TS catches duplicates,
      // but TS doesn't flag dupes in unconstrained objects (e.g., vi.mock() factories)
      "no-dupe-keys": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "*.config.*",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  prettier
);
