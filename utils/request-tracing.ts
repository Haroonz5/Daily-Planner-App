import Constants from "expo-constants";

export type RequestTraceContext = {
  requestId: string;
  traceId: string;
  spanId: string;
  traceparent: string;
  operation: string;
};

const randomHex = (bytes: number) => {
  const cryptoObject = (globalThis as any).crypto;
  if (cryptoObject?.getRandomValues) {
    const values = new Uint8Array(bytes);
    cryptoObject.getRandomValues(values);
    return Array.from(values)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  return Array.from({ length: bytes }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
};

const sanitizeOperation = (operation: string) =>
  operation.replace(/[^a-z0-9-_]/gi, "-").replace(/-+/g, "-").slice(0, 48) || "request";

export const createRequestTrace = (operation: string): RequestTraceContext => {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const safeOperation = sanitizeOperation(operation);

  return {
    requestId: `dd-${safeOperation}-${Date.now().toString(36)}-${spanId.slice(0, 6)}`,
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`,
    operation: safeOperation,
  };
};

export const traceHeaders = (trace: RequestTraceContext) => ({
  "X-Request-ID": trace.requestId,
  "X-Client-Trace-ID": trace.traceId,
  "X-App-Version": Constants.expoConfig?.version ?? "1.0.0",
  traceparent: trace.traceparent,
});
