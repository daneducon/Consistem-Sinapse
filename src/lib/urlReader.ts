import { getAccessToken } from "./googleAuth";
import { SessionExpiredError } from "./errors";

export interface DetectedUrl {
  url: string;
  userNotes: string;
  domain: string;
  type: "youtube" | "article" | "social" | "general";
  videoId?: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i,
  );
  return match ? match[1] : null;
}

export function detectUrl(text: string): DetectedUrl | null {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  if (!match) return null;

  const rawUrl = match[0].trim();
  const url = rawUrl.replace(/[.,;:!?)]+$/, "");
  const userNotes = text.replace(rawUrl, "").trim();
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const lowerDomain = domain.toLowerCase();
  const videoId = extractYouTubeVideoId(url) || undefined;
  let type: DetectedUrl["type"] = "general";
  if (lowerDomain === "youtube.com" || lowerDomain.endsWith(".youtube.com") || lowerDomain === "youtu.be") {
    type = "youtube";
  } else if (["instagram.com", "twitter.com", "x.com", "linkedin.com"].some((d) => lowerDomain === d || lowerDomain.endsWith(`.${d}`))) {
    type = "social";
  } else if (["medium.com", "substack.com", "dev.to"].some((d) => lowerDomain === d || lowerDomain.endsWith(`.${d}`))) {
    type = "article";
  }
  return { url, userNotes, domain, type, videoId };
}

export async function fetchUrlContent(url: string): Promise<{ content: string; success: boolean }> {
  const accessToken = getAccessToken();
  if (!accessToken) throw new SessionExpiredError();
  const response = await fetch("/api/read-url", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  const data = await response.json().catch(() => null) as { content?: string; success?: boolean; error?: string } | null;
  if (!response.ok || !data?.success || typeof data.content !== "string") {
    if (response.status === 401) throw new SessionExpiredError();
    throw new Error(data?.error || "Não foi possível ler o conteúdo do link.");
  }
  return { content: data.content, success: true };
}
