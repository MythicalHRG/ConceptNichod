"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getMistakesDataAction,
  createMistakeAction,
  updateMistakeStatusAction,
  deleteMistakeAction,
  generateMistakeQuizAction,
  MistakeItem,
  MistakeQuizQuestion,
} from "@/app/actions/mistakes";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookMarked,
  Plus,
  Zap,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Search,
  Filter,
  Sparkles,
  Loader2,
  AlertCircle,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LatexRenderer } from "@/components/ui/latex-renderer";

const ERROR_TYPE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  conceptual: { label: "Conceptual Slip", color: "bg-purple-500/10 text-purple-400 border-purple-500/30", icon: "🧠" },
  calculation: { label: "Calculation / Silly", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: "🔢" },
  formula: { label: "Formula Amnesia", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: "📐" },
  misread: { label: "Question Misread", color: "bg-rose-500/10 text-rose-400 border-rose-500/30", icon: "👁️" },
};

export function MistakeNotebook() {
  const { toast } = useToast();
  const [data, setData] = useState<{
    mistakes: MistakeItem[];
    counts: { total: number; unresolved: number; mastered: number; subjects: Record<string, number> };
  }>({
    mistakes: [],
    counts: { total: 0, unresolved: 0, mastered: 0, subjects: {} },
  });

  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "unresolved" | "mastered">("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    subject: "Physics",
    chapter: "",
    errorType: "conceptual" as "conceptual" | "calculation" | "formula" | "misread",
    questionOrPrompt: "",
    myMistake: "",
    correctConcept: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quiz Modal State
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<MistakeQuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);

  const fetchMistakes = async () => {
    try {
      const res = await getMistakesDataAction({
        status: statusFilter,
        subject: subjectFilter,
        search: searchQuery,
      });
      setData(res);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to load mistakes.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMistakes();
  }, [statusFilter, subjectFilter, searchQuery]);

  const handleCreateMistake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title || !createForm.subject || !createForm.myMistake || !createForm.correctConcept) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please fill in all required fields.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createMistakeAction(createForm);
      toast({
        title: "Mistake Logged!",
        description: "Added to your notebook for active revision.",
      });
      setIsCreateOpen(false);
      setCreateForm({
        title: "",
        subject: "Physics",
        chapter: "",
        errorType: "conceptual",
        questionOrPrompt: "",
        myMistake: "",
        correctConcept: "",
      });
      fetchMistakes();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Save",
        description: err.message || "Could not log mistake.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: MistakeItem) => {
    const nextStatus = item.status === "unresolved" ? "mastered" : "unresolved";
    try {
      await updateMistakeStatusAction(item.id, nextStatus);
      toast({
        title: nextStatus === "mastered" ? "Marked as Mastered! 🎉" : "Reopened for Revision",
        description: nextStatus === "mastered" ? "Great job fixing this concept blunder." : "Keep practicing!",
      });
      fetchMistakes();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMistakeAction(id);
      toast({ title: "Mistake Deleted" });
      fetchMistakes();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message,
      });
    }
  };

  // Launch Mistake Revision Drill
  const handleStartQuiz = async () => {
    setIsQuizOpen(true);
    setQuizLoading(true);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setQuizScore(0);
    setQuizCompleted(false);

    try {
      const res = await generateMistakeQuizAction(subjectFilter !== "all" ? subjectFilter : undefined);
      setQuizQuestions(res.questions);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Quiz Generation",
        description: err.message || "Failed to generate drill.",
      });
      setIsQuizOpen(false);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null) return; // Already answered
    setSelectedOption(idx);
    if (idx === quizQuestions[currentQIndex].correctIndex) {
      setQuizScore((prev) => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQIndex + 1 < quizQuestions.length) {
      setCurrentQIndex((prev) => prev + 1);
      setSelectedOption(null);
    } else {
      setQuizCompleted(true);
    }
  };

  const subjectsList = Object.keys(data.counts.subjects);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-2">
            <BookMarked className="h-7 w-7 text-primary" />
            Mistake Notebook (Galti Diary)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Log your blunders, formulas you forget, and conceptual slips. Master them so you never repeat them in exams.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartQuiz}
            className="flex items-center gap-1.5 text-xs font-semibold"
            disabled={data.counts.unresolved === 0}
          >
            <Zap className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
            Test My Weaknesses
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-1.5 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                Log a Mistake
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <form onSubmit={handleCreateMistake}>
                <DialogHeader>
                  <DialogTitle>Log a Mistake</DialogTitle>
                  <DialogDescription>
                    Record what went wrong and write the correct concept so your brain locks it in.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3.5 py-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Mistake Title / Concept *</label>
                    <Input
                      required
                      placeholder="e.g. Lenz's Law - Forgot minus sign in EMF formula"
                      value={createForm.title}
                      onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                      maxLength={120}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Subject *</label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                        value={createForm.subject}
                        onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                      >
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                        <option value="Mathematics">Mathematics</option>
                        <option value="Biology">Biology</option>
                        <option value="General">General</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Chapter</label>
                      <Input
                        placeholder="e.g. Electromagnetic Induction"
                        value={createForm.chapter}
                        onChange={(e) => setCreateForm({ ...createForm, chapter: e.target.value })}
                        maxLength={80}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Type of Mistake</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.entries(ERROR_TYPE_MAP).map(([key, info]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCreateForm({ ...createForm, errorType: key as any })}
                          className={`p-2 rounded-lg border text-left flex items-center gap-1.5 transition-colors text-[11px] ${
                            createForm.errorType === key
                              ? "bg-primary/10 border-primary text-primary font-bold"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <span>{info.icon}</span>
                          <span className="truncate">{info.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">The Question / Problem (Optional)</label>
                    <Textarea
                      rows={2}
                      placeholder="What was the problem statement or question you were solving?"
                      value={createForm.questionOrPrompt}
                      onChange={(e) => setCreateForm({ ...createForm, questionOrPrompt: e.target.value })}
                      maxLength={3000}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-rose-500 flex items-center gap-1">
                      <span>❌ What Mistake Did You Make? *</span>
                    </label>
                    <Textarea
                      required
                      rows={2}
                      placeholder="e.g. I assumed current was clockwise and neglected the flux direction."
                      value={createForm.myMistake}
                      onChange={(e) => setCreateForm({ ...createForm, myMistake: e.target.value })}
                      maxLength={2500}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-emerald-500 flex items-center gap-1">
                      <span>✅ What Is The Correct Concept / Takeaway? *</span>
                    </label>
                    <Textarea
                      required
                      rows={2}
                      placeholder="e.g. $e = -\\frac{d\\Phi}{dt}$. Induced EMF always opposes the change in magnetic flux."
                      value={createForm.correctConcept}
                      onChange={(e) => setCreateForm({ ...createForm, correctConcept: e.target.value })}
                      maxLength={2500}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Save to Notebook
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Overview Summary Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border bg-card/60 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Total Mistakes</span>
          <span className="text-lg font-headline font-bold text-foreground">{data.counts.total}</span>
        </div>
        <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 flex items-center justify-between">
          <span className="text-xs text-rose-400 font-medium flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Needs Revision
          </span>
          <span className="text-lg font-headline font-bold text-rose-400">{data.counts.unresolved}</span>
        </div>
        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Rectified
          </span>
          <span className="text-lg font-headline font-bold text-emerald-400">{data.counts.mastered}</span>
        </div>
        <div className="p-3 rounded-xl border bg-card/60 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Mastery Rate</span>
          <span className="text-lg font-headline font-bold text-primary">
            {data.counts.total > 0 ? Math.round((data.counts.mastered / data.counts.total) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="border bg-card/40 p-3 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg w-full md:w-auto">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex-1 md:flex-none ${
                statusFilter === "all" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({data.counts.total})
            </button>
            <button
              onClick={() => setStatusFilter("unresolved")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex-1 md:flex-none ${
                statusFilter === "unresolved" ? "bg-background text-rose-400 shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Needs Revision ({data.counts.unresolved})
            </button>
            <button
              onClick={() => setStatusFilter("mastered")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex-1 md:flex-none ${
                statusFilter === "mastered" ? "bg-background text-emerald-400 shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mastered ({data.counts.mastered})
            </button>
          </div>

          {/* Subject Pills & Search */}
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <div className="relative flex-1 sm:w-60">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search mistakes or concepts..."
                className="pl-8 h-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="all">All Subjects</option>
              {subjectsList.map((s) => (
                <option key={s} value={s}>
                  {s} ({data.counts.subjects[s]})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Mistake Entries Feed */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      ) : data.mistakes.length === 0 ? (
        <Card className="text-center py-16 border-dashed bg-card/30">
          <CardContent className="space-y-3">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
            <h3 className="font-headline font-bold text-lg">No Mistakes Logged Here</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Every topper keeps a mistake diary. When you get a question wrong in tests or concept practice, log it here to cement your learning!
            </p>
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="mt-2">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Log Your First Mistake
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.mistakes.map((item) => {
            const errType = ERROR_TYPE_MAP[item.errorType] || ERROR_TYPE_MAP.conceptual;
            const isMastered = item.status === "mastered";

            return (
              <Card
                key={item.id}
                className={`border transition-shadow hover:shadow-md ${
                  isMastered ? "bg-card/40 opacity-80" : "bg-card/90"
                }`}
              >
                <CardHeader className="py-3 px-4 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[11px] font-semibold">
                        {item.subject}
                      </Badge>
                      {item.chapter && (
                        <span className="text-xs text-muted-foreground">• {item.chapter}</span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${errType.color}`}>
                        {errType.icon} {errType.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={isMastered ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleToggleStatus(item)}
                        className={`h-7 px-2.5 text-xs flex items-center gap-1.5 ${
                          isMastered
                            ? "text-emerald-500 hover:text-emerald-600 border-emerald-500/40"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isMastered ? "Mastered" : "Mark as Mastered"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <CardTitle className="text-base font-bold font-headline mt-1.5">
                    <LatexRenderer content={item.title} />
                  </CardTitle>
                </CardHeader>

                <CardContent className="py-2 px-4 space-y-3">
                  {item.questionOrPrompt && (
                    <div className="text-xs bg-muted/40 p-2.5 rounded-lg border border-border/60">
                      <span className="font-semibold text-muted-foreground block text-[11px] mb-1">
                        Problem Statement:
                      </span>
                      <LatexRenderer content={item.questionOrPrompt} />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* The Mistake */}
                    <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-lg space-y-1">
                      <span className="text-[11px] font-bold text-rose-400 flex items-center gap-1">
                        <span>❌ What Went Wrong</span>
                      </span>
                      <div className="text-foreground/90 leading-relaxed">
                        <LatexRenderer content={item.myMistake} />
                      </div>
                    </div>

                    {/* The Correct Concept */}
                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg space-y-1">
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                        <span>✅ Correct Concept / Formula</span>
                      </span>
                      <div className="text-foreground/90 leading-relaxed">
                        <LatexRenderer content={item.correctConcept} />
                      </div>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="py-2 px-4 border-t text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>Logged {new Date(item.createdAt).toLocaleDateString()}</span>
                  {item.reviewCount > 0 && <span>Reviewed {item.reviewCount} time(s)</span>}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Interactive Mistake Quiz Drill Modal */}
      <Dialog open={isQuizOpen} onOpenChange={setIsQuizOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              Mistake Rectification Drill
            </DialogTitle>
            <DialogDescription>
              A rapid diagnostic drill targeting your logged blunders.
            </DialogDescription>
          </DialogHeader>

          {quizLoading ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground">
                Analyzing your logged mistakes and generating a custom diagnostic quiz...
              </p>
            </div>
          ) : quizCompleted ? (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
              <h3 className="text-xl font-headline font-bold">Drill Completed!</h3>
              <p className="text-sm text-muted-foreground">
                You scored <span className="text-primary font-bold">{quizScore} / {quizQuestions.length}</span> on your mistake revision drill.
              </p>
              <Button size="sm" onClick={() => setIsQuizOpen(false)} className="mt-2">
                Back to Notebook
              </Button>
            </div>
          ) : quizQuestions.length > 0 ? (
            <div className="py-3 space-y-4 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Question {currentQIndex + 1} of {quizQuestions.length}</span>
                <span className="text-[11px] font-medium text-primary">
                  Targeting: {quizQuestions[currentQIndex].relatedMistake}
                </span>
              </div>

              <div className="bg-muted/40 p-3 rounded-lg border text-sm leading-relaxed font-medium">
                <LatexRenderer content={quizQuestions[currentQIndex].question} />
              </div>

              <div className="space-y-2">
                {quizQuestions[currentQIndex].options.map((opt, oIdx) => {
                  const isSelected = selectedOption === oIdx;
                  const isCorrect = oIdx === quizQuestions[currentQIndex].correctIndex;
                  const hasAnswered = selectedOption !== null;

                  let btnStyle = "border-border hover:bg-muted/60";
                  if (hasAnswered) {
                    if (isCorrect) btnStyle = "bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold";
                    else if (isSelected) btnStyle = "bg-rose-500/15 border-rose-500 text-rose-400";
                  }

                  return (
                    <button
                      key={oIdx}
                      disabled={hasAnswered}
                      onClick={() => handleSelectOption(oIdx)}
                      className={`w-full p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${btnStyle}`}
                    >
                      <span className="font-mono text-xs opacity-60">
                        {String.fromCharCode(65 + oIdx)}.
                      </span>
                      <div className="flex-1">
                        <LatexRenderer content={opt} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedOption !== null && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1 animate-in fade-in">
                  <p className="font-bold text-primary flex items-center gap-1.5">
                    {selectedOption === quizQuestions[currentQIndex].correctIndex ? "✅ Correct!" : "❌ Incorrect"}
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    <LatexRenderer content={quizQuestions[currentQIndex].explanation} />
                  </p>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  size="sm"
                  onClick={handleNextQuestion}
                  disabled={selectedOption === null}
                  className="w-full sm:w-auto"
                >
                  {currentQIndex + 1 < quizQuestions.length ? "Next Question" : "See Results"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
