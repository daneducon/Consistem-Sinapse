import { getAccessToken } from "./googleAuth";
import type { Idea } from "../types";
import { SessionExpiredError } from "./errors";

export interface AIAnalysisResult {
  temaMacro: string;
  palavrasChave: string;
  provocacoesFollowUp: string;
}

export interface UrlAnalysisResult extends AIAnalysisResult {
  resumoGerado: string;
}

function compactIdeaContext(ideas: Idea[]) {
  const byTheme = new Map<string, Idea>();
  for (const idea of ideas) {
    const theme = idea.temaMacro.trim();
    if (theme && !byTheme.has(theme)) byTheme.set(theme, idea);
    if (byTheme.size >= 100) break;
  }
  const selected = new Map<number, Idea>();
  for (const idea of byTheme.values()) selected.set(idea.idNota, idea);
  for (const idea of ideas.slice(-6)) selected.set(idea.idNota, idea);
  return [...selected.values()].map((idea) => ({
    idNota: idea.idNota,
    temaMacro: idea.temaMacro.slice(0, 120),
    textoBruto: idea.textoBruto.slice(0, 300),
  }));
}

async function apiRequest<T>(path: string, body: unknown): Promise<T> {
  const accessToken = getAccessToken();
  if (!accessToken) throw new SessionExpiredError();

  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "Falha ao processar a solicitação.";
    if (response.status === 401) throw new SessionExpiredError();
    throw new Error(message);
  }
  return data as T;
}

export function analyzeIdeaWithOpenRouter(
  textoBruto: string,
  existingIdeas: Idea[] = [],
): Promise<AIAnalysisResult> {
  return apiRequest<AIAnalysisResult>("analyze-idea", {
    textoBruto,
    existingIdeas: compactIdeaContext(existingIdeas),
  });
}

export function analyzeUrlContentWithOpenRouter(
  url: string,
  userNotes = "",
  existingIdeas: Idea[] = [],
): Promise<UrlAnalysisResult> {
  return apiRequest<UrlAnalysisResult>("analyze-url", {
    url,
    userNotes,
    existingIdeas: compactIdeaContext(existingIdeas),
  });
}
