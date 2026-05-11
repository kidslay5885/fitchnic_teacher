const API_URL = "https://fitchnic-teacher.vercel.app/api/applications";

function onFormSubmit(e) {
  const v = e.values;
  // v[0]: 타임스탬프
  // 폼이 짧음 — 6개 질문만 존재

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
    submitted_at: new Date().toISOString(),
  };

  UrlFetchApp.fetch(API_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
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
