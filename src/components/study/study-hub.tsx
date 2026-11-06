"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getStudyHubAction, saveStudyMaterialAction, deleteStudyMaterialAction, rateStudyMaterialAction, extractStudyMaterialsAction, createMockTestAction, submitMockTestAction, coachExamAnswerAction, explainAnotherWayAction, teachBackAction, saveConceptRelationAction, removeConceptRelationAction } from "@/app/actions/learning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, BrainCircuit, BookOpenCheck, Sparkles, AlertCircle } from "lucide-react";

type Material = {
  _id: string; kind: "formula" | "definition" | "mistake"; title: string; prompt: string; answer: string;
  reason?: string; topicId?: string; subject?: string; chapter?: string; dueAt: string; intervalDays: number;
  repetitions: number; lastReviewedAt?: string;
};
type Topic = { _id: string; name: string; subject: string; chapter: string; summary?: string };
type HubData = {
  cards: Material[];
  dueCards: Material[];
  attempts: Array<{ _id: string; kind: string; title: string; score: number; confidence?: number; createdAt: string }>;
  topics: Topic[];
  relations: Array<{ _id: string; fromTopicId: string; toTopicId: string; relation: "prerequisite" | "related" }>;
  recommendations: string[];
  timeline: Array<{ id: string; title: string; kind: string; score: number; confidence?: number; createdAt: string }>;
};
type MockTest = Awaited<ReturnType<typeof createMockTestAction>>;

const ratingOptions = ["again", "hard", "good", "easy"] as const;

export function StudyHub() {
  const { toast } = useToast();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [materialForm, setMaterialForm] = useState({ kind: "formula" as "formula" | "definition" | "mistake", title: "", prompt: "", answer: "", reason: "", topicId: "" });
  const [testForm, setTestForm] = useState({ subject: "", chapter: "", difficulty: "medium", count: 10 });
  const [test, setTest] = useState<MockTest | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [testResult, setTestResult] = useState<any>(null);
  const [coach, setCoach] = useState({ question: "", answer: "", subject: "", confidence: 3 });
  const [coachResult, setCoachResult] = useState<any>(null);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [explainMode, setExplainMode] = useState<"simple" | "analogy" | "worked-example" | "diagram">("simple");
  const [explanation, setExplanation] = useState<any>(null);
  const [teachText, setTeachText] = useState("");
  const [teachResult, setTeachResult] = useState<any>(null);
  const [mapFrom, setMapFrom] = useState("");
  const [mapTo, setMapTo] = useState("");
  const [mapKind, setMapKind] = useState<"prerequisite" | "related">("prerequisite");
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setData(await getStudyHubAction() as HubData); }
    catch (error: any) { toast({ variant: "destructive", title: "Could not load Study Hub", description: error.message }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!test || testResult || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [test, testResult, secondsLeft]);

  const topics = data?.topics || [];
  const filteredMaterials = useMemo(() => (data?.cards || []).filter((item) => `${item.title} ${item.prompt} ${item.answer} ${item.subject || ""}`.toLowerCase().includes(search.toLowerCase())), [data?.cards, search]);
  const due = data?.dueCards || [];

  const withWorking = async (task: () => Promise<void>) => {
    setWorking(true);
    try { await task(); }
    catch (error: any) { toast({ variant: "destructive", title: "Could not complete that action", description: error.message }); }
    finally { setWorking(false); }
  };

  const saveMaterial = () => withWorking(async () => {
    await saveStudyMaterialAction({ ...materialForm, topicId: materialForm.topicId || undefined });
    setMaterialForm({ ...materialForm, title: "", prompt: "", answer: "", reason: "" });
    toast({ title: "Saved to your study book" });
    await refresh();
  });

  const rate = (item: Material, rating: typeof ratingOptions[number]) => withWorking(async () => {
    const result = await rateStudyMaterialAction(item._id.toString(), rating);
    setRevealed(null);
    toast({ title: "Review scheduled", description: `Next review ${new Date(result.dueAt).toLocaleDateString()}.` });
    await refresh();
  });

  const extract = (topicId: string) => withWorking(async () => {
    const result = await extractStudyMaterialsAction(topicId);
    toast({ title: "Study book updated", description: `${result.count} formulas and definitions saved.` });
    await refresh();
  });

  const startTest = () => withWorking(async () => {
    const generated = await createMockTestAction({ subject: testForm.subject, chapter: testForm.chapter, difficulty: testForm.difficulty, questionCount: testForm.count });
    setTest(generated);
    setAnswers(generated.questions.map(() => ""));
    setConfidence(3);
    setTestResult(null);
    setSecondsLeft(generated.durationMinutes * 60);
  });

  const submitTest = () => withWorking(async () => {
    if (!test) return;
    const result = await submitMockTestAction({ testId: test.id, answers, confidence });
    setTestResult(result);
    setTest(null);
    toast({ title: "Mock test complete", description: `Score: ${result.score}%` });
    await refresh();
  });

  const coachAnswer = () => withWorking(async () => {
    const result = await coachExamAnswerAction(coach);
    setCoachResult(result);
    toast({ title: "Answer reviewed", description: `Score: ${result.score}%` });
    await refresh();
  });

  const explain = () => withWorking(async () => setExplanation(await explainAnotherWayAction({ topicId: selectedTopic, mode: explainMode })));
  const teachBack = () => withWorking(async () => {
    const result = await teachBackAction({ topicId: selectedTopic, explanation: teachText, confidence });
    setTeachResult(result);
    await refresh();
  });

  if (loading && !data) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-16">
      <header>
        <h1 className="text-3xl font-bold font-headline sm:text-4xl">Study Hub</h1>
        <p className="text-muted-foreground">Review, practice, and see what to work on next.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {(data?.recommendations || []).slice(0, 4).map((item, i) => <Card key={`${item}-${i}`}><CardContent className="flex items-start gap-3 p-4"><Sparkles className="mt-0.5 size-4 text-primary" /><p className="text-sm">{item}</p></CardContent></Card>)}
      </div>

      <Tabs defaultValue="review" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="review">Review ({due.length})</TabsTrigger><TabsTrigger value="book">Book</TabsTrigger><TabsTrigger value="tests">Mock tests</TabsTrigger><TabsTrigger value="coach">Answer coach</TabsTrigger><TabsTrigger value="explain">Explain</TabsTrigger><TabsTrigger value="map">Concept map</TabsTrigger><TabsTrigger value="progress">Mastery</TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="space-y-4">
          {due.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You are caught up. Save a formula, definition, or mistake to start a review deck.</CardContent></Card> : due.map((item) => <Card key={item._id.toString()}><CardHeader><CardDescription>{item.kind}{item.subject ? ` · ${item.subject}` : ""}</CardDescription><CardTitle>{item.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="font-medium">{item.prompt}</p>{revealed === item._id.toString() ? <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{item.answer}</p> : <Button variant="outline" onClick={() => setRevealed(item._id.toString())}>Show answer</Button>}{revealed === item._id.toString() && <div className="flex flex-wrap gap-2">{ratingOptions.map((rating) => <Button key={rating} size="sm" variant={rating === "again" ? "destructive" : "outline"} disabled={working} onClick={() => rate(item, rating)}>{rating[0].toUpperCase() + rating.slice(1)}</Button>)}</div>}</CardContent></Card>)}
        </TabsContent>

        <TabsContent value="book" className="space-y-4">
          <Card><CardHeader><CardTitle>Formula and Definition Book</CardTitle><CardDescription>Extract key items from your own topic summaries or add your own.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={materialForm.topicId} onChange={(e) => setMaterialForm({ ...materialForm, topicId: e.target.value })}><option value="">No topic link</option>{topics.map((topic) => <option key={topic._id.toString()} value={topic._id.toString()}>{topic.name}</option>)}</select><Button variant="outline" disabled={!materialForm.topicId || working} onClick={() => extract(materialForm.topicId)}>Extract formulas and definitions</Button></div><div className="grid gap-2 sm:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={materialForm.kind} onChange={(e) => setMaterialForm({ ...materialForm, kind: e.target.value as any })}><option value="formula">Formula</option><option value="definition">Definition</option><option value="mistake">Mistake notebook</option></select><Input placeholder="Title" value={materialForm.title} onChange={(e) => setMaterialForm({ ...materialForm, title: e.target.value })} /></div><Input placeholder="Recall question / prompt" value={materialForm.prompt} onChange={(e) => setMaterialForm({ ...materialForm, prompt: e.target.value })} /><Textarea placeholder="Answer or corrected explanation" value={materialForm.answer} onChange={(e) => setMaterialForm({ ...materialForm, answer: e.target.value })} />{materialForm.kind === "mistake" && <Input placeholder="Why did this go wrong?" value={materialForm.reason} onChange={(e) => setMaterialForm({ ...materialForm, reason: e.target.value })} />}<Button disabled={working} onClick={saveMaterial}>Save study item</Button></CardContent></Card>
          <Input placeholder="Search your book and mistakes" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="grid gap-3 md:grid-cols-2">{filteredMaterials.map((item) => <Card key={item._id.toString()}><CardHeader><CardDescription>{item.kind}{item.subject ? ` · ${item.subject}` : ""}</CardDescription><CardTitle className="text-lg">{item.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm font-medium">{item.prompt}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.answer}</p>{item.reason && <p className="text-xs">Reason: {item.reason}</p>}<p className="text-xs text-muted-foreground">Due {new Date(item.dueAt).toLocaleDateString()}</p><Button variant="ghost" size="sm" onClick={() => withWorking(async () => { await deleteStudyMaterialAction(item._id.toString()); await refresh(); })}>Delete</Button></CardContent></Card>)}</div>
        </TabsContent>

        <TabsContent value="tests" className="space-y-4">
          {!test ? <Card><CardHeader><CardTitle>Timed Mock Test Studio</CardTitle><CardDescription>Questions are generated from your own saved summaries.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={testForm.subject} onChange={(e) => setTestForm({ ...testForm, subject: e.target.value, chapter: "" })}><option value="">Choose subject</option>{Array.from(new Set(topics.map((t) => t.subject))).map((subject) => <option key={subject}>{subject}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={testForm.chapter} onChange={(e) => setTestForm({ ...testForm, chapter: e.target.value })}><option value="">All chapters</option>{Array.from(new Set(topics.filter((t) => !testForm.subject || t.subject === testForm.subject).map((t) => t.chapter))).map((chapter) => <option key={chapter}>{chapter}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={testForm.difficulty} onChange={(e) => setTestForm({ ...testForm, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={testForm.count} onChange={(e) => setTestForm({ ...testForm, count: Number(e.target.value) })}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}</select></div><Button disabled={!testForm.subject || working} onClick={startTest}>{working ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Generate timed test</Button></CardContent></Card> : <Card><CardHeader><CardDescription>{test.subject} · {test.difficulty}</CardDescription><CardTitle>{test.title}</CardTitle><p className="text-sm font-semibold text-primary">Time left: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p></CardHeader><CardContent className="space-y-4">{test.questions.map((q, i) => <div key={`${q.question}-${i}`} className="space-y-2"><p className="font-medium">{i + 1}. {q.question}</p><Textarea value={answers[i] || ""} onChange={(e) => setAnswers(answers.map((a, index) => index === i ? e.target.value : a))} /></div>)}<label className="block text-sm">How confident were you? <select className="ml-2 rounded-md border bg-background p-2" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label><Button disabled={working} onClick={submitTest}>Submit test</Button></CardContent></Card>}
          {testResult && <Card><CardHeader><CardTitle>Score: {testResult.score}%</CardTitle><CardDescription>Questions marked weak were added to your Mistake Notebook.</CardDescription></CardHeader><CardContent className="space-y-2">{testResult.results.map((r: any, i: number) => <p key={i} className="text-sm">{i + 1}. {r.score}/10 · {r.feedback}</p>)}<Button variant="outline" onClick={() => setTestResult(null)}>Create another test</Button></CardContent></Card>}
        </TabsContent>

        <TabsContent value="coach" className="space-y-4">
          <Card><CardHeader><CardTitle>Exam Answer Coach</CardTitle><CardDescription>Feedback covers structure, clarity, completeness, and accuracy.</CardDescription></CardHeader><CardContent className="space-y-3"><Input placeholder="Subject" value={coach.subject} onChange={(e) => setCoach({ ...coach, subject: e.target.value })} /><Textarea placeholder="Exam question" value={coach.question} onChange={(e) => setCoach({ ...coach, question: e.target.value })} /><Textarea placeholder="Your answer" value={coach.answer} onChange={(e) => setCoach({ ...coach, answer: e.target.value })} /><label className="text-sm">Confidence <select className="ml-2 rounded-md border bg-background p-2" value={coach.confidence} onChange={(e) => setCoach({ ...coach, confidence: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label><Button disabled={working || !coach.question || !coach.answer} onClick={coachAnswer}>Review my answer</Button>{coachResult && <div className="space-y-2 rounded-lg bg-muted p-4"><p className="font-semibold">Score: {coachResult.score}%</p>{["structure", "clarity", "completeness", "accuracy", "improvedAnswer"].map((key) => <p key={key} className="text-sm"><strong>{key}:</strong> {coachResult[key]}</p>)}</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="explain" className="space-y-4">
          <Card><CardHeader><CardTitle>Explain It Another Way</CardTitle><CardDescription>Choose a simpler explanation, analogy, worked example, or diagram.</CardDescription></CardHeader><CardContent className="space-y-3"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}><option value="">Choose your topic</option>{topics.map((t) => <option key={t._id.toString()} value={t._id.toString()}>{t.name}</option>)}</select><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={explainMode} onChange={(e) => setExplainMode(e.target.value as any)}><option value="simple">Simpler language</option><option value="analogy">New analogy</option><option value="worked-example">Worked example</option><option value="diagram">Diagram</option></select><Button disabled={!selectedTopic || working} onClick={explain}>Generate explanation</Button>{explanation && <div className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">{explanation.title}</h3><p className="whitespace-pre-wrap text-sm">{explanation.explanation}</p>{explanation.example && <p className="text-sm text-muted-foreground">{explanation.example}</p>}{explanation.diagram && <div className="grid gap-2 sm:grid-cols-2">{explanation.diagram.nodes.map((node: any, i: number) => <div key={node.id || i} className="rounded-md bg-muted p-3 text-sm">{node.label}</div>)}{explanation.diagram.edges.map((edge: any, i: number) => <p key={i} className="text-xs text-muted-foreground">{edge.from} → {edge.to}{edge.label ? ` · ${edge.label}` : ""}</p>)}</div>}</div>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Teach-Back</CardTitle><CardDescription>Explain it in your own words. Concept Mirror also supports voice-based teach-back.</CardDescription></CardHeader><CardContent className="space-y-3"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}><option value="">Choose your topic</option>{topics.map((t) => <option key={t._id.toString()} value={t._id.toString()}>{t.name}</option>)}</select><Textarea placeholder="Explain the idea without looking at the summary" value={teachText} onChange={(e) => setTeachText(e.target.value)} /><Button disabled={!selectedTopic || !teachText || working} onClick={teachBack}>Analyze my explanation</Button><Link className="ml-3 text-sm text-primary underline" href="/dashboard/concept-mirror">Use voice in Concept Mirror</Link>{teachResult && <div className="rounded-lg bg-muted p-4 text-sm"><p className="font-semibold">Score: {teachResult.overallScore ?? "—"}</p><p>{teachResult.feedback_summary}</p></div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="map" className="space-y-4">
          <Card><CardHeader><CardTitle>Concept Dependency Map</CardTitle><CardDescription>Add prerequisite and related-topic links. Links are private to your account.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={mapFrom} onChange={(e) => setMapFrom(e.target.value)}><option value="">Concept</option>{topics.map((t) => <option key={t._id.toString()} value={t._id.toString()}>{t.name}</option>)}</select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={mapKind} onChange={(e) => setMapKind(e.target.value as any)}><option value="prerequisite">Requires</option><option value="related">Related to</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={mapTo} onChange={(e) => setMapTo(e.target.value)}><option value="">Prerequisite / related concept</option>{topics.map((t) => <option key={t._id.toString()} value={t._id.toString()}>{t.name}</option>)}</select></div><Button disabled={!mapFrom || !mapTo || working} onClick={() => withWorking(async () => { await saveConceptRelationAction({ fromTopicId: mapFrom, toTopicId: mapTo, relation: mapKind }); await refresh(); })}>Save concept link</Button><div className="space-y-2">{data?.relations.map((relation) => <div key={relation._id.toString()} className="flex items-center justify-between rounded-md border p-3 text-sm"><span>{topics.find((t) => t._id.toString() === relation.fromTopicId)?.name} {relation.relation === "prerequisite" ? "requires" : "is related to"} {topics.find((t) => t._id.toString() === relation.toTopicId)?.name}</span><Button size="sm" variant="ghost" onClick={() => withWorking(async () => { await removeConceptRelationAction(relation._id.toString()); await refresh(); })}>Remove</Button></div>)}</div></CardContent></Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <Card><CardHeader><CardTitle>Mastery Timeline</CardTitle><CardDescription>Your study attempts are private. Confidence calibration compares self-rating (1–5) with results.</CardDescription></CardHeader><CardContent><div className="mb-4 grid gap-3 sm:grid-cols-5">{[1, 2, 3, 4, 5].map((rating) => { const group = (data?.timeline || []).filter((item) => item.confidence === rating); const avg = group.length ? Math.round(group.reduce((sum, item) => sum + item.score, 0) / group.length) : null; return <div key={rating} className="rounded-md border p-3 text-center"><p className="text-xs text-muted-foreground">Confidence {rating}/5</p><p className="text-xl font-semibold">{avg === null ? "—" : `${avg}%`}</p><p className="text-xs text-muted-foreground">{group.length} attempts</p></div>; })}</div><div className="space-y-2">{data?.timeline.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.kind} · {new Date(item.createdAt).toLocaleString()}</p></div><div className="text-right"><p className="font-semibold">{item.score}%</p>{item.confidence && <p className="text-xs text-muted-foreground">Confidence {item.confidence}/5</p>}</div></div>)}</div></CardContent></Card>
        </TabsContent>
      </Tabs>
      {working && <div className="sr-only" role="status"><Loader2 className="animate-spin" /></div>}
      <div className="sr-only"><BookOpenCheck /><BrainCircuit /><AlertCircle /></div>
    </div>
  );
}
