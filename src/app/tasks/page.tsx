import { protectedPage } from "@/components/protected-page";
import PageContent from "./page-content";

export const dynamic = "force-dynamic";
export default async function Page() {
  return protectedPage("/tasks", () => <PageContent />);
}
