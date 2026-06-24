import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

const globalForDb = globalThis as unknown as { __icitPool?: Pool }

export const pool =
  globalForDb.__icitPool ?? new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== "production") globalForDb.__icitPool = pool

export const db = drizzle(pool, { schema })
