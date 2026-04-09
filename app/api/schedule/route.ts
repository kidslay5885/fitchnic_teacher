import { NextResponse } from "next/server";
import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Lecture {
  platform: string;
  instructor: string;
  content: string;
  time: string;
}

interface DaySchedule {
  day: string;   // SUN, MON, ...
  date: string;  // 4/5, 4/6, ...
  lectures: Lecture[];
}

interface WeekSchedule {
  days: DaySchedule[];
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

// 시트의 raw 데이터를 주간 단위로 파싱
function parseWeeks(rows: string[][]): WeekSchedule[] {
  const weeks: WeekSchedule[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];

    // 요일 헤더 행 찾기 (SUN 또는 WED 등으로 시작)
    const firstCell = (row[0] || "").trim();
    const isHeaderRow = DAY_NAMES.includes(firstCell) ||
      // 첫 주처럼 WED부터 시작하는 경우도 처리
      row.some((cell, idx) => idx % 4 === 0 && DAY_NAMES.includes((cell || "").trim()));

    if (!isHeaderRow) continue;

    // 다음 행: 날짜 행
    const dateRow = rows[i + 1] || [];
    // 그 다음: 헤더(플랫폼/강사명/내용/시간) 행
    // 그 이후: 데이터 행들 (빈 행 나올 때까지)

    const days: DaySchedule[] = [];

    // 4열씩 묶어서 각 요일 처리 (최대 7요일 = 28열)
    for (let col = 0; col < 28; col += 4) {
      const dayName = (row[col] || "").trim();
      const dateStr = (dateRow[col] || "").trim();

      if (!dayName && !dateStr) continue;
      if (!DAY_NAMES.includes(dayName)) continue;
      // 날짜가 없는 요일은 해당 월 범위 밖이므로 제외
      if (!dateStr) continue;

      const lectures: Lecture[] = [];

      // 데이터 행 파싱 (헤더 행 + 2부터)
      for (let r = i + 3; r < rows.length; r++) {
        const dataRow = rows[r] || [];

        // 빈 행이면 해당 주 종료
        if (!dataRow.length || dataRow.every(c => !(c || "").trim())) break;

        // 다음 주 헤더가 나오면 종료
        const fc = (dataRow[0] || "").trim();
        if (DAY_NAMES.includes(fc) && r > i + 3) break;

        const platform = (dataRow[col] || "").trim();
        const instructor = (dataRow[col + 1] || "").trim();
        const content = (dataRow[col + 2] || "").trim();
        const time = (dataRow[col + 3] || "").trim();

        if (platform || instructor || content) {
          lectures.push({ platform, instructor, content, time });
        }
      }

      days.push({ day: dayName, date: dateStr, lectures });
    }

    if (days.length > 0) {
      weeks.push({ days });
    }
  }

  return weeks;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // 기본: 현재 월에 해당하는 시트, 또는 쿼리로 지정
    const sheetName = searchParams.get("sheet") || null;

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // 시트 목록 조회
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetList = (meta.data.sheets || []).map(s => ({
      title: s.properties?.title || "",
      sheetId: s.properties?.sheetId || 0,
    }));

    // 타겟 시트 결정
    const targetName = sheetName || sheetList[0]?.title;
    if (!targetName) {
      return NextResponse.json({ error: "시트를 찾을 수 없습니다" }, { status: 404 });
    }

    // 데이터 읽기
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: targetName,
    });

    const rows = result.data.values || [];
    const weeks = parseWeeks(rows as string[][]);

    return NextResponse.json({
      sheetName: targetName,
      sheets: sheetList.map(s => s.title),
      weeks,
    });
  } catch (e: any) {
    console.error("Google Sheets API 에러:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
