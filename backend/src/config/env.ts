import path from "path";
import dotenv from "dotenv";

// Load environment from backend/.env (falls back to legacy/timesheet-backend/.env for anything missing)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../legacy/timesheet-backend/.env") });

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret && nodeEnv === "production") {
  throw new Error("FATAL: JWT_SECRET environment variable is required in production (S2).");
}

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
