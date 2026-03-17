import { Router } from "express";
import { employeesController } from "./employes.controller";

const router = Router();

router.get("/", employeesController.listEmployees.bind(employeesController));

router.get("/:id", employeesController.getEmployeeById.bind(employeesController));

router.put("/:id", employeesController.updateEmployee.bind(employeesController));

export default router;