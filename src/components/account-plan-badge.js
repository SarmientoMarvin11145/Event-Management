"use client";

import Link from "next/link";

export default function AccountPlanBadge({ userWorkspace = false }) {
  const className = userWorkspace
    ? "rounded-full border border-[#dce4dc] bg-[#f4f6f1] px-2.5 py-2 text-[10px] font-bold capitalize text-[#245c55] hover:bg-[#edf4eb] sm:text-xs"
    : "rounded-full border border-[#dce4dc] bg-[#f4f6f1] px-3 py-2 text-xs font-bold capitalize text-[#245c55] hover:bg-[#edf4eb]";

  return (
    <Link className={className} href="/account-plan">
      Free account
    </Link>
  );
}
