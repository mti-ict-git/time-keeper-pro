import { dbConfig } from "./config";
import { createPoolGetter } from "./pool";

export const getPool = createPoolGetter("EmployeeWorkflow", () => dbConfig);
