import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file from backend root directory
// process.cwd() returns the directory where node was started (backend folder when running npm run dev)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  CPFCNPJ_API_BASE_URL: z.string().min(1, 'CPFCNPJ_API_BASE_URL is required'),
  CPFCNPJ_CPF_PACKAGE_ID: z.string().min(1, 'CPFCNPJ_CPF_PACKAGE_ID is required'),
  CPFCNPJ_CNPJ_PACKAGE_ID: z.string().min(1, 'CPFCNPJ_CNPJ_PACKAGE_ID is required'),
  CPFCNPJ_TIMEOUT_MS: z.string().default('60000'),
});

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      console.error('💡 Dica: Certifique-se de que o arquivo .env existe na pasta backend/');
      console.error('💡 Veja o arquivo COMO_CONFIGURAR_ENV.md para instruções detalhadas\n');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();