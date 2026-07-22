import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Existing client bootstrapping and Leaflet effects intentionally hydrate local state.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", ".netlify/**", "node_modules/**"]),
])
