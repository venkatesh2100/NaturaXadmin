export type DiscordPayloadInput = {
  title: string;
  orderRef: string;
  category: string;
  priority: string;
  employee: string;
  deadline: string;
  action: string;
  url?: string;
};

export type DiscordSendResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function shouldNotifyOnCreate(task: { priority: string; category: string }): boolean {
  return task.priority === "HIGH" || task.category === "FAILED_DELIVERY";
}

export function buildDiscordPayload(input: DiscordPayloadInput): Record<string, unknown> {
  return {
    username: "VitaNatura Follow-up",
    embeds: [
      {
        title: input.title.slice(0, 256),
        url: input.url,
        color: input.priority === "HIGH" ? 0xb42318 : 0xb54708,
        fields: [
          { name: "Order", value: input.orderRef.slice(0, 1024), inline: true },
          { name: "Category", value: input.category.slice(0, 1024), inline: true },
          { name: "Priority", value: input.priority.slice(0, 1024), inline: true },
          { name: "Assigned", value: input.employee.slice(0, 1024), inline: true },
          { name: "Deadline", value: input.deadline.slice(0, 1024), inline: true },
          { name: "Action", value: input.action.slice(0, 1024) },
        ],
      },
    ],
  };
}

export async function sendDiscordNotification(
  options: {
    webhookUrl: string;
    enabled: boolean;
    payload: Record<string, unknown>;
    fetchImpl?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
  },
): Promise<DiscordSendResult> {
  if (!options.enabled) return { ok: true, skipped: true, reason: "disabled" };
  if (!options.webhookUrl) return { ok: true, skipped: true, reason: "missing_webhook" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 5000;

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(options.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(options.payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await attempt();
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      const waitMs = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, 2000);
      await sleep(waitMs);
      response = await attempt();
    }
    if (!response.ok) return { ok: false, error: `Discord responded with ${response.status}` };
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discord request failed";
    return { ok: false, error: message.slice(0, 300) };
  }
}
