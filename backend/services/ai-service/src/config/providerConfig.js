export function resolveProviderConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || "groq").trim().toLowerCase();
  if (provider !== 'groq') {
    throw Object.assign(new Error("AI_PROVIDER must be groq"), { status: 503, code: "AI_PROVIDER_CONFIG_INVALID" });
  }
  const prefix = 'GROQ';
  return {
    provider, prefix, label: 'Groq',
    apiKey: env[`${prefix}_API_KEY`],
    baseUrl: 'https://api.groq.com/openai/v1',
    model: env.GROQ_MODEL || 'openai/gpt-oss-20b',
    tokenLimit: env[`${prefix}_MAX_OUTPUT_TOKENS`], timeout: env[`${prefix}_TIMEOUT_MS`]
  };
}

export function getProviderStatus(env = process.env) {
  const config = resolveProviderConfig(env);
  return { provider: config.provider, configured: Boolean(config.apiKey?.trim()), model: config.model };
}
