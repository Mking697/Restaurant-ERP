import { protectedPage } from "@/components/protected-page";
import { readBranding } from "@/lib/server/branding";
import PageContent from "./page-content";
export const dynamic = "force-dynamic";
export default async function RestaurantSettingsPage() {
 return protectedPage("/admin/settings/restaurant", async () => <PageContent initial={await readBranding()} />);
}
