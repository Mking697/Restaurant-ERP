import { protectedPage } from "@/components/protected-page";
import type { Metadata } from "next";
import PageContent from "./page-content";

export const metadata: Metadata = { manifest: "/api/pwa/pos", appleWebApp: { capable: true, statusBarStyle: "default", title: "POS" } };
// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
export const dynamic = "force-dynamic";
export default async function Page() {
  return protectedPage("/pos", () => <PageContent />);
}
