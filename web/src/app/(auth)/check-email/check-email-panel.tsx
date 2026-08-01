"use client";

import { useActionState, useEffect } from "react";
import { resendConfirmationAction, type FormState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export function CheckEmailPanel({ email }: { email: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(resendConfirmationAction, {});
  const toast = useToast();

  useEffect(() => {
    if (state.ok) toast("If that address needs confirming, a new link is on its way.");
  }, [state, toast]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="label">Didn&apos;t arrive?</p>
      <input type="hidden" name="email" value={email} />
      <SubmitButton className="btn btn-ghost self-start" pendingLabel="Sending">
        Resend invitation
      </SubmitButton>
    </form>
  );
}
