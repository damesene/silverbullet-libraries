// Bundles each library's src/index.ts into the .js file next to its library page.
// --check builds in memory and fails when a committed bundle differs from its sources.
import * as esbuild from "esbuild";
import { readFile } from "node:fs/promises";

const libraries = ["table-plus"];
const watch = process.argv.includes("--watch");
const check = process.argv.includes("--check");

let stale = 0;
for (const name of libraries) {
  const options = {
    entryPoints: [`${name}/src/index.ts`],
    outfile: `${name}/${name}.js`,
    bundle: true,
    format: "esm",
    target: "es2022",
    legalComments: "inline",
    logLevel: check ? "warning" : "info",
  };
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else if (check) {
    const result = await esbuild.build({ ...options, write: false });
    const built = result.outputFiles[0].text;
    // The working copy may have CRLF line endings on Windows; git commits LF
    const committed = (await readFile(options.outfile, "utf8").catch(() => "")).replaceAll("\r\n", "\n");
    if (built !== committed) {
      console.error(`${options.outfile} does not match ${name}/src: run npm run build`);
      stale++;
    }
  } else {
    await esbuild.build(options);
  }
}
if (stale) process.exit(1);
