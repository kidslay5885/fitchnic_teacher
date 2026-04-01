import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { password } = await req.json();
  const correct = process.env.AUTH_PASSWORD;

  if (!correct || password !== correct) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
