import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { registerCompanySchema, registerUserSchema, loginSchema, refreshTokenSchema } from './auth.validator';
import { Company } from '../companies/company.model';

export class AuthController {
  /**
   * POST /api/auth/register
   * Register a new company and first superadmin user
   */
  async registerCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = registerCompanySchema.parse(req.body);
      const result = await authService.registerCompany(validatedData);

      res.status(201).json({
        success: true,
        message: 'Company and user registered successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/register/user
   * Register a new user within an existing company (requires auth)
   */
  async registerUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const validatedData = registerUserSchema.parse(req.body);
      const user = await authService.registerUser(companyId, validatedData);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Login and get access + refresh tokens
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await authService.login(validatedData);

      res.json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      const result = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      // Busca a empresa do usuário
      const company = await Company.findById(user.companyId);

      if (!company) {
        res.status(404).json({
          success: false,
          message: 'Company not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          companyCode: company.code,
          isActive: user.isActive,
          lastLogin: user.lastLogin,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
