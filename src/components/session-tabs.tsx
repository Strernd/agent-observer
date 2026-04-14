"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["summary", "decisions", "friction", "events"] as const;

export function SessionTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentTab = searchParams.get("tab") ?? "summary";

  function setTab(tab: string | number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", String(tab));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={currentTab} onValueChange={setTab}>
      <TabsList variant="line" className="w-full justify-start">
        {TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab} className="capitalize text-[13px]">
            {tab}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
