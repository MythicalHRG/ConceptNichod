"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  createChangelogAction,
  updateChangelogAction,
  deleteChangelogAction,
} from "@/app/actions/changelog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LatexRenderer } from "@/components/ui/latex-renderer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Sparkles,
  Calendar,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Filter,
  ShieldCheck,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "Major Update": "bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-none shadow-sm",
  Feature: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Improvement: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "Bug Fix": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  Security: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

interface ChangelogViewProps {
  initialChangelogs: any[];
  isAdmin: boolean;
}

export function ChangelogView({ initialChangelogs, isAdmin }: ChangelogViewProps) {
  const [changelogs, setChangelogs] = useState<any[]>(initialChangelogs);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Feature");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("Feature");
  const [editContent, setEditContent] = useState("");

  const { toast } = useToast();

  // Filter logs by search query and category
  const filteredChangelogs = changelogs.filter((log) => {
    const matchesSearch =
      log.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || log.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Handle Create
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!version.trim() || !title.trim() || !content.trim()) {
      toast({ variant: "destructive", title: "Error", description: "All fields are required." });
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("version", version);
      formData.append("title", title);
      formData.append("category", category);
      formData.append("content", content);

      const res = await createChangelogAction(formData);
      if (res.success && res.changelog) {
        setChangelogs([res.changelog, ...changelogs]);
        toast({ title: "Update Published Live!", description: `${version} is now visible.` });
        setIsCreateOpen(false);
        setVersion("");
        setTitle("");
        setContent("");
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (log: any) => {
    setEditingId(log._id);
    setEditVersion(log.version);
    setEditTitle(log.title);
    setEditCategory(log.category || "Feature");
    setEditContent(log.content);
    setIsEditOpen(true);
  };

  // Handle Edit Submit
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editVersion.trim() || !editTitle.trim() || !editContent.trim()) {
      toast({ variant: "destructive", title: "Error", description: "All fields are required." });
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("version", editVersion);
      formData.append("title", editTitle);
      formData.append("category", editCategory);
      formData.append("content", editContent);

      const res = await updateChangelogAction(editingId, formData);
      if (res.success && res.changelog) {
        setChangelogs(
          changelogs.map((c) => (c._id === editingId ? res.changelog : c))
        );
        toast({ title: "Changelog Updated Live!", description: `Changes to ${editVersion} are saved.` });
        setIsEditOpen(false);
        setEditingId(null);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete
  const handleDelete = async (id: string, logVersion: string) => {
    if (!confirm(`Are you sure you want to permanently delete changelog ${logVersion}?`)) {
      return;
    }

    try {
      await deleteChangelogAction(id);
      setChangelogs(changelogs.filter((c) => c._id !== id));
      toast({ title: "Changelog Deleted", description: `${logVersion} was removed.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[35%] h-[35%] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <main className="container mx-auto px-3.5 sm:px-6 py-6 sm:py-12 max-w-4xl pb-safe">
        {/* Navigation & Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1.5 px-3 py-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Admin Live-Edit Active
              </Badge>
            )}
            <Badge variant="secondary" className="gap-1.5 px-3 py-1">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Live Updates
            </Badge>
          </div>
        </div>

        {/* Title & Live Actions */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight font-headline break-words">
              Changelog & Updates
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Track real-time updates, AI model upgrades, improvements, and fixes shipped to ConceptNichod.
            </p>
          </div>

          {/* Admin Live Create Button */}
          {isAdmin && (
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shrink-0 shadow-md">
              <Plus className="w-4 h-4" /> Post New Update
            </Button>
          )}
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Search updates by keyword or version..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Major Update">Major Updates</SelectItem>
              <SelectItem value="Feature">Features</SelectItem>
              <SelectItem value="Improvement">Improvements</SelectItem>
              <SelectItem value="Bug Fix">Bug Fixes</SelectItem>
              <SelectItem value="Security">Security</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Changelog Timeline */}
        {filteredChangelogs.length === 0 ? (
          <Card className="text-center p-12">
            <CardHeader>
              <CardTitle className="text-xl">No Updates Found</CardTitle>
              <CardDescription>
                {searchTerm || selectedCategory !== "all"
                  ? "Try clearing your search filters."
                  : "Platform updates and release notes will be posted here."}
              </CardDescription>
            </CardHeader>
            {isAdmin && (
              <CardContent>
                <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Create the First Update
                </Button>
              </CardContent>
            )}
          </Card>
        ) : (
          <div className="relative border-l-2 border-border/80 pl-6 md:pl-8 space-y-10 ml-3 md:ml-4">
            {filteredChangelogs.map((log: any, idx: number) => {
              const releaseDate = new Date(log.releaseDate || log.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              const categoryClass = CATEGORY_COLORS[log.category] || "bg-primary/10 text-primary";

              return (
                <div key={log._id || idx} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[31px] md:-left-[39px] top-1.5 w-4 h-4 rounded-full bg-background border-4 border-primary group-hover:scale-125 transition-transform" />

                  <Card className="shadow-sm hover:shadow-md transition-shadow border-border/70">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground">
                            {log.version}
                          </span>
                          <Badge className={categoryClass}>{log.category}</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{releaseDate}</span>
                          </div>

                          {/* Admin Live Controls */}
                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => openEditModal(log)}
                                title="Edit this update live"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDelete(log._id, log.version)}
                                title="Delete update"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      <CardTitle className="text-2xl font-bold font-headline">{log.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-sm leading-relaxed text-foreground/90 prose dark:prose-invert max-w-none">
                        <LatexRenderer content={log.content} />
                      </div>

                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span>Published by @{log.createdBy}</span>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Shipped
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        {/* CREATE MODAL */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Post New Changelog Update
              </DialogTitle>
              <DialogDescription>
                This update will immediately appear on the live <code>/changelog</code> page for all users.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Version Tag</label>
                  <Input
                    placeholder="e.g. v2.3.0"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Major Update">Major Update</SelectItem>
                      <SelectItem value="Feature">Feature</SelectItem>
                      <SelectItem value="Improvement">Improvement</SelectItem>
                      <SelectItem value="Bug Fix">Bug Fix</SelectItem>
                      <SelectItem value="Security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Title</label>
                <Input
                  placeholder="e.g. Live Editable Changelog & Speech Enhancements"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Content / Release Notes</label>
                <Textarea
                  placeholder="Describe key features, bullet points, and improvements..."
                  rows={7}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Publish Update Live
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* EDIT MODAL */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-500" /> Edit Changelog Live
              </DialogTitle>
              <DialogDescription>
                Updates will be reflected instantly on the page upon saving.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Version Tag</label>
                  <Input
                    value={editVersion}
                    onChange={(e) => setEditVersion(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Category</label>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Major Update">Major Update</SelectItem>
                      <SelectItem value="Feature">Feature</SelectItem>
                      <SelectItem value="Improvement">Improvement</SelectItem>
                      <SelectItem value="Bug Fix">Bug Fix</SelectItem>
                      <SelectItem value="Security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Content / Release Notes</label>
                <Textarea
                  rows={7}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save & Update Live
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
