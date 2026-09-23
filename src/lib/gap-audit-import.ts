/**
 * Parses GAPS_AUDIT.md into structured gap findings for the admin
 * gap-tracking workspace. Pure functions only — no database access.
 */

export type GapCategory =
  | "missing_action"
  | "unreachable_page"
  | "broken_button"
  | "duplicate_route"
  | "other";

export interface ParsedGapFinding {
  code: string;
  section: string;
  category: GapCategory;
  title: string;
  route: string | null;
  component: string | null;
  observed_behavior: string | null;
}

const clean = (value: string) =>
  value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();

const slug = (value: string) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

function categoryFor(section: string): GapCategory {
  const lower = section.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("shadow")) return "duplicate_route";
  if (lower.startsWith("a.") || lower.includes("missing backend action")) return "missing_action";
  if (lower.startsWith("b.") || lower.includes("unreachable")) return "unreachable_page";
  if (lower.startsWith("c") || lower.includes("button") || lower.includes("placeholder")) return "broken_button";
  return "other";
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(clean);
}

const isSeparator = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());

export function parseGapAudit(markdown: string): ParsedGapFinding[] {
  const findings: ParsedGapFinding[] = [];
  const seen = new Set<string>();
  let section = "General";
  let headerSeen = false;

  const push = (finding: Omit<ParsedGapFinding, "code">) => {
    let code = `${finding.category}:${slug(finding.title)}`;
    let suffix = 2;
    while (seen.has(code)) code = `${finding.category}:${slug(finding.title)}-${suffix++}`;
    seen.add(code);
    findings.push({ ...finding, code });
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("#")) {
      section = clean(line.replace(/^#+\s*/, ""));
      headerSeen = false;
      continue;
    }

    const category = categoryFor(section);

    if (line.startsWith("|")) {
      if (isSeparator(line)) continue;
      const cells = splitRow(line);
      if (cells.length < 2) continue;
      if (!headerSeen) {
        headerSeen = true;
        continue;
      }
      if (category === "missing_action") {
        push({
          section,
          category,
          title: cells[0] ?? "",
          route: cells[1] || null,
          component: cells[2] || null,
          observed_behavior: cells[3] || null,
        });
      } else if (category === "unreachable_page") {
        push({
          section,
          category,
          title: cells[0] ?? "",
          route: cells[0] || null,
          component: cells[1] || null,
          observed_behavior: cells[2] || null,
        });
      } else {
        push({
          section,
          category,
          title: cells[0] ?? "",
          route: null,
          component: null,
          observed_behavior: cells[1] || null,
        });
      }
      continue;
    }

    // Bullet findings (duplicate / shadow entry points, hub tile notes)
    const bullet = line.match(/^-\s+(.*)$/);
    if (bullet && (category === "duplicate_route" || category === "broken_button")) {
      const body = bullet[1] ?? "";
      const bold = body.match(/^\*\*(.+?)\*\*\s*(.*)$/);
      const title = clean(bold?.[1] ?? body).slice(0, 120);
      if (!title) continue;
      push({
        section,
        category,
        title,
        route: null,
        component: null,
        observed_behavior: clean(bold?.[2] ?? body) || null,
      });
    }
  }

  return findings.filter((finding) => finding.title.length > 0);
}
