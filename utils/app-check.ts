type NativeAppCheckBridge = {
  getToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
};

const TOKEN_CACHE_MS = 4 * 60 * 1000;

let cachedToken: string | null = null;
let cachedAt = 0;

const getNativeBridge = (): NativeAppCheckBridge | null => {
  const bridge = (globalThis as any).DailyDisciplineAppCheck;
  return bridge && typeof bridge.getToken === "function" ? bridge : null;
};

const getDebugToken = () => {
  const token = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;
  return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
};

export const getAppCheckToken = async (forceRefresh = false) => {
  const debugToken = getDebugToken();
  if (debugToken) return debugToken;

  if (!forceRefresh && cachedToken && Date.now() - cachedAt < TOKEN_CACHE_MS) {
    return cachedToken;
  }

  const bridge = getNativeBridge();
  if (!bridge?.getToken) return null;

  try {
    const token = await bridge.getToken(forceRefresh);
    cachedToken = typeof token === "string" && token.trim() ? token.trim() : null;
    cachedAt = Date.now();
    return cachedToken;
  } catch {
    cachedToken = null;
    cachedAt = 0;
    return null;
  }
};

export const getAppCheckHeaders = async (): Promise<Record<string, string>> => {
  const token = await getAppCheckToken();
  return token ? { "X-Firebase-AppCheck": token } : {};
};

export const getAppCheckClientStatus = async () => {
  const hasBridge = Boolean(getNativeBridge());
  const hasDebugToken = Boolean(getDebugToken());
  const token = await getAppCheckToken();

  return {
    hasBridge,
    hasDebugToken,
    hasToken: Boolean(token),
  };
};
