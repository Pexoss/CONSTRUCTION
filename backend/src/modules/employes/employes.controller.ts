import { Request, Response, NextFunction } from "express";
import { employeeService } from "./employes.service";

export class EmployeesController {

  // LISTAR FUNCIONÁRIOS
  async listEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;

      const employees = await employeeService.getCompanyEmployees(companyId);

      res.status(200).json({
        success: true,
        data: employees,
      });

    } catch (error) {
      next(error);
    }
  }

  // BUSCAR POR ID
  async getEmployeeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const employeeId = req.params.id;

      const employee = await employeeService.getEmployeeById(companyId, employeeId);

      if (!employee) {
        res.status(404).json({
          success: false,
          message: "Employee not found",
        });
        return;
      }

      res.json({
        success: true,
        data: employee,
      });

    } catch (error) {
      next(error);
    }
  }

  // ATUALIZAR
  async updateEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const employeeId = req.params.id;

      const employee = await employeeService.updateEmployee(
        companyId,
        employeeId,
        req.body
      );

      res.json({
        success: true,
        message: "Employee updated successfully",
        data: employee,
      });

    } catch (error) {
      next(error);
    }
  }

}

export const employeesController = new EmployeesController();