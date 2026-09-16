import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routeRoot = path.join(root, "src", "routes", "super-admin");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".tsx")) files.push(full);
  }
}
walk(routeRoot);

const routePaths = new Set();
for (const file of files) {
  const relative = path.relative(routeRoot, file).replaceAll("\\", "/").replace(/\.tsx$/, "");
  if (relative === "route") continue;
  const segments = relative.split("/").flatMap((segment) => segment === "index" ? [] : [segment]);
  const route = "/super-admin" + (segments.length ? "/" + segments.join("/") : "");
  routePaths.add(route.replace(/\$[^/]+/g, "__param__"));
}

const sources = [
  path.join(root, "src", "components", "super-admin", "super-admin-sidebar.tsx"),
  path.join(root, "src", "components", "super-admin", "super-admin-breadcrumbs.tsx"),
  path.join(root, "src", "lib", "nav.ts"),
];
const links = new Set();
for (const source of sources) {
  const text = fs.readFileSync(source, "utf8");
  for (const match of text.matchAll(/(?:url|href):\s*["'](\/super-admin[^"']*)["']/g)) links.add(match[1]);
  for (const match of text.matchAll(/<Link[^>]+to=["'](\/super-admin[^"']*)["']/g)) links.add(match[1]);
}

const missing = [...links].filter((link) => {
  const normalized = link.replace(/\/[^/]+$/, (segment) => segment.startsWith("/$") ? "/__param__" : segment);
  return !routePaths.has(normalized) && !routePaths.has(link);
});
if (missing.length) {
  console.error(`Broken platform routes: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Verified ${links.size} platform navigation links against ${routePaths.size} route files.`);
