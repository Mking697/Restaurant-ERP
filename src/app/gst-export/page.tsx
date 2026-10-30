import { redirect } from "next/navigation";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
export const dynamic = "force-dynamic";
export default function Page() {
  // GSTR-1 export now lives inside /accounts as its own tab, not a
  // standalone nav item — redirect any old link/bookmark there.
  redirect("/accounts");
}
