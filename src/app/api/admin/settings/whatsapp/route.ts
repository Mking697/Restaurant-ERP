import { NextResponse } from "next/server";
import { approvedChatXFlowBaseUrl, DEFAULT_CHATXFLOW_BASE_URL as DEFAULT_BASE_URL } from "@/lib/chatxflow";
import { getSetting, upsertSetting } from "@/lib/settings";
import { requireIdentity, mutate } from "@/lib/server/auth";
import { assertOwner, HttpError } from "@/lib/server/permissions";
import { api, body } from "@/lib/server/http";
export const dynamic = "force-dynamic";

// HQ-global provider settings: only authenticated Owner can read/write.

function maskToken(token: string): string {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}${"•".repeat(Math.max(token.length - 8, 4))}${token.slice(-4)}`;
}

async function readSettings() {
  const [token, phoneNumber, baseUrl] = await Promise.all([
    getSetting("CHATXFLOW_API_TOKEN"),
    getSetting("CHATXFLOW_PHONE_NUMBER"),
    getSetting("CHATXFLOW_BASE_URL"),
  ]);

  return NextResponse.json({
    hasToken: Boolean(token),
    tokenMasked: token ? maskToken(token) : "",
    phoneNumber: phoneNumber ?? "",
    baseUrl: baseUrl || DEFAULT_BASE_URL,
  });
}

interface SettingsBody {
  token?: string;
  phoneNumber?: string;
  baseUrl?: string;
}
const SETTINGS_FIELDS = ["token", "phoneNumber", "baseUrl"];

async function writeSettings(request: Request) {
  const raw = await body(request);
  const unknown = Object.keys(raw).find((k) => !SETTINGS_FIELDS.includes(k));
  if (unknown) throw new HttpError(400, `Unexpected field: ${unknown}`);
  const input = raw as SettingsBody;

  const rawBaseUrl = (input.baseUrl ?? DEFAULT_BASE_URL).trim();
  const approved = rawBaseUrl ? approvedChatXFlowBaseUrl(rawBaseUrl) : DEFAULT_BASE_URL;
  if (!approved) {
    return NextResponse.json(
      { error: "Base URL sirf https://chatxflow.online hona chahiye; custom hosts allowed nahi hain." },
      { status: 400 }
    );
  }

  const writes = [
    upsertSetting("CHATXFLOW_PHONE_NUMBER", (input.phoneNumber ?? "").trim()),
    upsertSetting("CHATXFLOW_BASE_URL", approved),
  ];
  // Only overwrite the token if the admin actually typed a new one — the field
  // is never pre-filled with the real value, so an empty submit means "leave as-is".
  if (input.token?.trim()) {
    writes.push(upsertSetting("CHATXFLOW_API_TOKEN", input.token.trim()));
  }

  await Promise.all(writes);
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  return api(async () => {
    assertOwner(await requireIdentity(request));
    const response = await readSettings();
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
export async function POST(request: Request) {
  return api(() => mutate(request, async (_tx, actor) => {
    assertOwner(actor);
    return writeSettings(request);
  }));
}
