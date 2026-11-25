import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load env files in priority order without overriding already-injected cloud env vars
const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../.env.local"),
  path.resolve(__dirname, "../../../../.env"),
  path.resolve(__dirname, "../../../../.env.local"),
];

for (const filePath of candidates) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

// Neon pooled (-pooler) endpoints use PgBouncer transaction mode, requiring ?pgbouncer=true for Prisma
if (
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL.includes("-pooler") &&
  !process.env.DATABASE_URL.includes("pgbouncer=true")
) {
  const sep = process.env.DATABASE_URL.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${sep}pgbouncer=true`;
}

if (!process.env.DATABASE_URL_UNPOOLED && process.env.DATABASE_URL) {
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL.replace("-pooler.", ".");
}
