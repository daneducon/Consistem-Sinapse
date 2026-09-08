function integer(name, fallback, min, max) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
}
export const config = {
    port: integer("PORT", 8080, 1, 65535),
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
    allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN || "consistem.com.br").trim().toLowerCase(),
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || "",
    defaultModel: process.env.OPENROUTER_DEFAULT_MODEL?.trim() || "google/gemini-2.5-flash",
    fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL?.trim() || "openai/gpt-4o-mini",
    openRouterTimeoutMs: integer("OPENROUTER_TIMEOUT_MS", 20_000, 1_000, 60_000),
    rateLimitWindowMs: integer("RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 3_600_000),
    rateLimitMax: integer("RATE_LIMIT_MAX", 20, 1, 1_000),
};
if (!config.allowedEmailDomain || config.allowedEmailDomain.includes("@")) {
    throw new Error("ALLOWED_EMAIL_DOMAIN must be a domain name");
}
if (!config.googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is required");
}
