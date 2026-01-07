/* eslint-disable @typescript-eslint/no-unused-vars */
import { IUser } from '../../modules/users/user.types';

declare global {
  namespace Express {
    interface Request {
      companyId?: string;
      user?: IUser;
    }
  }
}

export {};