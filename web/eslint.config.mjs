import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Server-only modules: client code may import their types, never their values. */
const SERVER_ONLY = [
  "@/lib/db/*",
  "@/lib/config/*",
  "@/lib/hermes/client",
  "@/lib/hermes/agents",
  "@/lib/hermes/localState",
  "@/lib/providers",
  "@/lib/adapters/*",
  "@/lib/connections/*",
  "@/lib/outbound/*",
  "@/lib/inbound/*",
  "@/lib/campaigns/*",
  "@/lib/sales/*",
  "@/lib/marketing/*",
  "@/lib/guide/*",
  "@/lib/jobs/*",
  "@/lib/auth/*",
  "@/lib/http/*",
  "@/lib/salesSegments",
  "@/lib/salesStrategy",
  "@/lib/salesResearch",
  "@/lib/salesContactFinder",
  "@/lib/distributionResearch",
  "@/lib/marketingDiscover",
  "@/lib/capabilities",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "components/**/*.{ts,tsx}",
      "lib/client/**/*.ts",
      "app/**/page.tsx",
      "app/**/layout.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: SERVER_ONLY,
              allowTypeImports: true,
              message: "Server-only module: import types only, or call the API from the browser.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
