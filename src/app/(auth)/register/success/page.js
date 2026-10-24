import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";

export const metadata = {
  title: "Account created | KURO",
};

export default function RegisterSuccessPage({ searchParams }) {
  return (
    <Suspense>
      <RegisterSuccessContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RegisterSuccessContent({ searchParams }) {
  const { email } = await searchParams;
  const emailText = typeof email === "string" ? email : "";

  return (
    <main className="grid min-h-screen bg-[#f8f8f4] text-[#173d39] lg:grid-cols-[minmax(0,0.95fr)_minmax(480px,1.05fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#142d2a] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-label="Guests gathering at a live event"
          className="absolute inset-0 bg-cover bg-center opacity-35"
          role="img"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1600&q=85)" }}
        />
        <div className="absolute inset-0 bg-linear-to-b from-[#10201e]/65 via-[#10201e]/25 to-[#10201e]/90" />
        <Link className="relative inline-flex items-center gap-3 text-sm font-black tracking-[0.12em] text-white" href="/">
          <span className="flex size-10 items-center justify-center rounded-md bg-white p-1">
            <Image alt="" aria-hidden="true" className="size-full object-contain" height={40} priority src="/kuro logo-edited.png" unoptimized width={40} />
          </span>
          KURO
        </Link>
        <div className="relative max-w-xl pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffcf72]">Events, people, all in one place</p>
          <h2 className="mt-5 text-4xl font-bold leading-tight xl:text-5xl">Bring your next gathering into focus.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/80">
            A clearer workspace for the details, people, and moments that make an event matter.
          </p>
        </div>
        <p className="relative text-xs text-white/65">Built for event teams in the Philippines.</p>
      </aside>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <Link className="inline-flex items-center gap-2.5 text-sm font-black tracking-widest text-[#173d39] lg:invisible" href="/">
            <span className="flex size-9 items-center justify-center rounded-md border border-[#dfe7df] bg-white p-0.5">
              <Image alt="" aria-hidden="true" className="size-full object-contain" height={36} priority src="/kuro logo-edited.png" unoptimized width={36} />
            </span>
            KURO
          </Link>
          <Link className="ml-auto text-sm font-semibold text-[#526864] hover:text-[#d6533d]" href="/">
            Back to home <span aria-hidden="true" className="ml-1">&#8599;</span>
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Check your inbox</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#173d39] sm:text-4xl">Account created</h1>
          <p className="mx-auto mt-3 max-w-sm rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900" role="status">
            Account created. Check your email for a verification link before signing in.
          </p>
          {emailText && (
            <p className="mt-4 text-sm leading-6 text-[#647771]">
              We sent a verification link to <span className="font-semibold text-[#173d39]">{emailText}</span>.
              Click the link in that email and you will be redirected to sign in.
            </p>
          )}
          {!emailText && (
            <p className="mt-4 text-sm leading-6 text-[#647771]">
              Click the verification link in your email and you will be redirected to sign in.
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3">
            <Link
              className="w-full rounded-md bg-[#ed6148] px-4 py-3.5 text-center text-sm font-bold text-white transition hover:bg-[#d74d37]"
              href="/login"
            >
              Go to sign in <span aria-hidden="true" className="ml-2">&#8594;</span>
            </Link>
            <Link className="text-sm font-semibold text-[#245c55] hover:text-[#d6533d]" href="/register">
              Back to create account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
