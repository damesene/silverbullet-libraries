// Serves a page that runs the libraries without SilverBullet, on mock data:
//   npm run playground
import * as esbuild from "esbuild";

const port = Number(process.env.PORT ?? 8000);

const ctx = await esbuild.context({
  entryPoints: ["playground/playground.ts"],
  outdir: "playground",
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  write: false,
  loader: { ".md": "text" },
  logLevel: "info",
});
await ctx.watch();
await ctx.serve({ servedir: "playground", host: "127.0.0.1", port });
console.log(`Playground: http://localhost:${port}/`);
