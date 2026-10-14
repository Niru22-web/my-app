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

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT ?? 5000),
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  JWT_SECRET: jwtSecret || "dev-only-local-secret-do-not-use-in-prod",
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
  UPLOADS_DIR: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../uploads"), // data (uploaded files) lives in backend/uploads, outside git
};
