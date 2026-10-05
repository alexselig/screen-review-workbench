export const LOOPBACK_HOST = "127.0.0.1";

export function assertLoopbackHost(host: string) {
  if (host !== LOOPBACK_HOST) {
    throw new Error("Screen Review Workbench may only bind to 127.0.0.1.");
  }
  return host;
}

export function assertMutationOrigin(
  origin: string | undefined,
  expectedOrigin: string,
) {
  if (origin !== expectedOrigin) {
    throw new Error("Mutation origin does not match the workbench origin.");
  }
}
