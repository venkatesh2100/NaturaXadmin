import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getPrisma, disconnectPrisma } from "../src/lib/prisma.js";
import { sha256 } from "../src/lib/cookies.js";
import { generateSampleOrders, sampleOrdersToCsv } from "../src/services/sample-data.js";

const databaseName = process.env.DATABASE_URL?.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? "";
const safeDatabase = databaseName.includes("test");

async function databaseAvailable(): Promise<boolean> {
  if (!safeDatabase) return false;
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const available = await databaseAvailable();

describe.skipIf(!available)("order import API", () => {
  const app = createApp();
  const prisma = getPrisma();
  let token = "";
  const stamp = Date.now();

  beforeAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.dataQualityIssue.deleteMany();
    await prisma.importIssue.deleteMany();
    await prisma.order.deleteMany();
    await prisma.importBatch.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    const admin = await prisma.user.create({
      data: {
        name: "Test Admin",
        email: "admin@vitanatura.example",
        googleId: "test-admin",
        role: "ADMIN",
      },
    });
    await prisma.user.create({
      data: {
        name: "Ananya Iyer",
        email: "ananya.iyer@vitanatura.example",
        googleId: "test-ananya",
        role: "STAFF",
      },
    });
    const raw = `test-session-${stamp}`;
    token = raw;
    await prisma.session.create({
      data: {
        userId: admin.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("imports orders, creates tasks once, and records a status change", async () => {
    const now = new Date();
    const orders = generateSampleOrders(now).slice(40, 80);
    const csv = sampleOrdersToCsv(orders);
    const first = await request(app)
      .post("/imports")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", `nx_session=${token}`)
      .attach("file", Buffer.from(csv), "sample.csv");
    expect(first.status).toBe(201);
    expect(first.body.successfulRows).toBe(40);
    expect(first.body.rejectedRows).toBe(0);

    const tasks = await request(app)
      .get("/tasks?pageSize=100")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", `nx_session=${token}`);
    expect(tasks.status).toBe(200);
    expect(tasks.body.meta.total).toBeGreaterThan(0);
    const created = tasks.body.meta.total as number;

    const second = await request(app)
      .post("/imports")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", `nx_session=${token}`)
      .attach("file", Buffer.from(csv), "sample.csv");
    expect(second.status).toBe(201);
    expect(second.body.tasksCreated).toBe(0);

    const again = await request(app)
      .get("/tasks?pageSize=1")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", `nx_session=${token}`);
    expect(again.body.meta.total).toBe(created);

    const staff = await prisma.user.findUniqueOrThrow({ where: { email: "ananya.iyer@vitanatura.example" } });
    const ownTask = await prisma.task.findFirstOrThrow({ where: { assignedEmployeeId: staff.id, status: "OPEN" } });
    const staffSession = `staff-${stamp}`;
    await prisma.session.create({
      data: { userId: staff.id, tokenHash: sha256(staffSession), expiresAt: new Date(Date.now() + 3600_000) },
    });

    const forbidden = await request(app)
      .patch(`/tasks/${ownTask.id}/assignment`)
      .set("Origin", "http://localhost:3000")
      .set("Cookie", `nx_session=${staffSession}`)
      .send({ employeeId: staff.id });
    expect(forbidden.status).toBe(403);

    const updated = await request(app)
      .patch(`/tasks/${ownTask.id}/status`)
      .set("Origin", "http://localhost:3000")
      .set("Cookie", `nx_session=${staffSession}`)
      .send({ status: "IN_PROGRESS" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("IN_PROGRESS");

    const detail = await request(app)
      .get(`/tasks/${ownTask.id}`)
      .set("Cookie", `nx_session=${token}`);
    expect(detail.body.audit.some((entry: { action: string }) => entry.action === "STATUS_CHANGED")).toBe(true);
  });
});

