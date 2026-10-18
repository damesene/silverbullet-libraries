// Bundles each library's src/index.ts into the .js file next to its library page
import * as esbuild from "esbuild";

const libraries = ["table-plus"];
const watch = process.argv.includes("--watch");

for (const name of libraries) {
  const options = {
    entryPoints: [`${name}/src/index.ts`],
    outfile: `${name}/${name}.js`,
    bundle: true,
    format: "esm",
    target: "es2022",
    legalComments: "inline",
    logLevel: "info",
  };
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
}
