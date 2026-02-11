import { Request, Response, NextFunction } from 'express';
import { isDatabaseConnected } from '../../config/database';

/**
 * Middleware para verificar se o banco de dados está conectado
 * Se não estiver, retorna erro 503 Service Unavailable
 */
export const databaseCheckMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!isDatabaseConnected()) {
    res.status(503).json({
      success: false,
      message: 'Database connection lost. Please try again later.',
      code: 'DATABASE_UNAVAILABLE',
    });
    return;
  }

  next();
};
