import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const defaultFrontendUrl = "http://localhost:3000";

function parseCsvUrls(value: string | undefined, fallback: string): string[] {
  const urls = (value || fallback)
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return urls.length > 0 ? urls : [fallback];
}

function parseSameSite(value: string | undefined): "lax" | "strict" | "none" {
  const normalized = value?.toLowerCase();
  if (normalized === "strict" || normalized === "none") return normalized;
  return "lax";
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

const frontendUrls = parseCsvUrls(
  process.env.FRONTEND_URLS || process.env.FRONTEND_URL,
  defaultFrontendUrl,
);
const production = nodeEnv === "production";

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv,
  frontendUrl: frontendUrls[0],
  frontendUrls,
  database: {
    url: process.env.DATABASE_URL || "",
  },
  session: {
    secret: process.env.SESSION_SECRET || "dev-session-secret-change-in-prod",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    cookie: {
      secure: parseBoolean(process.env.SESSION_COOKIE_SECURE, production),
      sameSite: parseSameSite(
        process.env.SESSION_COOKIE_SAME_SITE || (production ? "none" : "lax"),
      ),
    },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      "http://localhost:4000/auth/google/callback",
  },
  cron: {
    apiKey: process.env.CRON_API_KEY || "dev-cron-key",
  },
  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY || "",
  },
};

function isPrivateLanHost(hostname: string): boolean {
  return (
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

export function isAllowedFrontendOrigin(origin: string): boolean {
  if (config.frontendUrls.some((url) => new URL(url).origin === origin)) {
    return true;
  }

  if (production) return false;

  try {
    const url = new URL(origin);
    const localDevHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0" ||
      isPrivateLanHost(url.hostname);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      localDevHost &&
      url.port === "3000"
    );
  } catch {
    return false;
  }
}
