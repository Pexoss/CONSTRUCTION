import { User } from "../users/user.model";

export const employeeService = {

  // LISTAR FUNCIONÁRIOS
  async getCompanyEmployees(companyId: string) {

    const employees = await User.find({
      companyId,
      role: "viewer",
      isActive: true,
    }).select("name email role createdAt");

    return employees;
  },

  // BUSCAR POR ID
  async getEmployeeById(companyId: string, employeeId: string) {

    const employee = await User.findOne({
      _id: employeeId,
      companyId,
    }).select("name email role isActive createdAt");

    return employee;
  },

  // ATUALIZAR
  async updateEmployee(companyId: string, employeeId: string, data: any) {

    const employee = await User.findOne({
      _id: employeeId,
      companyId,
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    Object.assign(employee, data);

    await employee.save();

    return employee;
  }

};