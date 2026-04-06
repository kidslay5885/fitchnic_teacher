const API_URL = "https://fitchnic-teacher.vercel.app/api/applications";

function onFormSubmit(e) {
  const v = e.values;
  // v[0]: 타임스탬프

  const payload = {
    source_platform: "핏크닉메타",
    applicant_name: v[1] || "",       // 1. 성함
    activity_name: v[2] || "",        // 2. 강사명
    contact: v[3] || "",              // 3. 연락처
    experience: v[4] || "",           // 4. 강의 경험
    lecture_format: v[5] || "",       // 5. 강의 형태
    motivation: v[6] || "",           // 6. 지원 동기
    topic: v[7] || "",               // 7. 강의 주제
    career: v[8] || "",              // 8. 경력/성과
    student_benefits: v[9] || "",     // 9. 수강생이 얻는 것
    sns_types: v[10] || "",           // 10. SNS 종류
    sns_link: v[11] || "",            // 11. SNS 링크
    student_results: "",
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
    // 타임스탬프를 ISO 형식으로 변환 후 나머지는 문자열로
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
