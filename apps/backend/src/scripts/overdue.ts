import "dotenv/config";
import { disconnectPrisma } from "../lib/prisma.js";
import { runOverdueCheck } from "../services/overdue.js";

const result = await runOverdueCheck();
console.log(JSON.stringify(result));
await disconnectPrisma();
