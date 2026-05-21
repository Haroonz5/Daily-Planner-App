import type { ErrorSeverity, LocalErrorReport } from "./error-reporting";

type CrashProviderScope = {
  uid?: string | null;
  email?: string | null;
  username?: string | null;
};

type CaptureInput = {
  report: LocalErrorReport;
  severity: ErrorSeverity;
};

type OptionalCrashProvider = {
  configureScope?: (scope: CrashProviderScope) => void | Promise<void>;
  captureException?: (error: Error, context: CaptureInput) => void | Promise<void>;
  captureMessage?: (message: string, context: CaptureInput) => void | Promise<void>;
};

const getProvider = (): OptionalCrashProvider | null => {
  const provider = (globalThis as any).DailyDisciplineCrashProvider;
  return provider && typeof provider === "object" ? provider : null;
};

export const configureCrashScope = async (scope: CrashProviderScope) => {
  const provider = getProvider();
  if (!provider?.configureScope) return;

  await Promise.resolve(provider.configureScope(scope)).catch(() => {});
};

export const captureWithNativeCrashProvider = async (input: CaptureInput) => {
  const provider = getProvider();
  if (!provider) return;

  const error = new Error(input.report.message);
  error.name = input.report.name;
  if (input.report.stack) error.stack = input.report.stack;

  if (provider.captureException) {
    await Promise.resolve(provider.captureException(error, input)).catch(() => {});
    return;
  }

  if (provider.captureMessage) {
    await Promise.resolve(provider.captureMessage(input.report.message, input)).catch(() => {});
  }
};

export const getCrashProviderStatus = () => ({
  configured: Boolean(getProvider()),
});
