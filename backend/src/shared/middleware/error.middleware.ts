import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";

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

  // 🔎 LOG GERAL DO ERRO
  console.error("========== ERROR START ==========");
  console.error("Route:", req.method, req.originalUrl);
  console.error("Body:", req.body);
  console.error("Params:", req.params);
  console.error("Query:", req.query);
  console.error("Error Name:", err.name);
  console.error("Error Message:", err.message);
  console.error("Stack:", err.stack);
  console.error("=================================");

  // Zod validation errors
  if (err instanceof ZodError) {

    console.error("ZOD ERROR DETAILS:");
    console.error(err.errors);

    return res.status(400).json({
      success: false,
      message: "Verifique se todos os campos obrigatórios estão preenchidos corretamente.",
      errors: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // mongoose validation errors
  if (err instanceof mongoose.Error.ValidationError) {

    console.error("MONGOOSE VALIDATION ERROR:");
    console.error(err.errors);

    const errors = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Erro de validação no banco de dados.",
      errors,
    });
  }

  // Mongoose duplicate key error
  if ((err as any).code === 11000) {

    console.error("MONGOOSE DUPLICATE KEY ERROR:");
    console.error(err);

    const field = Object.keys((err as any).keyPattern)[0];

    return res.status(400).json({
      success: false,
      message: `${field} já está em uso.`,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {

    console.error("JWT ERROR:");
    console.error(err);

    return res.status(401).json({
      success: false,
      message: "Token inválido ou expirado.",
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;

  console.error("UNHANDLED ERROR:");
  console.error(err);

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Erro interno do servidor.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};