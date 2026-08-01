import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile · Governed-Superpowers" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="stagger flex flex-col gap-8">
      <section>
        <p className="label">Profile</p>
        <h1
          className="mt-2 text-[clamp(1.9rem,4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your details
        </h1>
      </section>

      <ProfileForm
        user={{
          username: user.username,
          email: user.email,
          addressLine1: user.addressLine1 ?? "",
          addressLine2: user.addressLine2 ?? "",
          city: user.city ?? "",
          region: user.region ?? "",
          postalCode: user.postalCode ?? "",
          country: user.country ?? "",
        }}
      />
    </div>
  );
}
