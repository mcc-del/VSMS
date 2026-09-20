import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);
const artifactDir = path.dirname(fileURLToPath(import.meta.url));

// Bundles the seed script (and its @workspace/* imports) into a single .mjs so
// it can run with plain `node` — no tsx/ts-node needed.
await esbuild({
  entryPoints: [path.resolve(artifactDir, "scripts/seed-test-users.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: path.resolve(artifactDir, "dist/seed-test-users.mjs"),
  logLevel: "info",
  external: ["*.node", "pg-native", "bcrypt", "argon2"],
  banner: {
    js: `import { createRequire as __cr } from 'node:module'; globalThis.require = __cr(import.meta.url);`,
  },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
