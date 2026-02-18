import { env } from '../../config/env';
import { AppError } from '../middleware/error.middleware';

type DocumentType = 'cpf' | 'cnpj';

interface CpfCnpjApiResponse {
  status?: number | boolean;
  erro?: string;
  erroCodigo?: number | string;
  nome?: string;
  razao?: string;
  [key: string]: unknown;
}

export interface CpfCnpjLookupResult {
  documentType: DocumentType;
  cpfCnpj: string;
  name: string;
  raw: CpfCnpjApiResponse;
}

class CpfCnpjService {
  private readonly baseUrl = env.CPFCNPJ_API_BASE_URL.replace(/\/$/, '');
  private readonly token = env.CPFCNPJ_API_TOKEN;
  private readonly cpfPackageId = env.CPFCNPJ_CPF_PACKAGE_ID;
  private readonly cnpjPackageId = env.CPFCNPJ_CNPJ_PACKAGE_ID;
  private readonly timeoutMs = parseInt(env.CPFCNPJ_TIMEOUT_MS);

  private normalizeDocument(value: string): string {
    return value.replace(/\D/g, '');
  }

  private getDocumentType(document: string): DocumentType {
    if (document.length === 11) return 'cpf';
    if (document.length === 14) return 'cnpj';

    const error = new Error('CPF/CNPJ must have 11 or 14 digits') as AppError;
    error.statusCode = 400;
    throw error;
  }

  private getPackageId(documentType: DocumentType): string {
    return documentType === 'cpf' ? this.cpfPackageId : this.cnpjPackageId;
  }

  async lookupName(documentInput: string): Promise<CpfCnpjLookupResult> {
    const cpfCnpj = this.normalizeDocument(documentInput);
    const documentType = this.getDocumentType(cpfCnpj);
    const packageId = this.getPackageId(documentType);

    const url = `${this.baseUrl}/${this.token}/${packageId}/${cpfCnpj}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`CPF/CNPJ API request failed with status ${response.status}`) as AppError;
        error.statusCode = 502;
        throw error;
      }

      const data = (await response.json()) as CpfCnpjApiResponse;

      if (data.erro || data.status === 0 || data.status === false) {
        const error = new Error(data.erro || 'CPF/CNPJ API returned an error') as AppError;
        error.statusCode = 400;
        throw error;
      }

      const name = documentType === 'cpf' ? data.nome : data.razao;
      if (!name) {
        const error = new Error('CPF/CNPJ API did not return a name') as AppError;
        error.statusCode = 502;
        throw error;
      }

      return {
        documentType,
        cpfCnpj,
        name,
        raw: data,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const error = new Error('CPF/CNPJ API request timed out') as AppError;
        error.statusCode = 504;
        throw error;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const cpfCnpjService = new CpfCnpjService();
