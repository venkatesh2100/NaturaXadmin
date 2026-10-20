import "dotenv/config";
import { getPrisma, disconnectPrisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { importOrders } from "../services/import.js";
import { generateSampleOrders, sampleOrdersToCsv } from "../services/sample-data.js";

const demoPassword = "naturax123";
const passwordHash = await hashPassword(demoPassword);

const people = [
  { name: "VitaNatura Admin", email: "admin@vitanatura.example", role: "ADMIN" as const },
  { name: "Ananya Iyer", email: "ananya.iyer@vitanatura.example", role: "STAFF" as const },
  { name: "Rohan Mehta", email: "rohan.mehta@vitanatura.example", role: "STAFF" as const },
  { name: "Kavya Nair", email: "kavya.nair@vitanatura.example", role: "STAFF" as const },
  { name: "Dev Patel", email: "dev.patel@vitanatura.example", role: "STAFF" as const },
];

const prisma = getPrisma();
for (const person of people) {
  await prisma.user.upsert({
    where: { email: person.email },
    create: { ...person, googleId: `seed:${person.email}`, passwordHash },
    update: { name: person.name, role: person.role, passwordHash },
  });
}

const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@vitanatura.example" } });
const orders = generateSampleOrders(new Date());
const csv = sampleOrdersToCsv(orders);
const summary = await importOrders({
  filename: "sample-orders.csv",
  buffer: Buffer.from(csv),
  userId: admin.id,
});

console.log(
  JSON.stringify(
    {
      orders: orders.length,
      successfulRows: summary.successfulRows,
      rejectedRows: summary.rejectedRows,
      tasksCreated: summary.tasksCreated,
      warningCount: summary.warningCount,
    },
    null,
    2,
  ),
);

await disconnectPrisma();
