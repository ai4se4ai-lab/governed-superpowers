import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Governed-Superpowers" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { confirmed } = await searchParams;
  return <LoginForm confirmed={confirmed === "1"} />;
}
