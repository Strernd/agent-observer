import { StatsPage } from "@/components/stats-page";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <StatsPage searchParams={searchParams} />;
}
