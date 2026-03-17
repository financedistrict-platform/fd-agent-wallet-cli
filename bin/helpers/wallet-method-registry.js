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

// Coerce CLI string args to number/integer based on MCP inputSchema
function coerceArgsBySchema(args, inputSchema) {
  if (!inputSchema?.properties) return args;

  const coerced = { ...args };
  for (const [key, value] of Object.entries(coerced)) {
    const prop = inputSchema.properties[key];
    if (!prop) continue;

    if ((prop.type === 'number' || prop.type === 'integer') && typeof value === 'string') {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        coerced[key] = prop.type === 'integer' ? Math.trunc(num) : num;
      }
    }
  }

  return coerced;
}

module.exports = { levenshtein, coerceArgsBySchema };
