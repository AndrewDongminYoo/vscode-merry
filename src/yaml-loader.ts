import * as yaml from "js-yaml";

/**
 * The slice of the js-yaml exports that differs between major versions.
 * js-yaml 4 loads with `DEFAULT_SCHEMA`, which resolves `<<` merge keys.
 * js-yaml 5 loads with `CORE_SCHEMA`, which does not, and no longer exports `DEFAULT_SCHEMA`.
 * js-yaml 5 adds the merge key back with `CORE_SCHEMA.withTags(mergeTag)`.
 */
interface SchemaExports {
  DEFAULT_SCHEMA?: yaml.Schema;
  mergeTag?: object;
  CORE_SCHEMA: { withTags?: (tag: object) => yaml.Schema };
}

function resolveSchema(): yaml.Schema | undefined {
  const api = yaml as unknown as SchemaExports;
  if (api.mergeTag && api.CORE_SCHEMA.withTags) {
    return api.CORE_SCHEMA.withTags(api.mergeTag);
  }
  return api.DEFAULT_SCHEMA;
}

const SCHEMA = resolveSchema();

/**
 * Load one YAML document with an explicit schema, so that js-yaml 4 and 5 read
 * merry and pubspec files the same way: anchors, aliases, and `<<` merge keys.
 * Tags outside that set (`!!timestamp`, `!!binary`, `!!omap`, `!!pairs`, `!!set`)
 * are only resolved by js-yaml 4. Merry files do not use them.
 */
export function loadYaml(source: string): unknown {
  return yaml.load(source, { schema: SCHEMA });
}
