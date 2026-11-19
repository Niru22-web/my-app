import path from "path";
import dotenv from "dotenv";

// Settings come only from backend/.env (or the real environment). The old portal’s .env is never read,
// so the two systems can’t share a login secret.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = process.env.JWT_SECRET;

if (nodeEnv !== "development" && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error("FATAL: set JWT_SECRET (at least 32 random characters) in backend/.env — required outside development (S2).");
}
if (!process.env.DATABASE_URL) throw new Error("FATAL: DATABASE_URL is not set in backend/.env.");

const frontendOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
if (!frontendOrigins.length) frontendOrigins.push("http://localhost:3000");

const rawTrust = (process.env.TRUST_PROXY ?? "127.0.0.1").trim();
const trustProxy: boolean | string = /^(true|yes)$/i.test(rawTrust)
  ? true
  : /^(false|no)$/i.test(rawTrust)
    ? false
    : rawTrust; // address / CIDR list, e.g. "127.0.0.1" (default)

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT ?? 5000),
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  JWT_SECRET: jwtSecret || "dev-only-local-secret-do-not-use-in-prod",
  // FRONTEND_URL may list several comma-separated origins (e.g. the Vercel address and a custom domain).
  // The first is used in links the API writes (emails, invite links); all of them may call the API.
  FRONTEND_URL: frontendOrigins[0],
  FRONTEND_ORIGINS: frontendOrigins,
  // Which proxies to believe for the client IP (used by the sign-in rate limit). Locally the Next.js/Nginx
  // proxy is on 127.0.0.1; on a host like Render requests arrive through its load balancer, so set
  // TRUST_PROXY=true there — otherwise every user shares the load balancer's IP and one sign-in limit.
  TRUST_PROXY: trustProxy,
  UPLOADS_DIR: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../uploads"), // data (uploaded files) lives in backend/uploads, outside git
};
