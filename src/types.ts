export interface Idea {
  idNota: number;
  rowNumber: number;
  dataCriacao: string;
  textoBruto: string;
  temaMacro: string;
  palavrasChave: string;
  conexoesId: string;
  provocacoesFollowUp: string;
}

export type TabType = "capture" | "graph";
export type IdeaSaveStage = "reading" | "analyzing" | "saving" | "connecting" | "syncing";

export interface SpreadsheetConfig {
  id: string;
  name: string;
  sheetName: string;
}

export interface IdeaRow {
  idNota: number;
  dataCriacao: string;
  textoBruto: string;
  temaMacro?: string;
  palavrasChave?: string;
  conexoesId?: string;
  provocacoesFollowUp?: string;
}

export class IdeaSaveError extends Error {
  constructor(
    message: string,
    public readonly persisted = false,
    public readonly sessionExpired = false
  ) {
    super(message);
    this.name = "IdeaSaveError";
  }
}
