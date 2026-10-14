import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Acceso a la base solo por src/lib/db/ (spec 005, contracts/data-access.md; constitución I):
// - el pool sin envolver y los drivers no se importan fuera de la capa de datos y del login;
// - el panel nunca usa withService, que se salta RLS.
const DRIVER_IMPORTS = [
  { name: "pg", message: "Usa withAdmin/withService de @/lib/db/client (spec 005)." },
  { name: "drizzle-orm/node-postgres", message: "Usa withAdmin/withService de @/lib/db/client (spec 005)." },
  { name: "@/lib/db/pool", message: "El pool sin envolver solo se usa dentro de src/lib/db/ y src/lib/auth/." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**", "src/lib/auth/**"],
    rules: { "no-restricted-imports": ["error", { paths: DRIVER_IMPORTS }] },
  },
  {
    files: ["src/lib/admin/**", "src/app/**/admin/**", "src/components/admin/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...DRIVER_IMPORTS,
            {
              name: "@/lib/db/client",
              importNames: ["withService"],
              message: "El panel usa withAdmin: withService se salta RLS (constitución I).",
            },
          ],
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
