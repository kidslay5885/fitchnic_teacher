const API_URL = "https://fitchnic-teacher.vercel.app/api/applications";

function onFormSubmit(e) {
  const v = e.values;
  // v[0]: 타임스탬프
  // v[1]: 이메일 주소 (핏크닉홈 폼만 이메일 수집이 켜져 있어서 한 칸씩 밀림)

  const payload = {
    source_platform: "핏크닉홈",
    applicant_name: v[2] || "",       // 2. 이름
    activity_name: v[3] || "",        // 3. 강사명
    contact: v[4] || "",              // 4. 연락처
    experience: v[5] || "",           // 5. 강의 경험
    topic: v[6] || "",                // 6. 강의 주제
    motivation: v[7] || "",           // 7. 지원 동기
    career: v[8] || "",               // 8. 경력/성과
    student_results: v[9] || "",      // 9. 수강생 성과 경험
    student_benefits: v[10] || "",    // 10. 수강생이 얻는 것
    sns_link: v[11] || "",            // 11. 개인 SNS 채널 링크
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
