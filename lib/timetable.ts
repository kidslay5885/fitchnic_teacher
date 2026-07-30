// 구글 드라이브에 올라간 "핏크닉 강의실 시간표" xlsx 에서 강사미팅/킥오프 일정 추출
//
// 이 파일은 네이티브 구글 시트가 아니라 업로드된 Office 파일이라
// Sheets API 로는 읽을 수 없다 ("must not be an Office file" 400).
// Drive API 로 원본을 받아 xlsx 로 파싱한다.

import { google } from "googleapis";
import * as XLSX from "xlsx";
import { extractDisplayName } from "./instructor-match";

// 시간표 파일 ID (환경변수로 덮어쓸 수 있음)
const FILE_ID = process.env.TIMETABLE_FILE_ID || "1cdgIn54b7L4LjlR2PET8LPNba_DfAnSb";

// 이 시점 이후의 월 시트만 읽는다 (그 이전은 리마인드 대상이 아님)
const MIN_YEAR = 2026;
const MIN_MONTH = 7;

export interface ParsedEvent {
  source_key: string;
  sheet: string;
  cell: string;
  event_date: string;   // YYYY-MM-DD
  event_time: string;   // HH:MM
  event_type: "강사미팅" | "킥오프";
  meeting_mode: string; // 대면 | 줌 | ''
  protocol: string;     // O | X | ''
  display_name: string;
  raw_text: string;
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

/** 드라이브에서 시간표 원본 xlsx 내려받기 */
export async function downloadTimetable(): Promise<Buffer> {
  const drive = google.drive({ version: "v3", auth: await getAuth().getClient() as never });
  const res = await drive.files.get(
    { fileId: FILE_ID, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 셀 텍스트에서 실제 미팅 시각 추출.
 * 시간표 칸(1시간 단위)과 다른 시각이 텍스트에 적혀 있는 경우가 있다.
 *   "16:30 (6층) 강사미팅 [다크맨]" → 16:30
 *   "부자꿈틀 (줌) 3시 확정"        → 15:00 (업무시간이 9~22시라 오전 1~8시는 오후로 간주)
 */
function timeFromText(text: string): string {
  const hhmm = text.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    const h = +hhmm[1];
    if (h >= 0 && h <= 23) return `${pad2(h)}:${hhmm[2]}`;
  }
  const kor = text.match(/(\d{1,2})\s*시/);
  if (kor) {
    let h = +kor[1];
    if (h >= 1 && h <= 8) h += 12; // 3시 → 15:00
    if (h >= 0 && h <= 23) return `${pad2(h)}:00`;
  }
  return "";
}

/** 시간표 칸 라벨("08:00-09:00")에서 시작 시각 */
function timeFromSlot(label: unknown): string {
  if (typeof label !== "string") return "";
  const m = label.match(/(\d{1,2}):(\d{2})/);
  return m ? `${pad2(+m[1])}:${m[2]}` : "";
}

/**
 * 날짜 헤더 셀 판별 → 'YYYY-MM-DD' 반환
 *
 * 최신 시트는 날짜 값(엑셀 serial), 과거 시트는 '1(수)' 텍스트로 적혀 있다.
 * 엑셀 serial 은 SSF.parse_date_code 로 변환한다 — cellDates 옵션으로 Date 를 받으면
 * 타임존 보정 때문에 하루 밀린 값이 나온다(7/1 → 6/30T14:59:08Z).
 * 변환 결과가 시트명의 연/월과 일치하는지 확인해서 일반 숫자 셀을 걸러낸다.
 */
function headerDate(cell: XLSX.CellObject | undefined, year: number, month: number): string | null {
  if (!cell) return null;
  if (cell.t === "n" && typeof cell.v === "number") {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (d && d.y === year && d.m === month && d.d >= 1 && d.d <= 31) {
      return `${year}-${pad2(month)}-${pad2(d.d)}`;
    }
    return null;
  }
  if (cell.t === "s" && typeof cell.v === "string") {
    const m = cell.v.match(/^\s*(\d{1,2})\s*\(.\)\s*$/);
    if (m) {
      const day = +m[1];
      if (day >= 1 && day <= 31) return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  return null;
}

export interface ParseResult {
  events: ParsedEvent[];
  /** 주간 표 바깥(오른쪽 여백)에 적혀 있어 날짜를 확정할 수 없었던 강사미팅 셀 */
  outsideGrid: { sheet: string; cell: string; text: string }[];
}

/** xlsx 버퍼 → 강사미팅/킥오프 일정 목록 */
export function parseTimetable(buf: Buffer): ParseResult {
  const wb = XLSX.read(buf, { type: "buffer" });
  const out: ParsedEvent[] = [];
  const outsideGrid: ParseResult["outsideGrid"] = [];

  for (const sheetName of wb.SheetNames) {
    const nm = sheetName.match(/^(\d{4})년\s*(\d{1,2})월$/);
    if (!nm) continue;
    const year = +nm[1], month = +nm[2];
    if (year * 100 + month < MIN_YEAR * 100 + MIN_MONTH) continue;

    const ws = wb.Sheets[sheetName];
    if (!ws?.["!ref"]) continue;
    // 시트 범위가 B열부터 시작하는 경우가 있어(!ref = B1:AE962)
    // sheet_to_json 배열 인덱스에 의존하지 않고 절대 좌표로 읽는다.
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const at = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;

    // 날짜 헤더 행 수집
    const headers: { row: number; cols: { col: number; date: string }[] }[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cols: { col: number; date: string }[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const date = headerDate(at(r, c), year, month);
        if (date) cols.push({ col: c, date });
      }
      if (cols.length) headers.push({ row: r, cols });
    }

    headers.forEach((h, hi) => {
      const endRow = hi + 1 < headers.length ? headers[hi + 1].row - 1 : range.e.r;

      // 주간 표의 실제 오른쪽 끝 열.
      // 날짜 헤더 바로 아래는 '5층 / 별관 / 4층' 같은 강의실 표기 행이라
      // 그 행에 값이 있는 마지막 열이 표의 끝이다.
      // 이 경계를 안 쓰면 표 바깥(오른쪽 여백)에 적어둔 메모까지
      // 마지막 날짜의 일정으로 잘못 읽는다.
      let lastCol = -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const v = at(h.row + 1, c)?.v;
        if (v !== undefined && v !== null && String(v).trim() !== "") lastCol = c;
      }
      const lastDateCol = h.cols[h.cols.length - 1].col;
      if (lastCol < lastDateCol) lastCol = range.e.c; // 강의실 표기 행이 없으면 종전대로

      for (let r = h.row + 1; r <= endRow; r++) {
        // 표 바깥에 적어둔 강사미팅 메모는 날짜를 알 수 없으므로 따로 모아 알린다
        for (let c = lastCol + 1; c <= range.e.c; c++) {
          const cell = at(r, c);
          if (!cell || cell.t !== "s" || typeof cell.v !== "string") continue;
          const text = cell.v.replace(/\s+/g, " ").trim();
          if (text.replace(/\s/g, "").includes("강사미팅")) {
            outsideGrid.push({ sheet: sheetName, cell: XLSX.utils.encode_cell({ r, c }), text });
          }
        }

        const slotTime = timeFromSlot(at(r, 1)?.v); // B열 시간대 (절대 좌표)
        for (let c = 2; c <= lastCol; c++) {        // C열부터 표 끝까지
          const cell = at(r, c);
          if (!cell || cell.t !== "s" || typeof cell.v !== "string") continue;
          const text = cell.v.replace(/\s+/g, " ").trim();
          if (!text.replace(/\s/g, "").includes("강사미팅")) continue;

          // 열 → 날짜 (해당 열 이하의 마지막 날짜 헤더가 그 날의 칸)
          let date = "";
          for (const hc of h.cols) {
            if (c >= hc.col) date = hc.date;
            else break;
          }
          if (!date) continue;

          const addr = XLSX.utils.encode_cell({ r, c });
          out.push({
            source_key: `${sheetName}!${addr}`,
            sheet: sheetName,
            cell: addr,
            event_date: date,
            event_time: timeFromText(text) || slotTime,
            event_type: text.includes("킥오프") ? "킥오프" : "강사미팅",
            meeting_mode: text.includes("대면") ? "대면" : text.includes("줌") ? "줌" : "",
            protocol: /의전\s*[OＯ오]/.test(text) ? "O" : /의전\s*[XＸ엑]/.test(text) ? "X" : "",
            display_name: extractDisplayName(text),
            raw_text: text,
          });
        }
      }
    });
  }

  return {
    events: out.sort((a, b) =>
      (a.event_date + a.event_time).localeCompare(b.event_date + b.event_time)),
    outsideGrid,
  };
}

/** 다운로드 + 파싱 */
export async function fetchTimetableEvents(): Promise<ParseResult> {
  return parseTimetable(await downloadTimetable());
}
