import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard | ConceptNichod",
  description: "Aspirant learning velocity and performance rankings.",
};

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
