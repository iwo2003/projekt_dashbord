import { SklepReturn } from "@/components/sklep-return";

export const dynamic = "force-dynamic";

export default async function ShopReturnPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const params = await searchParams;
  return <SklepReturn orderId={params.order ?? ""} />;
}
