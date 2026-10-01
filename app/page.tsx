import { requireChatGPTUser } from "./chatgpt-auth";
import { StudyDashboard } from "@/components/study-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <StudyDashboard displayName={user.displayName} />;
}
