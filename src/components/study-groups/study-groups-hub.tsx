"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import {
  getStudyGroupsDataAction,
  createStudyGroupAction,
  joinStudyGroupAction,
  leaveStudyGroupAction,
  getGroupMessagesAction,
  sendGroupMessageAction,
  getDirectConversationsAction,
  getDirectMessagesAction,
  sendDirectMessageAction,
} from "@/app/actions/study-groups";
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
  Users,
  MessageSquare,
  Plus,
  Send,
  Calendar,
  BookOpen,
  ArrowLeft,
  Clock,
  Sparkles,
  Loader2,
  UserCheck,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

interface GroupItem {
  id: string;
  name: string;
  description: string;
  subject: string;
  examFocus: string;
  schedule: string;
  memberCount: number;
  isOwner: boolean;
  isMember: boolean;
  ownerUsername: string;
  createdAt: string;
}

interface MessageItem {
  id: string;
  senderId: string;
  senderUsername: string;
  body: string;
  isMine: boolean;
  createdAt: string;
  serverTimeMillis: number;
}

export function StudyGroupsHub() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"my_groups" | "discover" | "direct">("my_groups");

  // Groups state
  const [myGroups, setMyGroups] = useState<GroupItem[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<GroupItem[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupItem | null>(null);
  const [groupMessages, setGroupMessages] = useState<MessageItem[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Direct chat state
  const [directConversations, setDirectConversations] = useState<any[]>([]);
  const [activeDirectTarget, setActiveDirectTarget] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<MessageItem[]>([]);
  const [directTargetInput, setDirectTargetInput] = useState("");
  const [directMessageText, setDirectMessageText] = useState("");

  // Create Group Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    subject: "",
    examFocus: "IIT JEE",
    schedule: "Daily 8 PM IST",
    description: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  // Loading
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load all initial groups
  const loadGroupsData = async () => {
    try {
      const res = await getStudyGroupsDataAction();
      setMyGroups(res.myGroups);
      setDiscoverGroups(res.discoverGroups);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to load study groups.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDirectConversations = async () => {
    try {
      const res = await getDirectConversationsAction();
      setDirectConversations(res);
    } catch (err) {
      console.error("Failed to load direct conversations:", err);
    }
  };

  useEffect(() => {
    loadGroupsData();
    loadDirectConversations();
  }, []);

  // Sequential polling prevents request overlap and pauses on hidden tabs.
  useEffect(() => {
    if (!activeGroup) return;
    let isMounted = true;
    let inFlight = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      if (isMounted && document.visibilityState !== "hidden") timeout = setTimeout(() => void fetchMsgs(), 4000);
    };
    const fetchMsgs = async () => {
      if (!isMounted || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const msgs = await getGroupMessagesAction(activeGroup.id);
        if (isMounted) setGroupMessages(msgs);
      } catch (err) {
        console.error("Failed to fetch group messages:", err);
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timeout) clearTimeout(timeout);
        timeout = null;
      } else if (!inFlight) {
        if (timeout) clearTimeout(timeout);
        timeout = null;
        void fetchMsgs();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void fetchMsgs();
    return () => {
      isMounted = false;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeGroup]);

  useEffect(() => {
    if (!activeDirectTarget) return;
    let isMounted = true;
    let inFlight = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      if (isMounted && document.visibilityState !== "hidden") timeout = setTimeout(() => void fetchDMs(), 4000);
    };
    const fetchDMs = async () => {
      if (!isMounted || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await getDirectMessagesAction(activeDirectTarget);
        if (isMounted) setDirectMessages(res.messages);
      } catch (err) {
        console.error("Failed to fetch DM messages:", err);
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timeout) clearTimeout(timeout);
        timeout = null;
      } else if (!inFlight) {
        if (timeout) clearTimeout(timeout);
        timeout = null;
        void fetchDMs();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void fetchDMs();
    return () => {
      isMounted = false;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeDirectTarget]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [groupMessages, directMessages]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.subject || !createForm.description) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please fill in all required fields.",
      });
      return;
    }

    setIsCreating(true);
    try {
      const res = await createStudyGroupAction(createForm);
      toast({
        title: "Group Created!",
        description: `"${createForm.name}" is now live.`,
      });
      setIsCreateOpen(false);
      setCreateForm({
        name: "",
        subject: "",
        examFocus: "IIT JEE",
        schedule: "Daily 8 PM IST",
        description: "",
      });
      await loadGroupsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: err.message || "Could not create group.",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGroup = async (group: GroupItem) => {
    try {
      await joinStudyGroupAction(group.id);
      toast({
        title: "Joined Group!",
        description: `You are now a member of ${group.name}.`,
      });
      await loadGroupsData();
      setActiveGroup({ ...group, isMember: true, memberCount: group.memberCount + 1 });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Join",
        description: err.message || "Could not join group.",
      });
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      await leaveStudyGroupAction(groupId);
      toast({
        title: "Left Group",
        description: "You have left the study group.",
      });
      setActiveGroup(null);
      await loadGroupsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Could not leave group.",
      });
    }
  };

  const handleSendGroupMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !messageText.trim() || isSending) return;

    const textToSend = messageText.trim();
    setMessageText("");
    setIsSending(true);

    try {
      const res = await sendGroupMessageAction(activeGroup.id, textToSend);
      if (res.success && res.message) {
        setGroupMessages((prev) => [...prev, res.message]);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: err.message || "Could not send message.",
      });
      setMessageText(textToSend); // Restore text on failure
    } finally {
      setIsSending(false);
    }
  };

  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDirectTarget || !directMessageText.trim() || isSending) return;

    const textToSend = directMessageText.trim();
    setDirectMessageText("");
    setIsSending(true);

    try {
      const res = await sendDirectMessageAction(activeDirectTarget, textToSend);
      if (res.success && res.message) {
        setDirectMessages((prev) => [...prev, res.message]);
        loadDirectConversations();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: err.message || "Could not send message.",
      });
      setDirectMessageText(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const formatServerTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Active Group Chat View
  if (activeGroup) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 pb-12">
        {/* Chat Header */}
        <Card className="border shadow-sm">
          <CardHeader className="py-3 sm:py-4 px-3 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveGroup(null)}
                className="h-8 w-8 p-0 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl font-headline font-bold flex items-center flex-wrap gap-2">
                  <span className="truncate">{activeGroup.name}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {activeGroup.subject}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {activeGroup.memberCount} Members
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {activeGroup.schedule}
                  </span>
                  <span>•</span>
                  <span>Focus: {activeGroup.examFocus}</span>
                </CardDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-xs text-destructive hover:bg-destructive/10 self-end sm:self-auto shrink-0"
              onClick={() => handleLeaveGroup(activeGroup.id)}
            >
              Leave Group
            </Button>
          </CardHeader>
        </Card>

        {/* Message Feed */}
        <Card className="border shadow-md h-[520px] flex flex-col">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {groupMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2">
                <MessageSquare className="h-8 w-8 opacity-40" />
                <p className="text-sm">No messages yet in this study group.</p>
                <p className="text-xs max-w-sm">
                  Start the discussion! Share a doubt, discuss a problem, or share your schedule.
                </p>
              </div>
            ) : (
              groupMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[80%] ${
                    msg.isMine ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1 mb-0.5">
                    <span className="font-semibold text-foreground">
                      {msg.isMine ? "You" : `@${msg.senderUsername}`}
                    </span>
                    <span>•</span>
                    <span>{formatServerTime(msg.createdAt)}</span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2 text-sm shadow-sm leading-relaxed break-words whitespace-pre-wrap ${
                      msg.isMine
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none border"
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Chat Input */}
          <CardFooter className="p-3 border-t bg-card/60">
            <form onSubmit={handleSendGroupMessage} className="flex items-center gap-2 w-full">
              <Input
                placeholder="Type your study doubt or discussion... (Server timestamped)"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={2000}
                className="flex-1"
                disabled={isSending}
              />
              <Button type="submit" size="sm" disabled={isSending || !messageText.trim()}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Active Direct Chat View
  if (activeDirectTarget) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-12">
        <Card className="border shadow-sm">
          <CardHeader className="py-3 sm:py-4 px-3 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveDirectTarget(null)}
                className="h-8 w-8 p-0 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg font-headline font-bold truncate">
                  Chat with @{activeDirectTarget}
                </CardTitle>
                <CardDescription className="text-xs truncate">
                  Native 1-on-1 private messaging • Synchronized
                </CardDescription>
              </div>
            </div>
            <Link href={`/profile/${activeDirectTarget}`} className="self-end sm:self-auto shrink-0">
              <Button variant="outline" size="sm" className="text-xs">
                View Profile
              </Button>
            </Link>
          </CardHeader>
        </Card>

        <Card className="border shadow-md h-[500px] flex flex-col">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {directMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2">
                <MessageSquare className="h-8 w-8 opacity-40" />
                <p className="text-sm">Say hi to @{activeDirectTarget}!</p>
              </div>
            ) : (
              directMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[80%] ${
                    msg.isMine ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1 mb-0.5">
                    <span className="font-semibold text-foreground">
                      {msg.isMine ? "You" : `@${msg.senderUsername}`}
                    </span>
                    <span>•</span>
                    <span>{formatServerTime(msg.createdAt)}</span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2 text-sm shadow-sm leading-relaxed break-words whitespace-pre-wrap ${
                      msg.isMine
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none border"
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          <CardFooter className="p-3 border-t bg-card/60">
            <form onSubmit={handleSendDirectMessage} className="flex items-center gap-2 w-full">
              <Input
                placeholder="Type your message..."
                value={directMessageText}
                onChange={(e) => setDirectMessageText(e.target.value)}
                maxLength={2000}
                className="flex-1"
                disabled={isSending}
              />
              <Button type="submit" size="sm" disabled={isSending || !directMessageText.trim()}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main Study Groups / Hub View
  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Study Groups & Native Chat
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Collaborate with peers, form subject study circles, and chat live with server-time verification.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create Study Group
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <form onSubmit={handleCreateGroup}>
              <DialogHeader>
                <DialogTitle>Create a Study Group</DialogTitle>
                <DialogDescription>
                  Form a circle for IIT JEE, NEET, or CBSE study sessions.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 text-sm">
                <div className="space-y-1">
                  <label className="font-semibold text-xs">Group Name *</label>
                  <Input
                    required
                    placeholder="e.g. Organic Chemistry Mastery 2026"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-xs">Subject *</label>
                    <Input
                      required
                      placeholder="e.g. Physics, Chemistry"
                      value={createForm.subject}
                      onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-xs">Exam Focus</label>
                    <Input
                      placeholder="e.g. IIT JEE, NEET"
                      value={createForm.examFocus}
                      onChange={(e) => setCreateForm({ ...createForm, examFocus: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-xs">Schedule / Time Slot</label>
                  <Input
                    placeholder="e.g. Daily 8 PM to 10 PM IST"
                    value={createForm.schedule}
                    onChange={(e) => setCreateForm({ ...createForm, schedule: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-xs">Description & Objectives *</label>
                  <Textarea
                    required
                    rows={3}
                    placeholder="Describe what your group will practice and study..."
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Launch Group
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border/60 gap-4">
        <button
          onClick={() => setActiveTab("my_groups")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "my_groups"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          My Study Groups ({myGroups.length})
        </button>
        <button
          onClick={() => setActiveTab("discover")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "discover"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Discover Groups ({discoverGroups.length})
        </button>
        <button
          onClick={() => setActiveTab("direct")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "direct"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Direct Messages ({directConversations.length})
        </button>
      </div>

      {/* Tab: My Groups */}
      {activeTab === "my_groups" && (
        <div className="space-y-4">
          {myGroups.length === 0 ? (
            <Card className="text-center py-12 border-dashed">
              <CardContent className="space-y-3">
                <Users className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                <h3 className="font-headline font-bold text-lg">No Study Groups Joined Yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  You haven't joined or created any study groups. Create one now or check the Discover tab!
                </p>
                <Button onClick={() => setIsCreateOpen(true)} className="mt-2">
                  <Plus className="h-4 w-4 mr-2" /> Create Your First Group
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myGroups.map((group) => (
                <Card
                  key={group.id}
                  className="border shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-headline font-bold text-lg line-clamp-1">
                        {group.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {group.subject}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 text-xs mt-1">
                      {group.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground pb-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>{group.schedule}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      <span>{group.memberCount} Aspirants Enrolled</span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      By @{group.ownerUsername}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setActiveGroup(group)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Open Chat
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Discover Groups */}
      {activeTab === "discover" && (
        <div className="space-y-4">
          {discoverGroups.length === 0 ? (
            <Card className="text-center py-12 border-dashed">
              <CardContent className="space-y-2">
                <BookOpen className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                <h3 className="font-headline font-bold text-lg">No Other Groups Available</h3>
                <p className="text-sm text-muted-foreground">
                  You are already a member of all existing groups!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {discoverGroups.map((group) => (
                <Card
                  key={group.id}
                  className="border shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-headline font-bold text-lg line-clamp-1">
                        {group.name}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {group.subject}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 text-xs mt-1">
                      {group.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground pb-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>{group.schedule}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      <span>{group.memberCount} Members</span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      By @{group.ownerUsername}
                    </span>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleJoinGroup(group)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Join Circle
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Direct Messages */}
      {activeTab === "direct" && (
        <div className="space-y-6">
          {/* Start New DM */}
          <Card className="border p-4 shadow-sm bg-card/60">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Input
                placeholder="Enter an aspirant's username to start direct chat..."
                value={directTargetInput}
                onChange={(e) => setDirectTargetInput(e.target.value)}
                className="flex-1 text-sm"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (directTargetInput.trim()) {
                    setActiveDirectTarget(directTargetInput.trim());
                  }
                }}
                disabled={!directTargetInput.trim()}
                className="whitespace-nowrap"
              >
                <MessageSquare className="h-4 w-4 mr-1.5" /> Start Chat
              </Button>
            </div>
          </Card>

          {/* Existing DMs */}
          {directConversations.length === 0 ? (
            <Card className="text-center py-10 border-dashed">
              <CardContent className="space-y-2">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                <h4 className="font-semibold text-sm">No Active Direct Conversations</h4>
                <p className="text-xs text-muted-foreground">
                  Connect directly with study partners from the AspirantsConnect directory or enter their username above.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {directConversations.map((dm) => (
                <Card
                  key={dm.conversationKey}
                  className="border p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between"
                  onClick={() => setActiveDirectTarget(dm.otherUsername)}
                >
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground">
                      {dm.otherFullName}
                      <span className="text-xs font-normal text-muted-foreground ml-2">
                        @{dm.otherUsername}
                      </span>
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {dm.lastMessage}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs">
                    Open &rarr;
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
