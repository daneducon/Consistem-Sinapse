/**
 * Utility functions for Google Sheets & Drive API integration with resilience & retry support.
 */
import { IdeaSaveError, type IdeaRow, type Idea } from "../types";
import { SessionExpiredError } from "./errors";

export interface SpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
}

/**
 * Local cache helpers to ensure resilience against momentary 503/network unavailability
 */
function getCacheKey(namespace: string, spreadsheetId: string, sheetName: string = "Base"): string {
  return `sinapse_ideas_cache_${namespace}_${spreadsheetId}_${sheetName}`;
}

function getCachedIdeas(namespace: string, spreadsheetId: string, sheetName: string = "Base"): Idea[] | null {
  try {
    const raw = localStorage.getItem(getCacheKey(namespace, spreadsheetId, sheetName));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setCachedIdeas(namespace: string, spreadsheetId: string, sheetName: string, ideas: Idea[]): void {
  try {
    localStorage.setItem(getCacheKey(namespace, spreadsheetId, sheetName), JSON.stringify(ideas));
  } catch (e) {
    console.warn("Failed to store ideas in localStorage:", e);
  }
}

export function clearUserIdeaCache(namespace: string): void {
  const prefix = `sinapse_ideas_cache_${namespace}_`;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Failed to clear the local idea cache:", error);
  }
}

/**
 * Fetch wrapper with exponential backoff retry for transient Google API errors (503, 500, 502, 504, 429)
 * and network drops.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 500
): Promise<Response> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // 401 Unauthorized: token expired
      if (response.status === 401) {
        throw new SessionExpiredError();
      }

      // Check if transient error suitable for retry
      const isTransient =
        response.status === 503 ||
        response.status === 502 ||
        response.status === 504 ||
        response.status === 500 ||
        response.status === 429;

      if (isTransient && attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        console.warn(
          `[Google API ${response.status}] Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(delay)}ms para reconectar...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err: any) {
      lastError = err;
      // If it's a 401 session expiration, don't retry, fail immediately
      if (err?.message?.includes("expirou")) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        console.warn(
          `[Google API Network Error] Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(delay)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error("The service is currently unavailable.");
}

/**
 * Extract friendly error message from Google API responses
 */
async function extractErrorMessage(response: Response, defaultMessage: string): Promise<string> {
  try {
    const errData = await response.json();
    const raw = errData.error?.message;
    if (raw) {
      if (response.status === 503 || raw.toLowerCase().includes("unavailable")) {
        return "O serviço do Google Sheets está temporariamente indisponível. Tente novamente em instantes.";
      }
      return raw;
    }
  } catch {
    // Ignore JSON parse errors on response
  }

  if (response.status === 503) {
    return "O serviço do Google Sheets está temporariamente indisponível.";
  }
  return defaultMessage;
}

/**
 * Fetch list of spreadsheet files from Google Drive
 */
export async function listSpreadsheets(accessToken: string): Promise<SpreadsheetFile[]> {
  const url = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&orderBy=modifiedTime desc&fields=files(id, name, modifiedTime)&pageSize=25";
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, "Falha ao listar planilhas do Google Drive.");
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Create a new spreadsheet with a "Base" sheet and write the required header row
 */
export async function createIdeaSpreadsheet(accessToken: string, title: string = "Captura de Ideias"): Promise<string> {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  
  // Create spreadsheet with a sheet named "Base"
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
      sheets: [
        {
          properties: {
            title: "Base",
            gridProperties: {
              rowCount: 2000,
              columnCount: 10,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, "Falha ao criar planilha no Google Sheets.");
    throw new Error(errorMsg);
  }

  const spreadsheet = await response.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  // Write header rows to the spreadsheet
  await writeHeaders(accessToken, spreadsheetId, "Base");

  return spreadsheetId;
}

/**
 * Ensure a "Base" sheet exists and has proper headers. If sheet "Base" doesn't exist, we add it.
 */
export async function ensureBaseSheet(accessToken: string, spreadsheetId: string): Promise<string> {
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`;
  const response = await fetchWithRetry(getUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, "Falha ao obter detalhes da planilha.");
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const sheets: any[] = data.sheets || [];
  const hasBaseSheet = sheets.some((s) => s.properties?.title === "Base");

  if (!hasBaseSheet) {
    // Add "Base" sheet
    const addSheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const addResponse = await fetchWithRetry(addSheetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: "Base",
                gridProperties: {
                  rowCount: 2000,
                  columnCount: 10,
                },
              },
            },
          },
        ],
      }),
    });

    if (!addResponse.ok) {
      const errorMsg = await extractErrorMessage(addResponse, "Não foi possível criar a aba Base nesta planilha.");
      throw new Error(errorMsg);
    }
  }

  const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Base")}!A1:G1`;
  const headerResponse = await fetchWithRetry(headerUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!headerResponse.ok) {
    const errorMsg = await extractErrorMessage(headerResponse, "Falha ao validar o cabeçalho da aba Base.");
    throw new Error(errorMsg);
  }

  const expectedHeaders = getHeaders();
  const headerData = await headerResponse.json();
  const existingHeaders: string[] = headerData.values?.[0] || [];
  const isEmpty = existingHeaders.every((value) => !String(value).trim());
  if (existingHeaders.length === 0 || isEmpty) {
    await writeHeaders(accessToken, spreadsheetId, "Base");
  } else if (!expectedHeaders.every((header, index) => existingHeaders[index] === header)) {
    throw new Error(
      "A aba Base já contém um cabeçalho incompatível em A1:G1. Renomeie a aba existente ou ajuste as colunas para: " +
        expectedHeaders.join(", ")
    );
  }
  return "Base";
}

export const MAX_SEQUENTIAL_ID = 999_999_999;

export function isLegacyIdeaId(id: number): boolean {
  return Number.isSafeInteger(id) && id > MAX_SEQUENTIAL_ID;
}

function parseConnectionIds(value: unknown): number[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isSafeInteger);
  } catch {}
  return value
    .replace(/[\[\]]/g, "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isSafeInteger);
}

export async function migrateLegacyIdeaIds(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const range = `${sheetName}!A2:F`;
  const response = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Não foi possível ler os IDs para a migração."));
  }

  const payload = await response.json() as { values?: unknown[][] };
  const rows = payload.values || [];
  const usedIds = new Set(
    rows.map((row) => Number(row[0])).filter((id) => Number.isSafeInteger(id) && id > 0 && id <= MAX_SEQUENTIAL_ID)
  );
  const replacements = new Map<number, number>();
  let nextFallback = [...usedIds].reduce((max, id) => Math.max(max, id), 0) + 1;

  rows.forEach((row, index) => {
    const currentId = Number(row[0]);
    if (!isLegacyIdeaId(currentId) || replacements.has(currentId)) return;
    const preferredId = index + 1;
    let replacement = preferredId > 0 && !usedIds.has(preferredId) ? preferredId : nextFallback;
    while (usedIds.has(replacement)) replacement += 1;
    if (replacement > MAX_SEQUENTIAL_ID) throw new Error("Não há IDs sequenciais disponíveis para concluir a migração.");
    replacements.set(currentId, replacement);
    usedIds.add(replacement);
    nextFallback = Math.max(nextFallback, replacement + 1);
  });

  if (replacements.size === 0) return 0;
  const escapedSheetName = `'${sheetName.replace(/'/g, "''")}'`;
  const updates: Array<{ range: string; values: unknown[][] }> = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const currentId = Number(row[0]);
    const replacementId = replacements.get(currentId);
    if (replacementId) {
      updates.push({ range: `${escapedSheetName}!A${rowNumber}`, values: [[replacementId]] });
    }
    const currentConnections = parseConnectionIds(row[5]);
    const migratedConnections = currentConnections.map((id) => replacements.get(id) ?? id);
    if (migratedConnections.some((id, connectionIndex) => id !== currentConnections[connectionIndex])) {
      updates.push({ range: `${escapedSheetName}!F${rowNumber}`, values: [[JSON.stringify(migratedConnections)]] });
    }
  });

  const updateResponse = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
    }
  );
  if (!updateResponse.ok) {
    throw new Error(await extractErrorMessage(updateResponse, "A migração dos IDs não pôde ser concluída."));
  }
  return replacements.size;
}

function getHeaders(): string[] {
  return [
    "ID_Nota",
    "Data_Criacao",
    "Texto_Bruto",
    "Tema_Macro",
    "Palavras_Chave",
    "Conexoes_ID",
    "Provocacoes_FollowUp",
  ];
}

/**
 * Write headers to a specific sheet
 */
async function writeHeaders(accessToken: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:G1?valueInputOption=RAW`;
  const headers = getHeaders();

  const response = await fetchWithRetry(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [headers],
    }),
  });
  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, "Falha ao criar o cabeçalho da aba Base.");
    throw new Error(errorMsg);
  }
}

/**
 * Append a new Idea Row with full AI analysis metadata to the spreadsheet
 */
export interface AppendIdeaResult {
  idNota: number;
  rowNumber: number;
}

function safeUserEnteredText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function appendIdeaRow(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  idea: Omit<IdeaRow, "idNota">
): Promise<AppendIdeaResult> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:G:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  
  const values = [
    [
      "=ROW()-1",
      safeUserEnteredText(idea.dataCriacao),
      safeUserEnteredText(idea.textoBruto),
      safeUserEnteredText(idea.temaMacro || ""),
      safeUserEnteredText(idea.palavrasChave || ""),
      safeUserEnteredText(idea.conexoesId || "[]"),
      safeUserEnteredText(idea.provocacoesFollowUp || ""),
    ],
  ];

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values,
    }),
  });

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, "Falha ao salvar linha no Google Sheets.");
    throw new Error(errorMsg);
  }
  const result = await response.json() as { updates?: { updatedRange?: string } };
  const updatedRange = result.updates?.updatedRange || "";
  const rowMatch = updatedRange.match(/![A-Z]+(\d+):[A-Z]+\d+$/i);
  const rowNumber = Number(rowMatch?.[1]);
  const idNota = rowNumber - 1;
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || idNota > MAX_SEQUENTIAL_ID) {
    throw new IdeaSaveError(
      "A nota foi criada, mas o Sheets não informou sua linha. Não salve novamente; recarregue a base.",
      true
    );
  }

  try {
    const escapedSheetName = `'${sheetName.replace(/'/g, "''")}'`;
    const finalizeResponse = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${escapedSheetName}!A${rowNumber}`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[idNota]] }),
      }
    );
    if (!finalizeResponse.ok) {
      throw new Error(await extractErrorMessage(finalizeResponse, "Não foi possível fixar o ID reservado."));
    }
  } catch (error) {
    throw new IdeaSaveError(
      "A nota foi criada, mas o ID não pôde ser confirmado. Não salve novamente; reconecte e recarregue a base.",
      true,
      error instanceof SessionExpiredError
    );
  }
  return { idNota, rowNumber };
}

/**
 * Update connections (Column F - Conexoes_ID) for multiple existing rows in batch
 */
export async function updateBatchIdeaConnections(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  updates: Array<{ rowNumber: number; conexoesId: string }>
): Promise<void> {
  if (!updates || updates.length === 0) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const escapedSheetName = `'${sheetName.replace(/'/g, "''")}'`;

  const data = updates.map((u) => ({
    range: `${escapedSheetName}!F${u.rowNumber}`,
    values: [[u.conexoesId]],
  }));

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data,
    }),
  });

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, "A nota foi salva, mas as conexões anteriores não puderam ser atualizadas.");
    throw new Error(errorMsg);
  }
}

export interface FetchIdeasResult {
  ideas: Idea[];
  stale: boolean;
  error?: string;
}

/**
 * Fetch all ideas (columns A:G) from the spreadsheet with automatic retry & cache fallback
 */
export async function fetchIdeas(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  cacheNamespace: string
): Promise<FetchIdeasResult> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:G`;
  
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorMsg = await extractErrorMessage(response, "Falha ao carregar dados do Google Sheets.");
      
      // If service is unavailable or returned an error, fallback to cache if available
      const cached = getCachedIdeas(cacheNamespace, spreadsheetId, sheetName);
      if (cached) {
        console.warn(`[Google Sheets API unavailable: ${errorMsg}] Carregadas ${cached.length} notas do cache local.`);
        return { ideas: cached, stale: true, error: errorMsg };
      }

      throw new Error(errorMsg);
    }

    const data = await response.json();
    const rows: string[][] = data.values || [];

    if (rows.length <= 1) {
      setCachedIdeas(cacheNamespace, spreadsheetId, sheetName, []);
      return { ideas: [], stale: false };
    }

    const ideas: Idea[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const idNota = parseInt(row[0] || "0", 10);
      if (isNaN(idNota) || idNota === 0) continue;

      ideas.push({
        idNota,
        rowNumber: i + 1,
        dataCriacao: row[1] || "",
        textoBruto: row[2] || "",
        temaMacro: row[3] || "",
        palavrasChave: row[4] || "",
        conexoesId: row[5] || "",
        provocacoesFollowUp: row[6] || "",
      });
    }

    // Update local cache on successful fetch
    setCachedIdeas(cacheNamespace, spreadsheetId, sheetName, ideas);
    return { ideas, stale: false };
  } catch (error: any) {
    if (error instanceof SessionExpiredError) throw error;
    // Check if we can recover from cached ideas
    const cached = getCachedIdeas(cacheNamespace, spreadsheetId, sheetName);
    if (cached) {
      console.warn(`[Google Sheets error: ${error.message}] Recuperadas ${cached.length} notas do cache local.`);
      return { ideas: cached, stale: true, error: error.message };
    }
    throw error;
  }
}
