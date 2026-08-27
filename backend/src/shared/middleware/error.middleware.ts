import { Request, Response, NextFunction } from "express";
import { ZodError, ZodIssue } from "zod";
import mongoose from "mongoose";
import { duplicateKeyErrorMessage } from "../utils/duplicate-key-message.util";

const ZOD_FIELD_LABELS: Record<string, string> = {
  customerId: "cliente",
  fulfillmentMethod: "entrega ou retirada",
  items: "itens do aluguel",
  "items.itemId": "item",
  "items.unitId": "unidade do item",
  "items.quantity": "quantidade do item",
  "items.pickupScheduled": "data de retirada do item",
  "items.returnScheduled": "data de devolução do item",
  workAddress: "endereço da obra",
  "workAddress.street": "rua da obra",
  "workAddress.number": "número da obra",
  "workAddress.neighborhood": "bairro da obra",
  "workAddress.city": "cidade da obra",
  "workAddress.state": "estado da obra",
  "workAddress.zipCode": "CEP da obra",
  "workAddress.workName": "nome da obra",
  pickedUpBy: "quem retirou/entregou",
  notes: "observações",
  "services.description": "descrição do serviço",
  "services.price": "valor do serviço",
};

const zodIssueFieldLabel = (issue: ZodIssue): string => {
  if (
    issue.message &&
    !/^Required$/i.test(issue.message) &&
    !/^Expected /i.test(issue.message) &&
    !/^Invalid /i.test(issue.message)
  ) {
    return issue.message.replace(/\s+é obrigatório\.?$/i, "").trim() || issue.message;
  }
  const dotted = issue.path.filter((p) => typeof p !== "number").join(".");
  if (ZOD_FIELD_LABELS[dotted]) return ZOD_FIELD_LABELS[dotted];
  const last = String(issue.path[issue.path.length - 1] ?? "");
  return ZOD_FIELD_LABELS[last] || last || "campo obrigatório";
};

/** Use `statusCode` (4xx/5xx) nos serviços via `badRequest` / `notFound` em `http-error.util.ts`. */
export interface AppError extends Error {
  statusCode?: number;
  code?: number;
}

export const errorMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode =
    typeof err.statusCode === "number" && err.statusCode >= 400
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error("========== ERROR START ==========");
    console.error("Route:", req.method, req.originalUrl);
    console.error("Body:", req.body);
    console.error("Params:", req.params);
    console.error("Query:", req.query);
    console.error("Error Name:", err.name);
    console.error("Error Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("=================================");
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const fields = [...new Set(err.errors.map((e) => zodIssueFieldLabel(e)))];
    const message =
      fields.length === 1
        ? `Preencha o campo obrigatório: ${fields[0]}.`
        : `Preencha os campos obrigatórios: ${fields.join(", ")}.`;

    return res.status(400).json({
      success: false,
      message,
      errors: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // mongoose validation errors
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));
    const fields = [
      ...new Set(
        errors.map((e) => {
          const dotted = e.path.replace(/^\w+\./, "");
          return (
            ZOD_FIELD_LABELS[e.path] ||
            ZOD_FIELD_LABELS[dotted] ||
            e.path.replace(/^workAddress\./, "") ||
            "campo obrigatório"
          );
        }),
      ),
    ];

    return res.status(400).json({
      success: false,
      message:
        fields.length === 1
          ? `Preencha o campo obrigatório: ${fields[0]}.`
          : `Preencha os campos obrigatórios: ${fields.join(", ")}.`,
      errors,
    });
  }

  // Mongoose duplicate key error
  if ((err as any).code === 11000) {
    return res.status(400).json({
      success: false,
      message: duplicateKeyErrorMessage(err as any),
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {

    return res.status(401).json({
      success: false,
      message: "Token inválido ou expirado.",
    });
  }

  // Default error
  if (statusCode >= 500) {
    console.error("UNHANDLED ERROR:");
    console.error(err);
  }

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Erro interno do servidor.",
    ...(process.env.NODE_ENV === "development" && statusCode >= 500 && { stack: err.stack }),
  });
};