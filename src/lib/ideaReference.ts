export function formatIdeaReference(id: number | string): string {
  const numericId = typeof id === "number" ? id : Number(id);
  if (!Number.isFinite(numericId)) return "SNP-------";
  if (Number.isSafeInteger(numericId) && numericId > 0 && numericId <= 999_999_999) {
    return `#${numericId}`;
  }
  return `SNP-${Math.trunc(numericId).toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}
