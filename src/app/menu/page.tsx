import { protectedPage } from "@/components/protected-page";
import PageContent from "./page-content";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
export const dynamic = "force-dynamic";
export default async function Page() {
  return protectedPage("/menu", () => <PageContent />);
}
