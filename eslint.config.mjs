import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Acceso a la base solo por src/lib/db/ (spec 005, contracts/data-access.md; constitución I):
// - el pool sin envolver y los drivers no se importan fuera de la capa de datos y del login;
// - el panel nunca usa withService, que se salta RLS;
// - solo src/lib/auth/session.ts fabrica una VerifiedSession (la identidad que withAdmin fija en la base).
// Ojo: dos bloques con la misma regla no se combinan, el último gana. Por eso el bloque del panel repite
// DRIVER_IMPORTS: al añadir una entrada común, añadirla en DRIVER_IMPORTS (revisión spec 005, MAINT-004).
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
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/session.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='VerifiedSession']",
          message: "Solo getVerifiedSession (src/lib/auth/session.ts) crea una VerifiedSession (revisión spec 005, MAINT-006).",
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
