import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', authController.registerCompany.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refreshToken.bind(authController));

// Protected routes
router.post('/register/user', authMiddleware, authController.registerUser.bind(authController));
router.get('/me', authMiddleware, authController.getMe.bind(authController));

export default router;
