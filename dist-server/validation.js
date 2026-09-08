export function requiredString(value, name, maxLength) {
    if (typeof value !== "string")
        throw new HttpError(400, `${name} deve ser um texto.`);
    const text = value.trim();
    if (!text || text.length > maxLength) {
        throw new HttpError(400, `${name} deve ter entre 1 e ${maxLength} caracteres.`);
    }
    return text;
}
export function optionalString(value, name, maxLength) {
    if (value === undefined || value === null || value === "")
        return "";
    return requiredString(value, name, maxLength);
}
export function existingIdeas(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > 500) {
        throw new HttpError(400, "existingIdeas deve ser uma lista com no máximo 500 itens.");
    }
    return value.map((idea, index) => {
        if (!idea || typeof idea !== "object")
            throw new HttpError(400, `existingIdeas[${index}] é inválido.`);
        const item = idea;
        if (!Number.isInteger(item.idNota) || item.idNota < 0) {
            throw new HttpError(400, `existingIdeas[${index}].idNota é inválido.`);
        }
        return {
            idNota: item.idNota,
            temaMacro: optionalString(item.temaMacro, `existingIdeas[${index}].temaMacro`, 120),
            textoBruto: optionalString(item.textoBruto, `existingIdeas[${index}].textoBruto`, 2_000),
        };
    });
}
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
