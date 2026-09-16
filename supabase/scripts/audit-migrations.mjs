import fs from "node:fs";
import path from "node:path";

const migrationsDir = path.resolve("supabase/migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const definitions = new Map();
const timestamps = new Map();
const warnings = [];
const errors = [];

function addDefinition(kind, name, file, line) {
  const key = `${kind}:${name.toLowerCase()}`;
  const entries = definitions.get(key) ?? [];
  entries.push({ file, line });
  definitions.set(key, entries);
}

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  const timestamp = file.match(/^(\d{14})/);
  if (timestamp) {
    const sameTimestamp = timestamps.get(timestamp[1]) ?? [];
    sameTimestamp.push(file);
    timestamps.set(timestamp[1], sameTimestamp);
  }

  for (const match of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    addDefinition("function", match[1], file, sql.slice(0, match.index).split("\n").length);
  }
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
    addDefinition("table", match[1], file, sql.slice(0, match.index).split("\n").length);
  }
  for (const match of sql.matchAll(/CREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
    addDefinition("enum/type", match[1], file, sql.slice(0, match.index).split("\n").length);
  }
  for (const match of sql.matchAll(/CREATE\s+POLICY\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ON\s+public\.([a-z_][a-z0-9_]*)/gi)) {
    addDefinition("policy", `${match[1] ?? match[2]} ON ${match[3]}`, file, sql.slice(0, match.index).split("\n").length);
  }

  if (/^\s*DROP\s+TYPE\s+public\./im.test(sql)) {
    warnings.push(`${file}: contains DROP TYPE; verify this is additive and production-safe`);
  }
  if (/^\s*ALTER\s+TABLE\s+public\.[^\n]+\s+DISABLE\s+TRIGGER\s+/im.test(sql)) {
    warnings.push(`${file}: contains unguarded ALTER TABLE ... DISABLE TRIGGER`);
  }
}

for (const [timestamp, sameTimestamp] of timestamps) {
  if (sameTimestamp.length > 1) {
    warnings.push(`timestamp ${timestamp} has lexical-order dependencies: ${sameTimestamp.join(", ")}`);
  }
}

for (const [key, entries] of definitions) {
  if (entries.length < 2) continue;
  const [kind, name] = key.split(":");
  const locations = entries.map(({ file, line }) => `${file}:${line}`).join(", ");
  if (kind === "table" || kind === "enum/type") {
    errors.push(`duplicate ${kind} ${name}: ${locations}`);
  } else {
    warnings.push(`${kind === "policy" ? "redeclared policy" : "replaced function"} ${name}; verify the later definition is intentional and guarded: ${locations}`);
  }
}

console.log(`Audited ${files.length} SQL migrations in lexical dependency order.`);
for (const warning of warnings) console.warn(`WARNING ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);

if (errors.length > 0) {
  process.exitCode = 1;
}
