const API_URL = "https://fitchnic-teacher.vercel.app/api/applications";

function onFormSubmit(e) {
  const v = e.values;
  // v[0]: 시트 타임스탬프 (실제 폼 제출 시간)
  // 폼이 짧음 — 6개 질문만 존재
  const ts = v[0] ? new Date(v[0]) : null;
  const submittedAt = ts && !isNaN(ts.getTime()) ? ts.toISOString() : new Date().toISOString();

  const payload = {
    source_platform: "대표님SNS",
    applicant_name: v[1] || "",       // 1. 성함
    activity_name: v[2] || "",        // 2. 강사명(활동명/닉네임)
    contact: v[3] || "",              // 3. 연락처
    experience: v[4] || "",           // 4. 강의 경험(다른 사이트 혹은 강의 진행)
    topic: v[5] || "",                // 5. 강의 주제
    sns_link: v[6] || "",             // 6. SNS 링크
    motivation: "",
    career: "",
    student_results: "",
    student_benefits: "",
    lecture_format: "",
    sns_types: "",
    review_status: "미확인",
    submitted_at: submittedAt,
  };

  UrlFetchApp.fetch(API_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// 기존 DB의 submitted_at을 시트 타임스탬프로 패치하는 SQL 생성 (1회 실행)
// 실행 후 Drive에 .sql 파일이 생성됨 — 파일 열어 SQL 복사 후 Supabase SQL Editor에 붙여넣기
function generatePatchSQL() {
  const CHANNEL = "대표님SNS";
  const NAME_IDX = 1;     // 1. 성함
  const CONTACT_IDX = 3;  // 3. 연락처
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const rows = [];
  const seen = {};
  const dups = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ts = row[0];
    const name = String(row[NAME_IDX] || "").trim();
    const contact = String(row[CONTACT_IDX] || "").trim();
    if (!(ts instanceof Date) || !name) continue;
    const key = name + "|" + contact;
    if (seen[key]) dups.push(key);
    seen[key] = true;
    rows.push("  (" + sqlEsc(name) + ", " + sqlEsc(contact) + ", '" + ts.toISOString() + "')");
  }
  const sql =
    "-- " + CHANNEL + " (" + rows.length + "건)\n" +
    "UPDATE applications a SET submitted_at = v.ts::timestamptz\n" +
    "FROM (VALUES\n" + rows.join(",\n") + "\n) AS v(name, contact, ts)\n" +
    "WHERE a.source_platform = '" + CHANNEL + "'\n" +
    "  AND a.applicant_name = v.name\n" +
    "  AND a.contact = v.contact;\n";
  const file = DriveApp.createFile("patch-submitted-at-" + CHANNEL + ".sql", sql);
  Logger.log("SQL 파일: " + file.getUrl());
  if (dups.length > 0) Logger.log("중복 (동일 이름+연락처) " + dups.length + "건: " + dups.join(", "));
  Logger.log(sql);
}

function sqlEsc(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// 기존 데이터 일괄 등록 (1회만 실행)
function importAll() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const values = row.map(function(cell, idx) {
      if (idx === 0 && cell instanceof Date) return cell.toISOString();
      return String(cell);
    });
    onFormSubmit({ values: values });
    Utilities.sleep(200);
    Logger.log("Row " + (i + 1) + " 완료");
  }
  Logger.log("전체 " + (data.length - 1) + "건 완료");
}

// ── 누락분만 보충 등록 (트리거 중단 기간 복구용) ──
// DB에 이미 있는 이 채널의 최신 제출일 이후 행만 다시 전송한다.
// 중복 없이 안전하며, 다시 실행해도 추가 등록되지 않는다.
function importMissing() {
  const CHANNEL = "대표님SNS"; // 이 스크립트의 채널명 (source_platform과 동일)

  // 1) DB에서 이 채널의 최신 제출일 조회
  const res = UrlFetchApp.fetch(API_URL, { method: "get", muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log("DB 조회 실패: " + res.getResponseCode() + " " + res.getContentText());
    return;
  }
  const all = JSON.parse(res.getContentText());
  let cutoff = 0;
  for (let j = 0; j < all.length; j++) {
    if (all[j].source_platform !== CHANNEL || !all[j].submitted_at) continue;
    const t = new Date(all[j].submitted_at).getTime();
    if (t > cutoff) cutoff = t;
  }
  Logger.log(CHANNEL + " DB 최신 제출일: " + (cutoff ? new Date(cutoff).toISOString() : "(없음 — 전체 등록)"));

  // 2) 시트에서 cutoff 이후 행만 재전송
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  let sent = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ts = row[0];
    if (!(ts instanceof Date) || isNaN(ts.getTime())) continue;
    if (ts.getTime() <= cutoff) continue; // 이미 등록됨 → skip
    const values = row.map(function(cell, idx) {
      if (idx === 0 && cell instanceof Date) return cell.toISOString();
      return String(cell);
    });
    onFormSubmit({ values: values });
    Utilities.sleep(200);
    sent++;
    Logger.log("등록: row " + (i + 1) + " (" + ts.toISOString() + ")");
  }
  Logger.log("완료: " + CHANNEL + " 신규 " + sent + "건 등록");
}
