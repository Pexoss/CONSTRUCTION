import api from "../../config/api";
import { Employee } from "../../types/employe.type";

export const employeeService = {
  getEmployees: async () => {
    const response = await api.get<{ success: boolean; data: Employee[] }>(
      "/employees",
    );
    return response.data;
  },

  getEmployeeById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Employee }>(
      `/employees/${id}`,
    );
    return response.data;
  },

  updateEmployee: async (id: string, data: any) => {
    const response = await api.put(`/employees/${id}`, data);
    return response.data;
  }
};