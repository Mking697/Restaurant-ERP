import { redirect } from "next/navigation";
import { protectedPage } from "@/components/protected-page";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
export const dynamic = "force-dynamic";
export default async function Home() {
  return protectedPage("/", () => redirect("/dashboard"));
}
