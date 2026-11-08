import { StudyGroupsHub } from "@/components/study-groups/study-groups-hub";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Study Groups & Native Chat | Concepts Nichod",
  description: "Collaborative study circles and server-time verified discussions.",
};

export default function StudyGroupsPage() {
  return <StudyGroupsHub />;
}
