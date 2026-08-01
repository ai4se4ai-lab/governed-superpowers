import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  redirect((await getCurrentUser()) ? "/dashboard" : "/login");
}
