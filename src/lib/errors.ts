export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Message français sûr à afficher, sans fuite de détail technique. */
export function userMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error) {
    if (/duplicate key/i.test(error.message) && /sessions_one_active_per_device/.test(error.message)) {
      return "Cet appareil a déjà une session active.";
    }
    if (/duplicate key/i.test(error.message) && /shifts_one_open_per_user/.test(error.message)) {
      return "Vous avez déjà une caisse ouverte.";
    }
    if (/duplicate key/i.test(error.message)) {
      return "Cette opération existe déjà.";
    }
  }
  return "Une erreur inattendue est survenue. Veuillez réessayer.";
}
