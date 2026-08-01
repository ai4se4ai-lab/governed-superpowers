"use client";

import { useActionState, useEffect, useState } from "react";
import { updateProfileAction, type ProfileState } from "@/app/actions/profile";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

type ProfileValues = {
  username: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export function ProfileForm({ user }: { user: ProfileValues }) {
  const [state, formAction] = useActionState<ProfileState, FormData>(updateProfileAction, {});
  const [values, setValues] = useState<ProfileValues>(user);
  const toast = useToast();

  const errors = state.errors ?? {};
  const dirty = (Object.keys(values) as Array<keyof ProfileValues>).some(
    (key) => values[key] !== user[key],
  );

  useEffect(() => {
    if (state.message) toast(state.message);
  }, [state, toast]);

  function set(key: keyof ProfileValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset className="panel ticked flex flex-col gap-5 p-6">
        <legend className="label px-2">Account</legend>

        <Field
          label="Username"
          name="username"
          value={values.username}
          onChange={set("username")}
          autoComplete="username"
          required
          error={errors.username}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          value={values.email}
          onChange={set("email")}
          autoComplete="email"
          required
          error={errors.email}
          hint={
            values.email !== user.email
              ? "We'll email the new address a confirmation link. Until you click it, you keep signing in with the old one."
              : "Changing this requires confirming the new address."
          }
        />

        {state.emailPending ? (
          <p
            className="flex items-start gap-2.5 border-l-2 px-3 py-2 text-[12px] leading-relaxed"
            style={{ borderColor: "var(--live)", background: "var(--signal-wash)" }}
            role="status"
          >
            <span
              aria-hidden
              className="dot-live mt-[5px] h-[6px] w-[6px] shrink-0"
              style={{ background: "var(--live)" }}
            />
            Confirmation sent to {state.emailPending}. The change applies once you click the link —
            you&apos;ll be signed out of all sessions at that point.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="panel ticked grid gap-5 p-6 sm:grid-cols-2">
        <legend className="label px-2">Address</legend>

        <div className="sm:col-span-2">
          <Field
            label="Address line 1"
            name="addressLine1"
            value={values.addressLine1}
            onChange={set("addressLine1")}
            autoComplete="address-line1"
            placeholder="221B Baker Street"
            error={errors.addressLine1}
          />
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Address line 2"
            name="addressLine2"
            value={values.addressLine2}
            onChange={set("addressLine2")}
            autoComplete="address-line2"
            placeholder="Apartment, suite, unit"
            error={errors.addressLine2}
          />
        </div>

        <Field
          label="City"
          name="city"
          value={values.city}
          onChange={set("city")}
          autoComplete="address-level2"
          error={errors.city}
        />
        <Field
          label="State / region"
          name="region"
          value={values.region}
          onChange={set("region")}
          autoComplete="address-level1"
          error={errors.region}
        />
        <Field
          label="Postal code"
          name="postalCode"
          value={values.postalCode}
          onChange={set("postalCode")}
          autoComplete="postal-code"
          error={errors.postalCode}
        />
        <Field
          label="Country"
          name="country"
          value={values.country}
          onChange={set("country")}
          autoComplete="country-name"
          error={errors.country}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="btn btn-primary" pendingLabel="Saving">
          Save changes
        </SubmitButton>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setValues(user)}
          disabled={!dirty}
        >
          Reset
        </button>
        <span className="label" aria-live="polite">
          {dirty ? "· unsaved changes" : ""}
        </span>
      </div>
    </form>
  );
}
