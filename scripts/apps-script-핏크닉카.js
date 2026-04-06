const API_URL = "https://fitchnic-teacher.vercel.app/api/applications";

function onFormSubmit(e) {
  const v = e.values;
  // v[0]: 타임스탬프

  const payload = {
    source_platform: "핏크닉카",
    applicant_name: v[1] || "",       // 1. 성함
    activity_name: v[2] || "",        // 2. 강사명
    contact: v[3] || "",              // 3. 연락처
    experience: v[4] || "",           // 4. 강의 경험
    topic: v[5] || "",               // 5. 강의 주제
    motivation: v[6] || "",           // 6. 지원 동기
    career: v[7] || "",              // 7. 경력/성과
    student_results: v[8] || "",      // 8. 수강생 성과 경험
    student_benefits: v[9] || "",     // 9. 수강생이 얻는 것
    sns_link: v[10] || "",            // 10. SNS 링크
    lecture_format: "",
    sns_types: "",
    review_status: "미확인",
    submitted_at: new Date(v[0]).toISOString(),
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
    onFormSubmit({ values: data[i].map(String) });
    Utilities.sleep(200);
    Logger.log("Row " + (i + 1) + " 완료");
  }
  Logger.log("전체 " + (data.length - 1) + "건 완료");
}
