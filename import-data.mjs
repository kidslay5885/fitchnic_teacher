import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const SUPABASE_URL = "https://qtjovidfuxlwqzsgczvm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0am92aWRmdXhsd3F6c2djenZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTExMDY0NCwiZXhwIjoyMDkwNjg2NjQ0fQ.QUAciM2aovuFVVNoErWLdWzru-Gs1GIWTmHl8Ja8TYk";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const wb = XLSX.readFile("C:/Users/User/Downloads/강사 모집 TOOL 리뉴얼 (최종).xlsx");

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function excelDate(v) {
  if (!v) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return str(v);
}

async function insertBatch(table, rows, batchSize = 200) {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(batch);
    if (error) {
      console.error(`  Error at batch ${i}: ${error.message}`);
      // 하나씩 시도
      for (const row of batch) {
        const { error: e2 } = await sb.from(table).insert(row);
        if (e2) console.error(`  Skip: ${row.name || row.applicant_name || "?"} - ${e2.message}`);
        else total++;
      }
    } else {
      total += batch.length;
    }
  }
  return total;
}

// ============ 1. 강사모집 시트 ============
async function importMainSheet() {
  console.log("\n=== 강사모집 시트 임포트 ===");
  const data = XLSX.utils.sheet_to_json(wb.Sheets["강사모집"], { header: 1 });
  // 헤더: row[0] = [ㅜ, 상태, 제외/보류사유, 분야, 담당자, 강사이름, 참조링크, 강의이력여부, 강의플랫폼, 유튜브, 인스타, 이메일, 비고, null, 발송채널, DM, 메일, 1차발송일, 1차결과, 2차발송일, 2차결과, 3차발송일, 3차결과, 최종상태, 미팅메모, 비고]
  const rows = [];
  const waveRows = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const name = str(r[5]);
    if (!name) continue;

    const id = crypto.randomUUID();
    rows.push({
      id,
      name,
      status: str(r[1]) || "미검토",
      exclude_reason: str(r[2]),
      field: str(r[3]),
      assignee: str(r[4]),
      ref_link: str(r[6]),
      has_lecture_history: str(r[7]),
      lecture_platform: str(r[8]),
      youtube: str(r[9]),
      instagram: str(r[10]),
      email: str(r[11]),
      notes: str(r[12]) || str(r[25]),
      outreach_channel: str(r[14]),
      dm_sent: r[15] === 1 || r[15] === true || str(r[15]) === "O",
      email_sent: r[16] === 1 || r[16] === true || str(r[16]) === "O",
      final_status: str(r[23]),
      meeting_memo: str(r[24]),
      source: "강사모집",
    });

    // 1~3차 발송
    for (let w = 0; w < 3; w++) {
      const dateCol = 17 + w * 2;
      const resultCol = 18 + w * 2;
      const sentDate = excelDate(r[dateCol]);
      const result = str(r[resultCol]);
      if (sentDate || result) {
        waveRows.push({
          instructor_id: id,
          wave_number: w + 1,
          sent_date: sentDate,
          result,
        });
      }
    }
  }

  console.log(`  Parsed ${rows.length} instructors, ${waveRows.length} waves`);
  const n = await insertBatch("instructors", rows);
  console.log(`  Inserted ${n} instructors`);
  if (waveRows.length) {
    const wn = await insertBatch("outreach_waves", waveRows);
    console.log(`  Inserted ${wn} waves`);
  }
}

// ============ 2. 콘텐츠팀 개별 컨택 ============
async function importContentTeam() {
  console.log("\n=== 콘텐츠팀 개별 컨택 임포트 ===");
  const data = XLSX.utils.sheet_to_json(wb.Sheets["콘텐츠팀 개별 컨택"], { header: 1 });
  // 헤더: No, 상태, 분야, (담당자), 강사명, 유튜브, 인스타, 이메일, (비고), 발송채널, DM, 이메일, 1차발송일, 1차결과, 2차발송일, 2차결과, 3차발송일, 3차결과, 최종상태, 미팅메모, 비고
  const rows = [];
  const waveRows = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const name = str(r[4]);
    if (!name) continue;

    const id = crypto.randomUUID();
    rows.push({
      id,
      name,
      status: str(r[1]) || "미검토",
      field: str(r[2]),
      assignee: str(r[3]),
      youtube: str(r[5]),
      instagram: str(r[6]),
      email: str(r[7]),
      notes: str(r[8]) || str(r[20]),
      outreach_channel: str(r[9]),
      dm_sent: r[10] === 1 || r[10] === true,
      email_sent: r[11] === 1 || r[11] === true,
      final_status: str(r[18]),
      meeting_memo: str(r[19]),
      source: "콘텐츠팀",
    });

    for (let w = 0; w < 3; w++) {
      const dateCol = 12 + w * 2;
      const resultCol = 13 + w * 2;
      const sentDate = excelDate(r[dateCol]);
      const result = str(r[resultCol]);
      if (sentDate || result) {
        waveRows.push({
          instructor_id: id,
          wave_number: w + 1,
          sent_date: sentDate,
          result,
        });
      }
    }
  }

  console.log(`  Parsed ${rows.length} instructors, ${waveRows.length} waves`);
  const n = await insertBatch("instructors", rows);
  console.log(`  Inserted ${n} instructors`);
  if (waveRows.length) {
    const wn = await insertBatch("outreach_waves", waveRows);
    console.log(`  Inserted ${wn} waves`);
  }
}

// ============ 3. 미팅 예정 — 기존 강사에 meeting_date 업데이트 ============
async function importMeetings() {
  console.log("\n=== 미팅 예정 업데이트 ===");
  const data = XLSX.utils.sheet_to_json(wb.Sheets["미팅 예정"], { header: 1 });
  // 헤더: No, 담당자, 강사명, 분야, 미팅일정, SNS, 상태, 강사정보, 특이사항
  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const name = str(r[2]);
    if (!name) continue;

    const meetingDate = str(r[4]);
    const instructorInfo = str(r[7]);
    const notes = str(r[8]);

    // 이름으로 매칭
    const { data: matches } = await sb
      .from("instructors")
      .select("id")
      .eq("name", name)
      .limit(1);

    if (matches && matches.length > 0) {
      await sb.from("instructors").update({
        meeting_date: meetingDate,
        instructor_info: instructorInfo,
        notes: notes || undefined,
      }).eq("id", matches[0].id);
      updated++;
    } else {
      // 미팅 예정에만 있는 강사 → 새로 추가
      await sb.from("instructors").insert({
        name,
        assignee: str(r[1]),
        field: str(r[3]),
        meeting_date: meetingDate,
        status: str(r[6]) || "진행 중",
        instructor_info: instructorInfo,
        notes,
        source: "강사모집",
      });
      updated++;
    }
  }
  console.log(`  Updated/added ${updated} meetings`);
}

// ============ 4. 연락금지 ============
async function importBanned() {
  console.log("\n=== 연락금지 임포트 ===");
  const data = XLSX.utils.sheet_to_json(wb.Sheets["연락금지"], { header: 1 });
  // row 16: 헤더 [강사명(활동명), 소속플랫폼, 사유, null, 인스타ID, 닉네임]
  // row 17+: 데이터
  let count = 0;
  for (let i = 17; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const name = str(r[0]);
    if (!name) continue;

    const banReason = str(r[2]) || str(r[1]);

    // 기존 강사 매칭
    const { data: matches } = await sb
      .from("instructors")
      .select("id")
      .eq("name", name)
      .limit(1);

    if (matches && matches.length > 0) {
      await sb.from("instructors").update({
        is_banned: true,
        ban_reason: banReason,
      }).eq("id", matches[0].id);
    } else {
      await sb.from("instructors").insert({
        name,
        lecture_platform: str(r[1]),
        is_banned: true,
        ban_reason: banReason,
        source: "강사모집",
        status: "제외",
        exclude_reason: "연락금지",
      });
    }
    count++;
  }
  console.log(`  Processed ${count} banned instructors`);
}

// ============ 5. 지원서 (5개 시트) ============
async function importApplications() {
  console.log("\n=== 지원서 임포트 ===");
  const sheets = [
    { name: "핏크닉메타", platform: "핏크닉메타", headerRow: 3 },
    { name: "핏크닉홈", platform: "핏크닉홈", headerRow: 3 },
    { name: "머니업홈", platform: "머니업홈", headerRow: 3 },
    { name: "핏크닉카", platform: "핏크닉카", headerRow: 3 },
    { name: "머니업카", platform: "머니업카", headerRow: 3 },
  ];

  for (const sheet of sheets) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheet.name], { header: 1 });
    // 핏크닉메타 헤더 (row3): NO, 날짜, 이름, 강사명(활동명), 연락처, 강의경험, 온오프, 지원동기, 강의주제, 경력성과, 수강생이얻는것, 소셜미디어, 소셜링크, 검토여부
    // row4: NO, #REF!, null... null, 검토상태  (실제 데이터 row5+)
    const rows = [];
    const startRow = 5; // 데이터 시작

    for (let i = startRow; i < data.length; i++) {
      const r = data[i];
      if (!r) continue;
      const applicantName = str(r[2]);
      if (!applicantName) continue;

      rows.push({
        source_platform: sheet.platform,
        applicant_name: applicantName,
        activity_name: str(r[3]),
        contact: str(r[4]),
        experience: str(r[5]),
        motivation: str(r[7]),
        topic: str(r[8]),
        career: str(r[9]),
        student_benefits: str(r[10]),
        sns_link: str(r[12]),
        review_status: str(r[13]) === "확인완료" ? "확인완료" : "미확인",
      });
    }

    if (rows.length > 0) {
      const n = await insertBatch("applications", rows);
      console.log(`  ${sheet.platform}: ${n}건`);
    } else {
      console.log(`  ${sheet.platform}: 0건 (데이터 없음)`);
    }
  }
}

// ============ 실행 ============
async function main() {
  console.log("=== 데이터 임포트 시작 ===");

  await importMainSheet();
  await importContentTeam();
  await importMeetings();
  await importBanned();
  await importApplications();

  console.log("\n=== 임포트 완료 ===");

  // 최종 카운트
  const { count: ic } = await sb.from("instructors").select("*", { count: "exact", head: true });
  const { count: wc } = await sb.from("outreach_waves").select("*", { count: "exact", head: true });
  const { count: ac } = await sb.from("applications").select("*", { count: "exact", head: true });
  const { count: bc } = await sb.from("instructors").select("*", { count: "exact", head: true }).eq("is_banned", true);
  console.log(`강사: ${ic}, 발송기록: ${wc}, 지원서: ${ac}, 연락금지: ${bc}`);
}

main().catch(console.error);
