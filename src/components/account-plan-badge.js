"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";

export default function AccountPlanBadge({ tier, expiresAt, userWorkspace = false }) {
  const [activeTier, setActiveTier] = useState(null);

  useEffect(() => {
    let timeout;
    const updateTier = () => {
      const remaining = expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0;
      startTransition(() => {
        setActiveTier(remaining > 0 ? tier : "free");
      });
      if (remaining > 0) timeout = setTimeout(updateTier, Math.min(remaining, 2147483647));
    };

    updateTier();
    return () => clearTimeout(timeout);
  }, [expiresAt, tier]);

  const className = userWorkspace
    ? "rounded-full border border-[#dce4dc] bg-[#f4f6f1] px-2.5 py-2 text-[10px] font-bold capitalize text-[#245c55] hover:bg-[#edf4eb] sm:text-xs"
    : "rounded-full border border-[#dce4dc] bg-[#f4f6f1] px-3 py-2 text-xs font-bold capitalize text-[#245c55] hover:bg-[#edf4eb]";

  return (
    <Link className={className} href="/account-plan">
      {activeTier || "Account plan"}{activeTier && (userWorkspace ? "" : " plan")}
    </Link>
  );
}
