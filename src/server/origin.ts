export const LOOPBACK_HOST = "127.0.0.1";

export function assertLoopbackHost(host: string) {
  if (host !== LOOPBACK_HOST) {
    throw new Error("Screen Review Workbench may only bind to 127.0.0.1.");
  }
  return host;
}

export function assertMutationOrigin(
  origin: string | undefined,
  expectedOrigin: string | readonly string[],
) {
  const allowed = typeof expectedOrigin === "string" ? [expectedOrigin] : expectedOrigin;
  if (!origin || !allowed.includes(origin)) {
    throw new Error("Mutation origin does not match the workbench origin.");
  }
}

export function loopbackOrigins(port: number) {
  return [`http://${LOOPBACK_HOST}:${port}`, `http://localhost:${port}`];
}

// Rejects DNS-rebinding requests whose Host header names a non-loopback site.
export function isLoopbackHostHeader(host: string | undefined, port: number) {
  return host === `${LOOPBACK_HOST}:${port}` || host === `localhost:${port}`;
}
