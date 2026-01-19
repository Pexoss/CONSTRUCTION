import { Company } from '../companies/company.model';
import { User } from '../users/user.model';
import { comparePassword } from '../../shared/utils/password.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.util';
import { generateUniqueCompanyCode } from '../../shared/utils/generateCode';
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
  companyCode: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  /**
   * Register a new company and create the first superadmin user
   */
  async registerCompany(data: RegisterCompanyData): Promise<{
    company: { _id: string; name: string; email: string; cnpj: string; code: string };
    user: { _id: string; name: string; email: string; role: UserRole; companyId: string };
    tokens: AuthTokens;
  }> {
    let code: string;
    try {
      code = await generateUniqueCompanyCode(data.companyName);
    } catch (err) {
      throw err;
    }

    const existingCompany = await Company.findOne({
      $or: [{ cnpj: data.cnpj.replace(/\D/g, '') }, { email: data.email }],
    });
    if (existingCompany) {
      throw new Error('Company with this CNPJ or email already exists');
    }

    const existingUser = await User.findOne({ email: data.userEmail });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    try {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const company = await Company.create(
          [
            {
              name: data.companyName,
              cnpj: data.cnpj.replace(/\D/g, ''),
              email: data.email,
              phone: data.phone,
              code,
              address: data.address,
              subscription: { plan: 'basic', status: 'active' },
            },
          ],
          { session }
        );

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

        const tokens: AuthTokens = {
          accessToken: generateAccessToken(user[0]._id.toString(), company[0]._id.toString(), user[0].role),
          refreshToken: generateRefreshToken(user[0]._id.toString(), company[0]._id.toString()),
        };

        return {
          company: {
            _id: company[0]._id.toString(),
            name: company[0].name,
            email: company[0].email,
            cnpj: company[0].cnpj,
            code: company[0].code!,
          },
          user: {
            _id: user[0]._id.toString(),
            name: user[0].name,
            email: user[0].email,
            role: user[0].role,
            companyId: user[0].companyId.toString(),
          },
          tokens,
        };
      } catch (err) {
        await session.abortTransaction().catch(() => { });
        session.endSession();
        throw err;
      }
    } catch (err) {

      const company = await Company.create({
        name: data.companyName,
        cnpj: data.cnpj.replace(/\D/g, ''),
        email: data.email,
        phone: data.phone,
        address: data.address,
        code,
        subscription: { plan: 'basic', status: 'active' },
      });

      const user = await User.create({
        companyId: company._id,
        name: data.userName,
        email: data.userEmail,
        password: data.password,
        role: UserRole.SUPERADMIN,
        isActive: true,
      });

      const tokens: AuthTokens = {
        accessToken: generateAccessToken(user._id.toString(), company._id.toString(), user.role),
        refreshToken: generateRefreshToken(user._id.toString(), company._id.toString()),
      };

      return {
        company: {
          _id: company._id.toString(),
          name: company.name,
          email: company.email,
          cnpj: company.cnpj,
          code: company.code!,
        },
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId.toString(),
        },
        tokens,
      };
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
    const company = await Company.findOne({
      code: data.companyCode.toUpperCase(),
    });

    if (!company || company.subscription.status !== 'active') {
      throw new Error('Empresa não encontrada ou inativa');
    }

    const user = await User.findOne({
      email: data.email,
      companyId: company._id,
    }).select('+password');

    if (!user) {
      throw new Error('Email ou senha inválidos');
    }

    if (!user.isActive) {
      throw new Error('Usuário inativo');
    }

    const isPasswordValid = await comparePassword(data.password, user.password);

    if (!isPasswordValid) {
      throw new Error('Email ou senha inválidos');
    }

    await user.updateLastLogin();

    const tokens = {
      accessToken: generateAccessToken(
        user._id.toString(),
        company._id.toString(),
        user.role
      ),
      refreshToken: generateRefreshToken(
        user._id.toString(),
        company._id.toString()
      ),
    };

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyCode: company.code,
      },
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    const company = await this.validateCompany(payload.companyCode);

    if (!company) {
      throw new Error('Company not found or inactive');
    }

    const accessToken = generateAccessToken(user._id.toString(), user.companyId.toString(), user.role);
    return { accessToken };
  }

  /**
   * Validate company exists and is active
   */
  async validateCompany(companyCode: string): Promise<any> {
    const company = await Company.findOne({ code: companyCode.toUpperCase() });
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
