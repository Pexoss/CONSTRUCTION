import { Company } from '../companies/company.model';
import { User } from '../users/user.model';
import { comparePassword } from '../../shared/utils/password.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.util';
import { generateUniqueCompanyCode } from '../../shared/utils/generateCode';
import { UserRole } from '../../shared/constants/roles';
import mongoose from 'mongoose';

export interface RegisterCompanyData {
  companyName: string;
  cnpj?: string;
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
  companyCode: string;
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
  async registerCompany(data: RegisterCompanyData): Promise<any> {
    const code = await generateUniqueCompanyCode(data.companyName);

    // Verifica se empresa já existe
    const existingCompany = await Company.findOne({
      $or: [{ cnpj: data.cnpj?.replace(/\D/g, '') }, { email: data.email }],
    });
    if (existingCompany) throw new Error('Company with this CNPJ or email already exists');

    // Verifica se usuário já existe
    const existingUser = await User.findOne({ email: data.userEmail });
    if (existingUser) throw new Error('User with this email already exists');

    // Cria empresa
    const company = await Company.create({
      name: data.companyName,
      cnpj: data.cnpj?.replace(/\D/g, ''),
      email: data.email,
      phone: data.phone,
      code,
      address: data.address,
      subscription: { plan: 'basic', status: 'active' },
    });

    // Cria superadmin
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

  /**
   * Register a new user (employee) using the company code
   */
  async registerUser(data: RegisterUserData): Promise<any> {
    if (!data.companyCode || data.companyCode.trim() === '') {
      throw new Error('Company code is required');
    }

    const company = await Company.findOne({ code: data.companyCode.toUpperCase() });
  
    if (!company || company.subscription.status !== 'active') {
      throw new Error('Invalid or inactive company code');
    }

    const existingUser = await User.findOne({
      companyId: company._id,
      email: data.email,
    });

    if (existingUser) {
      throw new Error('User with this email already exists in this company');
    }

    const user = await User.create({
      companyId: company._id,
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role || UserRole.VIEWER,
      isActive: true,
    });

    const tokens = {
      accessToken: generateAccessToken(user._id.toString(), company._id.toString(), user.role),
      refreshToken: generateRefreshToken(user._id.toString(), company._id.toString()),
    };

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyCode: company.code,
      tokens,
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    const accessToken = generateAccessToken(
      user._id.toString(),
      user.companyId.toString(),
      user.role
    );

    return { accessToken };
  }

  /**
   * Login user using email + company code
   */
  async login(data: LoginData): Promise<{ user: any; tokens: AuthTokens }> {
    const company = await Company.findOne({ code: data.companyCode.toUpperCase() });
    if (!company || company.subscription.status !== 'active') throw new Error('Empresa não encontrada ou inativa');

    const user = await User.findOne({ email: data.email, companyId: company._id }).select('+password');
    if (!user) throw new Error('Email ou senha inválidos');
    if (!user.isActive) throw new Error('Usuário inativo');

    const isPasswordValid = await comparePassword(data.password, user.password);
    if (!isPasswordValid) throw new Error('Email ou senha inválidos');

    await user.updateLastLogin();

    const tokens = {
      accessToken: generateAccessToken(user._id.toString(), company._id.toString(), user.role),
      refreshToken: generateRefreshToken(user._id.toString(), company._id.toString()),
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
}

export const authService = new AuthService();
