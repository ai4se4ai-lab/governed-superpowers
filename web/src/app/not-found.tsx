import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="label">Error 404</p>
      <h1
        className="text-[clamp(2.5rem,8vw,4.5rem)] font-extrabold leading-none tracking-[-0.04em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        No such route
      </h1>
      <p className="max-w-sm text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        Nothing is mounted here. If you followed a confirmation link, check it wasn&apos;t wrapped
        across two lines in your mail client.
      </p>
      <Link href="/" className="btn btn-primary">
        Back to the console
      </Link>
    </main>
  );
}
