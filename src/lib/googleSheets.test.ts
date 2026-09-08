import { afterEach, describe, expect, it, vi } from "vitest";
import { appendIdeaRow, migrateLegacyIdeaIds } from "./googleSheets";

describe("getNextSequentialId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deriva o ID da linha reservada pelo append", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      updates: { updatedRange: "'Base'!A20:G20" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(appendIdeaRow("token", "sheet", "Base", {
      dataCriacao: "08/09/2026 12:00:00",
      textoBruto: "=conteúdo tratado como texto",
      temaMacro: "TESTE",
      palavrasChave: "um, dois, três",
      conexoesId: "[]",
      provocacoesFollowUp: "Como validar?",
    })).resolves.toEqual({ idNota: 19, rowNumber: 20 });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.values[0][0]).toBe("=ROW()-1");
    expect(body.values[0][2]).toBe("'=conteúdo tratado como texto");
  });

  it("migra IDs legados e referências em lote", async () => {
    const legacyId = 1_788_881_414_467_211;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        values: [["1", "", "", "", "", `[${legacyId}]`], [String(legacyId), "", "", "", "", "[1]"]],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(migrateLegacyIdeaIds("token", "sheet", "Base")).resolves.toBe(1);
    const updateRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const data = JSON.parse(String(updateRequest.body)).data as Array<{ range: string; values: unknown[][] }>;
    expect(data).toContainEqual({ range: "'Base'!A3", values: [[2]] });
    expect(data).toContainEqual({ range: "'Base'!F2", values: [["[2]"]] });
  });
});
