import { describe, expect, it } from "vitest";
import type { Idea } from "../types";
import { performSemanticSearch } from "./semanticSearch";

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    idNota: 1,
    rowNumber: 2,
    dataCriacao: "01/01/2026 10:00:00",
    textoBruto: "Automação do processo comercial e integração com CRM",
    temaMacro: "AUTOMAÇÃO",
    palavrasChave: "workflow, crm, integração",
    conexoesId: "[]",
    provocacoesFollowUp: "Como reduzir o trabalho manual?",
    ...overrides,
  };
}

describe("performSemanticSearch", () => {
  it("encontra conceitos relacionados por tokens", () => {
    const results = performSemanticSearch("processo de vendas", [idea()]);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("não pontua tema e palavras-chave vazios", () => {
    const results = performSemanticSearch("financeiro", [
      idea({ textoBruto: "nota sem relação", temaMacro: "", palavrasChave: ",," }),
    ]);
    expect(results).toEqual([]);
  });

  it("não trata fragmentos curtos como substring universal", () => {
    const results = performSemanticSearch("ia", [
      idea({ textoBruto: "viagem para a praia", temaMacro: "LAZER", palavrasChave: "praia" }),
    ]);
    expect(results).toEqual([]);
  });
});
