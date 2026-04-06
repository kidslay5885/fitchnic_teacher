import { getSupabase } from "@/lib/supabase";

interface LogParams {
  actionType: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  detail?: string;
  performedBy?: string;
}

/**
 * 활동 로그를 activity_logs 테이블에 삽입한다.
 * 실패해도 메인 로직에 영향을 주지 않도록 에러를 무시한다.
 */
export async function logActivity(params: LogParams) {
  try {
    const sb = getSupabase();
    await sb.from("activity_logs").insert({
      action_type: params.actionType,
      target_type: params.targetType,
      target_id: params.targetId || "",
      target_name: params.targetName || "",
      detail: params.detail || "",
      performed_by: params.performedBy || "",
    });
  } catch {
    // 로그 실패가 메인 로직을 막지 않도록
  }
}
