import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { config } from "./config.js";
import { HttpError, requiredString } from "./validation.js";

const MAX_CONTENT_LENGTH = 20_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const SCRAPEGRAPH_URL = "https://v2-api.scrapegraphai.com/api/scrape";

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
}

export async function validatePublicUrl(value: unknown): Promise<URL> {
  const raw = requiredString(value, "url", 2_048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "URL inválida.");
  }
  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
    throw new HttpError(400, "A URL deve usar HTTP/HTTPS e não pode conter credenciais.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIp(hostname)) {
    throw new HttpError(400, "Endereço local ou privado não permitido.");
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError(422, "Não foi possível resolver o domínio informado.");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new HttpError(400, "O domínio resolve para um endereço local ou privado.");
  }
  return url;
}

function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/")[1]?.match(/^[\w-]{11}$/)?.[0] || null;
  if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
  const candidate = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
  return candidate?.match(/^[\w-]{11}$/)?.[0] || null;
}

// --- Cache em memoria (protege a cota de 500 chamadas unicas) ---
const urlCache = new Map<string, { expiresAt: number; value: { url: string; content: string } }>();

export function normalizeUrlForCache(href: string): string {
  try {
    const parsed = new URL(href);
    parsed.hash = "";
    const tracking = /^(utm_|fbclid|gclid|mc_|igshid|si$)/i;
    const kept: string[] = [];
    parsed.searchParams.forEach((value, key) => {
      if (!tracking.test(key)) kept.push(`${key}=${value}`);
    });
    kept.sort();
    parsed.search = kept.length ? `?${kept.join("&")}` : "";
    return parsed.href;
  } catch {
    return href;
  }
}

function cacheKey(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

function getCached(normalized: string): { url: string; content: string } | null {
  const entry = urlCache.get(cacheKey(normalized));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    urlCache.delete(cacheKey(normalized));
    return null;
  }
  return entry.value;
}

function setCached(normalized: string, value: { url: string; content: string }): void {
  if (urlCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = urlCache.keys().next().value;
    if (oldest) urlCache.delete(oldest);
  }
  urlCache.set(cacheKey(normalized), { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export function clearUrlCache(): void {
  urlCache.clear();
}

// --- Helpers genericos ---
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return "";
      }
    });
}

function isBlockedContent(content: string): boolean {
  return /Target URL returned error (401|403)|sign in|captcha|just a moment|enable javascript and cookies|access denied|verify you are human/i.test(content);
}

// --- YouTube: legendas oficiais (timedtext) + fallbacks ---
async function fetchYouTubeMetadata(watchUrl: string): Promise<{ title: string; author: string }> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { title: "", author: "" };
    const metadata = await response.json() as Record<string, unknown>;
    return {
      title: typeof metadata.title === "string" ? metadata.title.trim().slice(0, 300) : "",
      author: typeof metadata.author_name === "string" ? metadata.author_name.trim().slice(0, 200) : "",
    };
  } catch {
    return { title: "", author: "" };
  }
}

function pickCaptionTrack(listXml: string): string | null {
  const tracks: Array<{ lang: string; name: string }> = [];
  const trackRegex = /<track[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = trackRegex.exec(listXml)) !== null) {
    const tag = match[0];
    const lang = /lang_code="([^"]+)"/i.exec(tag)?.[1] || /lang="([^"]+)"/i.exec(tag)?.[1] || "";
    const name = /name="([^"]*)"/i.exec(tag)?.[1] || "";
    if (lang) tracks.push({ lang: lang.toLowerCase(), name });
  }
  if (!tracks.length) return null;
  const preferred = ["pt-br", "pt", "en", "es"];
  for (const pref of preferred) {
    const found = tracks.find((t) => t.lang === pref || t.lang.startsWith(`${pref}-`) || t.lang.startsWith(pref));
    if (found) return found.lang;
  }
  const autoPreferred = tracks.find((t) => !/auto|asr/i.test(t.name));
  return (autoPreferred || tracks[0]).lang;
}

function parseTimedTextXml(xml: string): string {
  const texts: string[] = [];
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(xml)) !== null) {
    const cleaned = decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (cleaned) texts.push(cleaned);
  }
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

async function fetchOfficialCaptions(videoId: string): Promise<string | null> {
  try {
    const listResponse = await fetch(`https://video.google.com/timedtext?type=list&v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!listResponse.ok) return null;
    const listXml = await listResponse.text();
    const lang = pickCaptionTrack(listXml);
    if (!lang) return null;
    const candidates = [
      `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${videoId}`,
      `https://video.google.com/timedtext?lang=${encodeURIComponent(lang.split("-")[0])}&v=${videoId}`,
    ];
    for (const endpoint of candidates) {
      try {
        const response = await fetch(endpoint, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) continue;
        const xml = await response.text();
        const transcript = parseTimedTextXml(xml);
        if (transcript.length >= 100) return transcript;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchLegacyTranscript(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const transcript = (await response.text())
      .replace(/^#\s*Transcript:[\s\S]*?##\s*Transcript/i, "")
      .replace(/\[\d+:\d+(?::\d+)?\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return transcript.length >= 100 ? transcript : null;
  } catch {
    return null;
  }
}

async function readYouTube(url: URL, videoId: string): Promise<string> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const [metadata, official, legacy] = await Promise.all([
    fetchYouTubeMetadata(watchUrl),
    fetchOfficialCaptions(videoId),
    fetchLegacyTranscript(videoId),
  ]);
  const transcript = official || legacy;
  if (!transcript) {
    throw new HttpError(422, "A transcrição do vídeo não está disponível; a análise foi interrompida para não inventar conteúdo.");
  }
  return [
    "VÍDEO DO YOUTUBE (dados extraídos)",
    metadata.title && `Título: ${metadata.title}`,
    metadata.author && `Canal: ${metadata.author}`,
    `URL: ${url.href}`,
    `Transcrição: ${transcript.slice(0, MAX_CONTENT_LENGTH)}`,
  ].filter(Boolean).join("\n");
}

// --- Nivel 1 (gratis, ilimitado): extracao direta sem dependencias ---
function extractMainHtml(html: string): string {
  const article = /<article[\s\S]*?>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  if (article && article.length > 500) return article;
  const main = /<main[\s\S]*?>([\s\S]*?)<\/main>/i.exec(html)?.[1];
  if (main && main.length > 500) return main;
  const body = /<body[\s\S]*?>([\s\S]*?)<\/body>/i.exec(html)?.[1];
  return body || html;
}

async function extractDirect(url: URL): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(url.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (/application\/pdf/i.test(contentType)) return null;
  if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType) && contentType) return null;
  let html: string;
  try {
    html = await response.text();
  } catch {
    return null;
  }
  if (html.length > 500_000) html = html.slice(0, 500_000);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim().slice(0, 300) ||
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i.exec(html)?.[1]?.trim().slice(0, 300) || "";
  const description = /<meta[^>]+name="description"[^>]+content="([^"]+)"/i.exec(html)?.[1]?.trim().slice(0, 500) ||
    /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i.exec(html)?.[1]?.trim().slice(0, 500) || "";
  let main = extractMainHtml(html);
  main = main
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(main).replace(/\s+/g, " ").trim();
  if (isBlockedContent(`${title} ${description} ${text}`)) return null;
  const combined = [title && `# ${title}`, description, text].filter(Boolean).join("\n\n");
  if (combined.trim().length < 100) return null;
  return [
    "PÁGINA WEB (extração direta)",
    title && `Título: ${title}`,
    `URL: ${url.href}`,
    `Conteúdo: ${combined.slice(0, MAX_CONTENT_LENGTH)}`,
  ].filter(Boolean).join("\n");
}

// --- Nivel 2 (gratis): Jina Reader ---
async function extractWithJina(url: URL): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://r.jina.ai/${url.href}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const content = (await response.text()).trim();
  if (isBlockedContent(content) || content.length < 100) return null;
  return content.slice(0, MAX_CONTENT_LENGTH);
}

// --- Nivel 3 (pago, 1 credito): ScrapeGraphAI scrape markdown reader ---
async function extractWithScrapeGraph(url: URL): Promise<string | null> {
  if (!config.scrapegraphEnabled || !config.scrapegraphApiKey) return null;
  let response: Response;
  try {
    response = await fetch(SCRAPEGRAPH_URL, {
      method: "POST",
      headers: {
        "SGAI-APIKEY": config.scrapegraphApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: url.href,
        formats: [{ type: "markdown", mode: "reader" }],
      }),
      signal: AbortSignal.timeout(config.scrapegraphTimeoutMs),
    });
  } catch {
    throw new HttpError(422, "O extrator reserva não respondeu dentro do prazo.");
  }
  if (response.status === 402 || response.status === 429) {
    throw new HttpError(502, "A cota do extrator reserva foi esgotada. Tente novamente mais tarde.");
  }
  if (!response.ok) return null;
  const payload = await response.json() as Record<string, unknown>;
  const results = (payload.results || (payload.data as Record<string, unknown> | undefined)?.results) as Record<string, unknown> | undefined;
  const markdown = results?.markdown as Record<string, unknown> | undefined;
  const data = markdown?.data;
  const first = Array.isArray(data) ? data[0] : null;
  const content = typeof first === "string" ? first.trim() : typeof markdown?.data === "string" ? (markdown.data as string).trim() : "";
  if (!content || isBlockedContent(content) || content.length < 100) return null;
  return content.slice(0, MAX_CONTENT_LENGTH);
}

export async function readUrl(value: unknown): Promise<{ url: string; content: string }> {
  const url = await validatePublicUrl(value);
  const normalized = normalizeUrlForCache(url.href);
  const cached = getCached(normalized);
  if (cached) return cached;

  const videoId = youtubeVideoId(url);
  if (videoId) {
    const content = await readYouTube(url, videoId);
    const result = { url: url.href, content };
    setCached(normalized, result);
    return result;
  }

  const direct = await extractDirect(url);
  if (direct) {
    const result = { url: url.href, content: direct };
    setCached(normalized, result);
    return result;
  }

  const jina = await extractWithJina(url);
  if (jina) {
    const result = { url: url.href, content: jina };
    setCached(normalized, result);
    return result;
  }

  const scrapegraph = await extractWithScrapeGraph(url);
  if (scrapegraph) {
    const result = { url: url.href, content: scrapegraph };
    setCached(normalized, result);
    return result;
  }

  throw new HttpError(422, "O conteúdo da URL não pôde ser extraído com fidelidade.");
}
