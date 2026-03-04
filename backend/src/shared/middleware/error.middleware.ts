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

  //Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Verifique se todos os campos obrigatórios estão preenchidos corretamente.",
      errors: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  //mongoose validation errors
  if (err instanceof mongoose.Error.ValidationError) {
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

  //Mongoose duplicate key error
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyPattern)[0];

    return res.status(400).json({
      success: false,
      message: `${field} já está em uso.`,
    });
  }

  // 🔹 JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token inválido ou expirado.",
    });
  }

  //Default error
  const statusCode = err.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Erro interno do servidor.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
