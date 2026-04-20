import { env } from "../../config/env";

const isEnabled = (value: string | undefined): boolean =>
  String(value).toLowerCase() === "true";

export const financialFlags = {
  unifiedModule: isEnabled(env.FINANCIAL_UNIFIED_MODULE),
  lifecycleV2: isEnabled(env.FINANCIAL_LIFECYCLE_V2),
};

