import { Idea } from "../types";

export interface SemanticSearchResult {
  idea: Idea;
  score: number; // 0 to 1
  matchedConcepts: string[];
}

// Built-in conceptual ontology dictionary for deep semantic matching
// Connects abstract intent queries to related terms even without exact keyword matches
const CONCEPT_ONTOLOGY: Record<string, string[]> = {
  vendas: [
    "lead",
    "icp",
    "prospecção",
    "pipeline",
    "conversão",
    "fechamento",
    "b2b",
    "comercial",
    "cliente",
    "negociação",
    "receita",
    "vendedor",
    "churn",
    "funil",
    "outbound",
    "inbound",
  ],
  comercial: [
    "vendas",
    "lead",
    "icp",
    "prospecção",
    "pipeline",
    "negociação",
    "fechamento",
    "crm",
    "mercado",
  ],
  estratégia: [
    "decisão",
    "planejamento",
    "visão",
    "metas",
    "prioridade",
    "mercado",
    "posicionamento",
    "diferencial",
    "objetivos",
    "alinhamento",
    "futuro",
    "direcionamento",
  ],
  automação: [
    "processos",
    "integração",
    "robô",
    "bot",
    "eficiência",
    "sinapse",
    "ia",
    "inteligência",
    "otimização",
    "workflow",
    "fluxo",
    "chão de fábrica",
    "esteira",
  ],
  indústria: [
    "chão de fábrica",
    "produção",
    "manufatura",
    "pcp",
    "estoque",
    "máquinas",
    "operacional",
    "gargalo",
    "fábrica",
    "consistem",
    "erp",
    "manutenção",
  ],
  tecnologia: [
    "software",
    "ia",
    "sinapse",
    "dados",
    "algoritmo",
    "cloud",
    "nuvem",
    "api",
    "integração",
    "sheets",
    "código",
    "desenvolvimento",
    "segurança",
  ],
  dados: [
    "sheets",
    "planilha",
    "google drive",
    "persistência",
    "sincronização",
    "relatório",
    "métricas",
    "kpi",
    "analytics",
    "banco de dados",
  ],
  gestão: [
    "liderança",
    "equipe",
    "cultura",
    "pessoas",
    "processos",
    "governança",
    "feedbacks",
    "produtividade",
    "rotina",
    "organização",
  ],
  clientes: [
    "suporte",
    "atendimento",
    "experiência",
    "cs",
    "satisfação",
    "nps",
    "retenção",
    "jornada",
    "lead",
  ],
};

const STOP_WORDS = new Set([
  "de", "a", "o", "que", "e", "do", "da", "em", "um", "para", "com", "nao",
  "uma", "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas",
  "ao", "ele", "das", "aqui", "nos",
]);

// Clean and normalize text for semantic comparison
function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tokenize into words removing short stop-words
function tokenizeNormalized(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function tokenize(text: string): string[] {
  return tokenizeNormalized(normalizeText(text));
}

const NORMALIZED_ONTOLOGY = Object.entries(CONCEPT_ONTOLOGY).map(([key, words]) => ({
  key: normalizeText(key),
  keyTokens: tokenize(key),
  words: words.map(normalizeText),
  wordTokens: words.map(tokenize),
}));

function tokenGroupsOverlap(left: string[], right: string[]): boolean {
  return left.length > 0 && right.length > 0 && left.every((token) => right.includes(token));
}

/**
 * Performs conceptual vector-like semantic matching against a list of ideas.
 * Evaluates semantic distance, conceptual overlaps, keyword match, and theme relevance.
 */
export function performSemanticSearch(
  query: string,
  ideas: Idea[]
): SemanticSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const normQuery = normalizeText(trimmedQuery);
  const queryTokens = tokenizeNormalized(normQuery);
  if (queryTokens.length === 0) return [];

  const queryTokenSet = new Set(queryTokens);

  // Expand query tokens with semantic ontology concepts
  const expandedConcepts = new Set<string>(queryTokens);
  queryTokens.forEach((token) => {
    // Check direct ontology matches
    NORMALIZED_ONTOLOGY.forEach(({ key, keyTokens, words, wordTokens }) => {
      const keyMatches = keyTokens.includes(token);
      const relatedMatches = wordTokens.some((tokens) => tokens.includes(token));
      if (keyMatches || relatedMatches) {
        expandedConcepts.add(key);
        words.forEach((word) => expandedConcepts.add(word));
      }
    });
  });

  const queryConceptList = Array.from(expandedConcepts);
  const queryConcepts = queryConceptList.map((value) => ({ value, tokens: tokenize(value) }));

  const results: SemanticSearchResult[] = [];

  ideas.forEach((idea) => {
    const fullContent = `${idea.textoBruto} ${idea.temaMacro || ""} ${idea.palavrasChave || ""} ${idea.provocacoesFollowUp || ""}`;
    const normalizedContent = normalizeText(fullContent);
    const contentTokens = tokenizeNormalized(normalizedContent);
    const contentTokenSet = new Set(contentTokens);

    let matchScore = 0;
    const matchedConceptsList: string[] = [];

    // 1. Exact Phrase match in full text (very high weight)
    if (normQuery && ` ${normalizedContent} `.includes(` ${normQuery} `)) {
      matchScore += 0.55;
      matchedConceptsList.push("Correspondência Direta");
    }

    // 2. Direct Token matches in text or theme
    let directTokenHits = 0;
    queryTokens.forEach((qt) => {
      if (contentTokenSet.has(qt)) {
        directTokenHits++;
        matchedConceptsList.push(qt);
      }
    });

    if (queryTokens.length > 0) {
      matchScore += (directTokenHits / queryTokens.length) * 0.35;
    }

    // 3. Theme Macro Match (High conceptual weight)
    const normalizedTheme = normalizeText(idea.temaMacro || "");
    const themeTokens = tokenizeNormalized(normalizedTheme);
    if (themeTokens.length > 0 && queryTokens.some((qt) => themeTokens.includes(qt))) {
      matchScore += 0.25;
      if (!matchedConceptsList.includes(`Tema: ${idea.temaMacro}`)) {
        matchedConceptsList.push(`Tema: ${idea.temaMacro}`);
      }
    }

    // 4. Semantic Ontology / Conceptual Vector Match
    let semanticConceptHits = 0;
    queryConcepts.forEach(({ value: concept, tokens: conceptTokens }) => {
      if (!queryTokenSet.has(concept) && tokenGroupsOverlap(conceptTokens, contentTokens)) {
        semanticConceptHits++;
        if (matchedConceptsList.length < 5 && !matchedConceptsList.includes(concept)) {
          matchedConceptsList.push(`Conceito: ${concept}`);
        }
      }
    });

    if (semanticConceptHits > 0) {
      matchScore += Math.min(0.4, semanticConceptHits * 0.12);
    }

    // 5. Keyword list overlap
    if (idea.palavrasChave) {
      const keywords = idea.palavrasChave.split(",").map(normalizeText).filter(Boolean);
      let keywordScore = 0;
      keywords.forEach((kw) => {
        const keywordTokens = tokenizeNormalized(kw);
        if (queryConcepts.some(({ tokens: conceptTokens }) => {
          return tokenGroupsOverlap(conceptTokens, keywordTokens) || tokenGroupsOverlap(keywordTokens, conceptTokens);
        })) {
          keywordScore += 0.15;
          if (matchedConceptsList.length < 5 && !matchedConceptsList.includes(kw)) {
            matchedConceptsList.push(kw);
          }
        }
      });
      matchScore += Math.min(0.3, keywordScore);
    }

    // Normalize final score to max 1.0
    const finalScore = Math.min(1.0, Math.round(matchScore * 100) / 100);

    // Filter minimum threshold for semantic relevance
    if (finalScore >= 0.18) {
      results.push({
        idea,
        score: finalScore,
        matchedConcepts: Array.from(new Set(matchedConceptsList)),
      });
    }
  });

  // Sort descending by score
  return results.sort((a, b) => b.score - a.score);
}
