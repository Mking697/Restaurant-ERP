import { protectedPage } from "@/components/protected-page";
import type { Metadata } from "next";
import PageContent from "./page-content";

export const metadata: Metadata = { manifest: "/api/pwa/waiter", appleWebApp: { capable: true, statusBarStyle: "default", title: "Waiter" } };
// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
export const dynamic = "force-dynamic";
export default async function Page() {
  return protectedPage("/waiter", () => <PageContent />);
}
