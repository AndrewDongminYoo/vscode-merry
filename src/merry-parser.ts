import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";

/** Regex matching merry meta-keys like (scripts), (description), (workdir), etc. */
const META_KEY_RE = /^\(\w+\)$/;

const KEY_SCRIPTS = "(scripts)";
const KEY_DESCRIPTION = "(description)";
const KEY_WORKDIR = "(workdir)";

export interface ScriptNode {
  /** Display label — the last path segment (e.g. "linux-x64"). */
  label: string;
  /** Space-joined full path passed to `merry run` (e.g. "build linux-x64"). */
  fullPath: string;
  /** Commands to execute (empty for group nodes). */
  commands: string[];
  description?: string;
  workdir?: string;
  /** True when the node is a collapsible group with children. */
  isGroup: boolean;
  children: ScriptNode[];
  /** True when the label starts with "pre" or "post" followed by another script name. */
  isHook: boolean;
}

type YamlMap = Record<string, unknown>;

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [String(value)];
}

function isMetaKey(key: string): boolean {
  return META_KEY_RE.test(key);
}

/**
 * Recursively convert a raw YAML map of scripts into a ScriptNode tree.
 * @param map    The raw YAML scripts map (or sub-map for nested groups).
 * @param prefix Space-joined path prefix for building fullPath.
 * @param allTopLevelKeys Set of all top-level script names for hook detection.
 */
function parseMap(
  map: YamlMap,
  prefix: string,
  allTopLevelKeys: Set<string>,
): ScriptNode[] {
  const nodes: ScriptNode[] = [];

  for (const key of Object.keys(map)) {
    if (isMetaKey(key)) {
      continue;
    }

    const fullPath = prefix ? `${prefix} ${key}` : key;
    const value = map[key];

    let node: ScriptNode;

    if (value === null || typeof value === "string" || Array.isArray(value)) {
      // Simple command(s)
      node = {
        label: key,
        fullPath,
        commands: toStringList(value),
        isGroup: false,
        children: [],
        isHook: isHookKey(key, allTopLevelKeys),
      };
    } else if (typeof value === "object") {
      const valueMap = value as YamlMap;
      const hasScriptsKey = KEY_SCRIPTS in valueMap;

      if (hasScriptsKey) {
        // Definition with (scripts) key — treat as a leaf with metadata
        const scripts = valueMap[KEY_SCRIPTS];
        node = {
          label: key,
          fullPath,
          commands: toStringList(scripts),
          description: valueMap[KEY_DESCRIPTION] as string | undefined,
          workdir: valueMap[KEY_WORKDIR] as string | undefined,
          isGroup: false,
          children: [],
          isHook: isHookKey(key, allTopLevelKeys),
        };
      } else {
        // No (scripts) key → nested group
        const children = parseMap(valueMap, fullPath, allTopLevelKeys);
        node = {
          label: key,
          fullPath,
          commands: [],
          isGroup: true,
          children,
          isHook: false,
        };
      }
    } else {
      continue;
    }

    nodes.push(node);
  }

  return nodes;
}

function isHookKey(key: string, allKeys: Set<string>): boolean {
  if (key.startsWith("pre") && key.length > 3) {
    return allKeys.has(key.substring(3));
  }
  if (key.startsWith("post") && key.length > 4) {
    return allKeys.has(key.substring(4));
  }
  return false;
}

/**
 * Parse a scripts YAML map (already loaded) into ScriptNode[].
 */
function parseScriptsMap(scriptsMap: YamlMap): ScriptNode[] {
  const topLevelKeys = new Set(
    Object.keys(scriptsMap).filter((k) => !isMetaKey(k)),
  );
  return parseMap(scriptsMap, "", topLevelKeys);
}

/**
 * Resolve the scripts source path from pubspec.yaml.
 * Returns the file path where scripts live and whether it's an external file.
 */
function resolveScriptsSource(
  pubspecPath: string,
  doc: YamlMap,
): { scriptsFilePath: string; isExternal: boolean } | null {
  const scripts = doc["scripts"];
  if (scripts === undefined || scripts === null) {
    return null;
  }
  if (typeof scripts === "string") {
    const dir = path.dirname(pubspecPath);
    return { scriptsFilePath: path.join(dir, scripts), isExternal: true };
  }
  if (typeof scripts === "object" && !Array.isArray(scripts)) {
    return { scriptsFilePath: pubspecPath, isExternal: false };
  }
  return null;
}

export interface ParseResult {
  nodes: ScriptNode[];
  /** Path of the file that actually contains the scripts (may differ from pubspecPath). */
  scriptsFilePath: string;
}

/**
 * Parse scripts from a pubspec.yaml path.
 * Handles both inline scripts maps and external file references.
 */
export async function parseMerryScripts(
  pubspecPath: string,
): Promise<ParseResult | null> {
  let pubspecContent: string;
  try {
    pubspecContent = fs.readFileSync(pubspecPath, "utf8");
  } catch {
    return null;
  }

  let doc: YamlMap | null;
  try {
    doc = yaml.load(pubspecContent) as YamlMap | null;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") {
    return null;
  }

  const source = resolveScriptsSource(pubspecPath, doc);
  if (!source) {
    return null;
  }

  let scriptsMap: YamlMap;

  if (source.isExternal) {
    let externalContent: string;
    try {
      externalContent = fs.readFileSync(source.scriptsFilePath, "utf8");
    } catch {
      return null;
    }
    let externalDoc: YamlMap | null;
    try {
      externalDoc = yaml.load(externalContent) as YamlMap | null;
    } catch {
      return null;
    }
    if (!externalDoc || typeof externalDoc !== "object") {
      return null;
    }
    scriptsMap = externalDoc;
  } else {
    scriptsMap = doc["scripts"] as YamlMap;
  }

  return {
    nodes: parseScriptsMap(scriptsMap),
    scriptsFilePath: source.scriptsFilePath,
  };
}
