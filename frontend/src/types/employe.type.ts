export interface Employee {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export const EMPTY_EMPLOYEES: Employee[] = [];