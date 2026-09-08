import express from "express";
import { rateLimit, requireAuth } from "./auth.js";
import { analyzeIdea, analyzeUrl } from "./openrouter.js";
import { readUrl } from "./urlReader.js";
import { existingIdeas, HttpError, optionalString, requiredString } from "./validation.js";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb", strict: true }));
app.use("/api", requireAuth, rateLimit);
const asyncRoute = (handler) => (req, res, next) => void handler(req, res).catch(next);
app.post("/api/read-url", asyncRoute(async (req, res) => {
    const result = await readUrl(req.body?.url);
    res.json({ content: result.content, success: true });
}));
app.post("/api/analyze-idea", asyncRoute(async (req, res) => {
    const text = requiredString(req.body?.textoBruto, "textoBruto", 10_000);
    res.json(await analyzeIdea(text, existingIdeas(req.body?.existingIdeas)));
}));
app.post("/api/analyze-url", asyncRoute(async (req, res) => {
    const notes = optionalString(req.body?.userNotes, "userNotes", 4_000);
    const ideas = existingIdeas(req.body?.existingIdeas);
    const extracted = await readUrl(req.body?.url);
    res.json(await analyzeUrl(extracted.url, extracted.content, notes, ideas));
}));
app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ error: "Corpo JSON inválido." });
        return;
    }
    if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
        res.status(413).json({ error: "Corpo da solicitação excede 64kb." });
        return;
    }
    console.error(error);
    res.status(500).json({ error: "Erro interno do servidor." });
});
export default app;
