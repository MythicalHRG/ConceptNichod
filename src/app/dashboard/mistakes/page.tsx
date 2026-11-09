import { MistakeNotebook } from "@/components/mistakes/mistake-notebook";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mistake Notebook | ConceptNichod",
  description: "Log blunders, conceptual slips, review takeaways, and drill diagnostic quizzes.",
};

export default function MistakesPage() {
  return <MistakeNotebook />;
}
