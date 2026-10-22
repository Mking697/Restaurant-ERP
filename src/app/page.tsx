import { redirect } from "next/navigation";
import { protectedPage } from "@/components/protected-page";

export const dynamic = "force-dynamic";
export default async function Home() {
  return protectedPage("/", () => redirect("/dashboard"));
}
