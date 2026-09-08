import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError, requiredString } from "./validation.js";
const MAX_CONTENT_LENGTH = 20_000;
const FETCH_TIMEOUT_MS = 10_000;
function isPrivateIp(address) {
    const normalized = address.toLowerCase().replace(/^::ffff:/, "");
    if (isIP(normalized) === 4) {
        const [a, b] = normalized.split(".").map(Number);
        return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
    }
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
        normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
}
export async function validatePublicUrl(value) {
    const raw = requiredString(value, "url", 2_048);
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new HttpError(400, "URL inválida.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new HttpError(400, "A URL deve usar HTTP/HTTPS e não pode conter credenciais.");
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIp(hostname)) {
        throw new HttpError(400, "Endereço local ou privado não permitido.");
    }
    let addresses;
    try {
        addresses = await lookup(hostname, { all: true, verbatim: true });
    }
    catch {
        throw new HttpError(422, "Não foi possível resolver o domínio informado.");
    }
    if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
        throw new HttpError(400, "O domínio resolve para um endereço local ou privado.");
    }
    return url;
}
function youtubeVideoId(url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be")
        return url.pathname.split("/")[1]?.match(/^[\w-]{11}$/)?.[0] || null;
    if (host !== "youtube.com" && !host.endsWith(".youtube.com"))
        return null;
    const candidate = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    return candidate?.match(/^[\w-]{11}$/)?.[0] || null;
}
async function readYouTube(url, videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const [metadataResult, transcriptResult] = await Promise.allSettled([
        fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }),
        fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }),
    ]);
    let title = "";
    let author = "";
    if (metadataResult.status === "fulfilled" && metadataResult.value.ok) {
        const metadata = await metadataResult.value.json();
        title = typeof metadata.title === "string" ? metadata.title.trim().slice(0, 300) : "";
        author = typeof metadata.author_name === "string" ? metadata.author_name.trim().slice(0, 200) : "";
    }
    if (transcriptResult.status !== "fulfilled" || !transcriptResult.value.ok) {
        throw new HttpError(422, "A transcrição do vídeo não está disponível; a análise foi interrompida para não inventar conteúdo.");
    }
    const transcript = (await transcriptResult.value.text())
        .replace(/^#\s*Transcript:[\s\S]*?##\s*Transcript/i, "")
        .replace(/\[\d+:\d+(?::\d+)?\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (transcript.length < 100) {
        throw new HttpError(422, "A transcrição retornada é insuficiente para uma análise fiel.");
    }
    return [
        "VÍDEO DO YOUTUBE (dados extraídos)",
        title && `Título: ${title}`,
        author && `Canal: ${author}`,
        `URL: ${url.href}`,
        `Transcrição: ${transcript.slice(0, MAX_CONTENT_LENGTH)}`,
    ].filter(Boolean).join("\n");
}
export async function readUrl(value) {
    const url = await validatePublicUrl(value);
    const videoId = youtubeVideoId(url);
    if (videoId)
        return { url: url.href, content: await readYouTube(url, videoId) };
    let response;
    try {
        response = await fetch(`https://r.jina.ai/${url.href}`, {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
    }
    catch {
        throw new HttpError(422, "O leitor de URL não respondeu dentro do prazo.");
    }
    if (!response.ok)
        throw new HttpError(422, `O leitor de URL recusou o conteúdo (${response.status}).`);
    const content = (await response.text()).trim();
    const blocked = /Target URL returned error (401|403)|sign in|captcha|just a moment|enable javascript and cookies/i.test(content);
    if (blocked || content.length < 100) {
        throw new HttpError(422, "O conteúdo da URL não pôde ser extraído com fidelidade.");
    }
    return { url: url.href, content: content.slice(0, MAX_CONTENT_LENGTH) };
}
