// Copies built libraries into a local SilverBullet space for testing:
//   npm run deploy -- <space folder>
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const libraries = ["table-plus"];
const space = process.argv[2] ?? process.env.SB_SPACE;
if (!space) {
  console.error("Usage: npm run deploy -- <space folder> (or set SB_SPACE)");
  process.exit(1);
}

const target = join(space, "Library", "damesene");
mkdirSync(target, { recursive: true });
for (const name of libraries) {
  for (const file of readdirSync(name)) {
    if (file.endsWith(".md") || file.endsWith(".js")) {
      copyFileSync(join(name, file), join(target, file));
      console.log(`${name}/${file} -> ${join(target, file)}`);
    }
  }
}
