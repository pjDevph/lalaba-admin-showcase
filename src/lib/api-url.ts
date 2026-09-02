import { rewriteLoopbackUrl } from "./loopback-host";

export function resolveApiUrl(): string {
  const online = process.env.NEXT_PUBLIC_ONLINE === "on";
  const url = online
    ? process.env.NEXT_PUBLIC_API_URL_ONLINE
    : process.env.NEXT_PUBLIC_API_URL_LOCAL;

  if (!url) {
    throw new Error(
      online
        ? "NEXT_PUBLIC_ONLINE=on but NEXT_PUBLIC_API_URL_ONLINE is not set"
        : "NEXT_PUBLIC_API_URL_LOCAL is not set",
    );
  }

  // Viewed from the Android emulator or a LAN device, a configured
  // `localhost` would point at that device instead of this machine.
  return rewriteLoopbackUrl(url);
}
