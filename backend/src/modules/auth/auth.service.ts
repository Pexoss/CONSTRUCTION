import { Company } from '../companies/company.model';
import { User } from '../users/user.model';
import { comparePassword } from '../../shared/utils/password.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.util';
import { UserRole } from '../../shared/constants/roles';
import mongoose from 'mongoose';

export interface RegisterCompanyData {
  companyName: string;
  cnpj: string;
  email: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  userName: string;
  userEmail: string;
  password: string;
}

export interface RegisterUserData {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginData {
  email: string;
  password: string;
  companyId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  /**
   * Register a new company and create the first superadmin user
   */
  async registerCompany(data: RegisterCompanyData): Promise<{ company: any; user: any; tokens: AuthTokens }> {
    // Check if company already exists (before transaction to avoid unnecessary session)
    const existingCompany = await Company.findOne({
      $or: [{ cnpj: data.cnpj.replace(/\D/g, '') }, { email: data.email }],
    });

    if (existingCompany) {
      throw new Error('Company with this CNPJ or email already exists');
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: data.userEmail,
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Try to use transaction if replica set is available, otherwise use regular operations
    try {
      const session = await mongoose.startSession();
      
      try {
        session.startTransaction();

        // Create company with session
        const company = await Company.create(
          [
            {
              name: data.companyName,
              cnpj: data.cnpj.replace(/\D/g, ''),
              email: data.email,
              phone: data.phone,
              address: data.address,
              subscription: {
                plan: 'basic',
                status: 'active',
              },
            },
          ],
          { session }
        );

        // Create first user (superadmin) with session
        const user = await User.create(
          [
            {
              companyId: company[0]._id,
              name: data.userName,
              email: data.userEmail,
              password: data.password,
              role: UserRole.SUPERADMIN,
              isActive: true,
            },
          ],
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        // Generate tokens
        const tokens = {
          accessToken: generateAccessToken(user[0]._id.toString(), company[0]._id.toString(), user[0].role),
          refreshToken: generateRefreshToken(user[0]._id.toString(), company[0]._id.toString()),
        };

        return {
          company: {
            _id: company[0]._id,
            name: company[0].name,
            email: company[0].email,
            cnpj: company[0].cnpj,
          },
          user: {
            _id: user[0]._id,
            name: user[0].name,
            email: user[0].email,
            role: user[0].role,
            companyId: user[0].companyId,
          },
          tokens,
        };
      } catch (transactionError: any) {
        await session.abortTransaction().catch(() => {}); // Ignore abort errors
        session.endSession();
        throw transactionError;
      }
    } catch (transactionError: any) {
      // If transaction fails (e.g., no replica set), fall back to regular operations
      if (transactionError.message?.includes('replica set') || transactionError.message?.includes('mongos')) {
        // Fallback: create without transaction (for development)
        const company = await Company.create({
          name: data.companyName,
          cnpj: data.cnpj.replace(/\D/g, ''),
          email: data.email,
          phone: data.phone,
          address: data.address,
          subscription: {
            plan: 'basic',
            status: 'active',
          },
        });

        const user = await User.create({
          companyId: company._id,
          name: data.userName,
          email: data.userEmail,
          password: data.password,
          role: UserRole.SUPERADMIN,
          isActive: true,
        });

        // Generate tokens
        const tokens = {
          accessToken: generateAccessToken(user._id.toString(), company._id.toString(), user.role),
          refreshToken: generateRefreshToken(user._id.toString(), company._id.toString()),
        };

        return {
          company: {
            _id: company._id,
            name: company.name,
            email: company.email,
            cnpj: company.cnpj,
          },
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
          },
          tokens,
        };
      }
      throw transactionError;
    }
  }

  /**
   * Register a new user within an existing company
   */
  async registerUser(companyId: string, data: RegisterUserData): Promise<any> {
    // Check if user already exists in this company
    const existingUser = await User.findOne({
      companyId,
      email: data.email,
    });

    if (existingUser) {
      throw new Error('User with this email already exists in this company');
    }

    // Create user
    const user = await User.create({
      companyId,
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role || UserRole.VIEWER,
      isActive: true,
    });

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };
  }

  /**
   * Login user and return tokens
   */
  async login(data: LoginData): Promise<{ user: any; tokens: AuthTokens }> {
    // Validate company
    const company = await this.validateCompany(data.companyId);
    if (!company) {
      throw new Error('Company not found or inactive');
    }

    // Find user
    const user = await User.findOne({
      email: data.email,
      companyId: data.companyId,
    }).select('+password'); // Include password for comparison

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('User account is inactive');
    }

    // Verify password
    const isPasswordValid = await comparePassword(data.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await user.updateLastLogin();

    // Generate tokens
    const tokens = {
      accessToken: generateAccessToken(user._id.toString(), user.companyId.toString(), user.role),
      refreshToken: generateRefreshToken(user._id.toString(), user.companyId.toString()),
    };

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = verifyRefreshToken(refreshToken);

    // Verify user still exists and is active
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    // Verify company is still active
    const company = await this.validateCompany(payload.companyId);
    if (!company) {
      throw new Error('Company not found or inactive');
    }

    // Generate new access token
    return {
      accessToken: generateAccessToken(user._id.toString(), user.companyId.toString(), user.role),
    };
  }

  /**
   * Validate company exists and is active
   */
  async validateCompany(companyId: string): Promise<any> {
    const company = await Company.findById(companyId);
    
    if (!company) {
      return null;
    }

    if (company.subscription.status !== 'active') {
      return null;
    }

    return company;
  }
}

export const authService = new AuthService();
