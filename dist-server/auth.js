import { config } from "./config.js";
async function verifyAccessToken(accessToken) {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok)
        return null;
    return response.json();
}
export async function requireAuth(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Autenticação obrigatória." });
        return;
    }
    try {
        const account = await verifyAccessToken(authorization.slice(7));
        const email = account?.email?.trim().toLowerCase();
        if (account?.aud !== config.googleClientId || !account.sub || Number(account.expires_in) <= 0) {
            res.status(401).json({ error: "Token emitido para um cliente OAuth diferente ou expirado." });
            return;
        }
        if (!email || account.email_verified !== "true") {
            res.status(403).json({ error: "É necessário usar um e-mail verificado." });
            return;
        }
        if (!email.endsWith(`@${config.allowedEmailDomain}`)) {
            res.status(403).json({ error: "Domínio de e-mail não autorizado." });
            return;
        }
        res.locals.uid = account.sub;
        next();
    }
    catch {
        res.status(401).json({ error: "Token de autenticação inválido ou expirado." });
    }
}
const requestsByUid = new Map();
export function rateLimit(_req, res, next) {
    const uid = res.locals.uid;
    const now = Date.now();
    const current = requestsByUid.get(uid);
    if (!current || current.resetAt <= now) {
        if (requestsByUid.size > 10_000) {
            for (const [key, entry] of requestsByUid) {
                if (entry.resetAt <= now)
                    requestsByUid.delete(key);
            }
        }
        requestsByUid.set(uid, { count: 1, resetAt: now + config.rateLimitWindowMs });
        next();
        return;
    }
    if (current.count >= config.rateLimitMax) {
        res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
        res.status(429).json({ error: "Limite de solicitações excedido. Tente novamente em instantes." });
        return;
    }
    current.count += 1;
    next();
}
