// Levenshtein distance for fuzzy method matching (typo correction)
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const STRUCTURED_EXAMPLES = {
  array: '["a","b"]',
  object: '{"key":"value"}',
};

function matchesStructuredType(value, type) {
  if (type === 'array') return Array.isArray(value);
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeParsedType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function parseStructuredValue(key, type, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `--${key} expects a JSON ${type}, but the value is not valid JSON: ${raw}\n` +
        `  Example: --${key} '${STRUCTURED_EXAMPLES[type]}'`,
    );
  }

  if (!matchesStructuredType(parsed, type)) {
    throw new Error(
      `--${key} expects a JSON ${type}, but got ${describeParsedType(parsed)}: ${raw}\n` +
        `  Example: --${key} '${STRUCTURED_EXAMPLES[type]}'`,
    );
  }

  return parsed;
}

// JSON Schema allows a union such as ["object", "null"] for a nullable param.
// Only an unambiguous single non-null type is coerced; anything else stays a string.
function resolveSchemaType(prop) {
  const declared = Array.isArray(prop.type) ? prop.type : [prop.type];
  const concrete = declared.filter((t) => t && t !== 'null');
  return concrete.length === 1 ? concrete[0] : null;
}

// Coerce CLI string args to the types declared in the MCP inputSchema.
// Values without a schema entry, and values the schema declares as string, are never touched.
function coerceArgsBySchema(args, inputSchema) {
  if (!inputSchema?.properties) return args;

  const coerced = { ...args };
  for (const [key, value] of Object.entries(coerced)) {
    const prop = inputSchema.properties[key];
    if (!prop || typeof value !== 'string') continue;

    const type = resolveSchemaType(prop);

    if (type === 'array' || type === 'object') {
      coerced[key] = parseStructuredValue(key, type, value);
      continue;
    }

    if (type === 'number' || type === 'integer') {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        coerced[key] = type === 'integer' ? Math.trunc(num) : num;
      }
    }
  }

  return coerced;
}

module.exports = { levenshtein, coerceArgsBySchema };
