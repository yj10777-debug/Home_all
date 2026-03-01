/**
 * Google Calendar API — 出社予定を取得し、評価対象日の勤務形態（出社/在宅/休日）を判定する
 * 出社日: カレンダーに「出社」を含む予定がある日
 * 在宅: 平日のうち出社でない日
 * 休日: 土日
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";

/** 環境変数から OAuth 設定を取得（Calendar 用。Drive と同じ GOOGLE_* を使用） */
function getConfig(): { clientId: string; clientSecret: string; refreshToken: string; calendarId: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  };
}

/** リフレッシュトークンからアクセストークンを取得 */
async function getAccessToken(
  config: NonNullable<ReturnType<typeof getConfig>>
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google アクセストークン取得失敗: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** 日付文字列からその日の曜日を取得（0=日, 6=土） */
function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 平日かどうか（月〜金） */
function isWeekday(dateStr: string): boolean {
  const dow = getDayOfWeek(dateStr);
  return dow >= 1 && dow <= 5;
}

/**
 * 指定期間内で「出社」を含む予定がある日付の集合を取得する
 * @param startDate YYYY-MM-DD（含む）
 * @param endDate YYYY-MM-DD（含む）
 * @returns 出社日の YYYY-MM-DD の Set。API 未設定時は null。API エラー時も null（勤務形態を「データなし」にするため）
 */
export async function getOfficeDaysInRange(
  startDate: string,
  endDate: string
): Promise<Set<string> | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const timeMin = `${startDate}T00:00:00Z`;
    const timeMax = `${endDate}T23:59:59Z`;
    const params = new URLSearchParams({
      q: "出社",
      timeMin,
      timeMax,
      singleEvents: "true",
      maxResults: "500",
    });
    const url = `${CALENDAR_API}/${encodeURIComponent(config.calendarId)}/events?${params}`;
    const accessToken = await getAccessToken(config);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn("[googleCalendar] API エラー:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      items?: Array<{
        start?: { date?: string; dateTime?: string };
      }>;
    };
    const dates = new Set<string>();
    for (const item of data.items ?? []) {
      const start = item.start;
      if (!start) continue;
      const dateStr = start.date ?? (start.dateTime ? start.dateTime.slice(0, 10) : null);
      if (dateStr) dates.add(dateStr);
    }
    return dates;
  } catch (e) {
    console.warn("[googleCalendar] 出社日取得エラー:", e);
    return null;
  }
}

/**
 * 指定日の勤務形態を返す（AI 評価の INPUT 用）
 * - 出社: カレンダーに「出社」予定がある日
 * - 在宅: 平日のうち出社でない日
 * - 休日: 土日
 * @param dateStr YYYY-MM-DD
 * @returns "出社" | "在宅" | "休日"。API 未設定・エラー時は null
 */
export async function getWorkLocation(dateStr: string): Promise<"出社" | "在宅" | "休日" | null> {
  const config = getConfig();
  if (!config) return null;

  const [y, m] = dateStr.split("-").map(Number);
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0);
  const lastDayStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const officeDays = await getOfficeDaysInRange(firstDay, lastDayStr);
  if (officeDays === null) return null;
  if (officeDays.has(dateStr)) return "出社";
  if (!isWeekday(dateStr)) return "休日";
  return "在宅";
}

/** Google Calendar 連携が有効か（同一の GOOGLE_* で Drive と共有。Calendar スコープが必要） */
export function isGoogleCalendarConfigured(): boolean {
  return getConfig() !== null;
}
