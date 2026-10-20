import net from "node:net";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { getEnv } from "../env.js";

// This host's IPv6 path to Neon times out during Happy Eyeballs and aborts the IPv4 attempt.
if (typeof net.setDefaultAutoSelectFamily === "function") net.setDefaultAutoSelectFamily(false);

let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) {
    // A long-lived Node process should use Neon's direct host. The pooled host
    // makes Prisma's interactive transactions too slow to finish an import.
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL.replace("-pooler", "") });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
