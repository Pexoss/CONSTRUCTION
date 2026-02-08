import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { RoleType } from '../constants/roles';

export interface TokenPayload {
  userId: string;
  companyCode: string;
  role?: RoleType;
}

/**
 * Generates an access token (short-lived)
 */
export const generateAccessToken = (
  userId: string,
  companyCode: string,
  role: RoleType
): string => {
  return jwt.sign(
    { userId, companyCode, role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as SignOptions
  );
};

/**
 * Generates a refresh token (long-lived)
 */
export const generateRefreshToken = (userId: string, companyCode: string): string => {
  return jwt.sign(
    { userId, companyCode, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions
  );
};


/**
 * Verifies an access token
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verifies a refresh token
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload & { type?: string };
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return payload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};
