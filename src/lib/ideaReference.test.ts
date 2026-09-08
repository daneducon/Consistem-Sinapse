import { describe, expect, it } from "vitest";
import { formatIdeaReference } from "./ideaReference";

describe("formatIdeaReference", () => {
  it("mantém IDs sequenciais legíveis", () => {
    expect(formatIdeaReference(17)).toBe("#17");
  });

  it("produz uma referência curta e estável", () => {
    const reference = formatIdeaReference(1788881414467211);
    expect(reference).toMatch(/^SNP-[0-9A-Z]{6}$/);
    expect(formatIdeaReference(1788881414467211)).toBe(reference);
  });

  it("não expõe o identificador técnico completo", () => {
    expect(formatIdeaReference(1788881414467211)).not.toContain("1788881414467211");
  });
});
