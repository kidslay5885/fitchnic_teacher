"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LOGIN_PASSWORD } from "@/lib/constants";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleLogin = () => {
    if (pw === LOGIN_PASSWORD) {
      document.cookie = "outreach_auth=authenticated; path=/; max-age=604800";
      router.push("/");
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[380px]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">핏크닉 강사 아웃리치 매니저</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            비밀번호를 입력하세요
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="flex flex-col gap-3"
          >
            <Input
              type="password"
              placeholder="비밀번호"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setError(false);
              }}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">
                비밀번호가 올바르지 않습니다.
              </p>
            )}
            <Button type="submit" className="w-full">
              로그인
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
