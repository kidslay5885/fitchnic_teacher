import { NextResponse } from "next/server";
import { listGmailAccounts } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// GET /api/gmail-accounts
// 발송 모달의 계정 선택 드롭다운에서 사용. refresh_token 자체는 노출하지 않고
// 존재 여부(authenticated)만 내려준다.
export async function GET() {
  try {
    const accounts = await listGmailAccounts();
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        label: a.label,
        is_default: a.is_default,
        is_cron_sender: a.is_cron_sender,
        authenticated: !!a.refresh_token,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
