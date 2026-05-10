import { AppError } from "../middleware/error.middleware";

/** Requisição inválida / regra de negócio (ex.: estoque, unidade indisponível). */
export function badRequest(message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = 400;
  return err;
}

/** Recurso não existe para o contexto da requisição. */
export function notFound(message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = 404;
  return err;
}

export function forbidden(message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = 403;
  return err;
}

export function conflict(message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = 409;
  return err;
}
