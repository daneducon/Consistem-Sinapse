import { describe, expect, it } from "vitest";
import { existingIdeas, HttpError, optionalString, requiredString } from "./validation.js";

describe("server validation", () => {
  it("normaliza textos válidos", () => {
    expect(requiredString("  ideia  ", "texto", 20)).toBe("ideia");
    expect(optionalString(undefined, "nota", 20)).toBe("");
  });

  it("rejeita entrada vazia ou longa", () => {
    expect(() => requiredString(" ", "texto", 20)).toThrow(HttpError);
    expect(() => requiredString("texto longo", "texto", 5)).toThrow(HttpError);
  });

  it("limita e reduz o contexto de ideias", () => {
    const result = existingIdeas([{ idNota: 1, temaMacro: " TEMA ", textoBruto: " Texto " }]);
    expect(result).toEqual([{ idNota: 1, temaMacro: "TEMA", textoBruto: "Texto" }]);
    expect(() => existingIdeas(new Array(501).fill({}))).toThrow(HttpError);
  });
});
