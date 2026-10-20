import { describe, expect, it, vi } from "vitest";
import { buildDiscordPayload, sendDiscordNotification } from "./discord.js";

describe("discord notifications", () => {
  it("does not call fetch when notifications are disabled", async () => {
    const fetchImpl = vi.fn();
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.example/webhook",
      enabled: false,
      payload: { content: "hello" },
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a failure when Discord is unreachable", async () => {
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.example/webhook",
      enabled: true,
      payload: { content: "hello" },
      fetchImpl: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("network down");
  });

  it("retries once after a rate limit", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.example/webhook",
      enabled: true,
      payload: buildDiscordPayload({
        title: "New high-priority exception",
        orderRef: "VN-1",
        category: "Failed delivery",
        priority: "HIGH",
        employee: "Ananya Iyer",
        deadline: "2026-10-20T14:00:00.000Z",
        action: "Contact the customer and arrange a delivery reattempt.",
        url: "http://localhost:3000/tasks/abc",
      }),
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.embeds[0].fields.map((field: { name: string }) => field.name)).toEqual([
      "Order",
      "Category",
      "Priority",
      "Assigned",
      "Deadline",
      "Action",
    ]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://discord.example/webhook");
  });

  it("records an HTTP failure without throwing", async () => {
    const result = await sendDiscordNotification({
      webhookUrl: "https://discord.example/webhook",
      enabled: true,
      payload: { content: "hello" },
      fetchImpl: vi.fn(async () => new Response("nope", { status: 500 })),
    });
    expect(result).toEqual({ ok: false, error: "Discord responded with 500" });
  });
});
