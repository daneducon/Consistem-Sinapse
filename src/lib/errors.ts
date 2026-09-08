export class SessionExpiredError extends Error {
  constructor(message = "Sua sessão Google expirou. Reconecte para continuar sem perder o rascunho.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}
