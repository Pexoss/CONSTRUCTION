const enabled = (value: string | undefined) => String(value).toLowerCase() === "true";

export const features = {
  financialUnifiedModule: enabled(process.env.REACT_APP_FINANCIAL_UNIFIED_MODULE),
  financialLifecycleV2: enabled(process.env.REACT_APP_FINANCIAL_LIFECYCLE_V2),
};

