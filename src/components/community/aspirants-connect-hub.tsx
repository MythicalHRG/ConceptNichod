"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Loader2, MessageCircle, Send, BookOpenCheck, Flag, LogOut, Timer, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { searchAspirantsAction, type SearchFilters } from "@/app/actions/aspirants";
import { getChatInboxAction, getChatMessagesAction, startDirectChatAction, sendChatMessageAction, updateChatPreferenceAction, reportChatAction, getSimplexConnectionStatusAction, createSimplexAccountLinkAction } from "@/app/actions/chat";
import { getCommunityDataAction, createStudyGroupAction, joinStudyGroupAction, leaveStudyGroupAction, deleteStudyGroupAction, createCommunityPostAction, markAnswerHelpfulAction, setAccountabilityProfileAction, getGroupPostsAction, searchStudyGroupsAction, searchGroupInviteesAction, inviteStudyGroupMemberAction } from "@/app/actions/community";

type Person = { username: string; fullName?: string; classLevel?: string; examFocus?: string; city?: string; bio?: string; snapchat?: string; instagram?: string; shareProgress?: boolean };
type Group = { id: string; name: string; description: string; subject: string; examFocus?: string; schedule?: string; memberCount: number; isOwner: boolean };
type Post = { id: string; kind: "question" | "answer" | "resource" | "session"; title: string; body: string; url?: string; parentId?: string; groupId?: string; topicLabels?: string[]; quizQuestions?: string[]; startsAt?: string; durationMinutes?: number; helpfulCount: number; isHelpful: boolean; createdAt: string; author: Person; answers?: Post[] };
type CommunityData = { groups: Group[]; publicGroups: Group[]; groupPosts: Post[]; resources: Post[]; questions: Post[]; accountabilityProfile: { enabled: boolean; weeklyGoal: string; schedule: string } | null; accountabilityProfiles: Array<Person & { weeklyGoal?: string; schedule?: string }> };
type GroupInvitee = { username: string; fullName?: string; classLevel?: string };
type InboxItem = Awaited<ReturnType<typeof getChatInboxAction>>[number];
type ChatData = Awaited<ReturnType<typeof getChatMessagesAction>>;

const blankCommunity: CommunityData = { groups: [], publicGroups: [], groupPosts: [], resources: [], questions: [], accountabilityProfile: null, accountabilityProfiles: [] };

export function AspirantsConnectHub() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedConversation = searchParams.get("conversation");
  const [tab, setTab] = useState("discover");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [community, setCommunity] = useState<CommunityData>(blankCommunity);
  const [users, setUsers] = useState<Person[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ searchQuery: "", classLevel: "All", city: "" });
  const userSearchSequence = useRef(0);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [simplexStatus, setSimplexStatus] = useState<{ configured: boolean; linked: boolean } | null>(null);
  const [simplexLink, setSimplexLink] = useState<{ contactLink: string; linkCode: string; instructions: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [newChatUsername, setNewChatUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupSubject, setGroupSubject] = useState("");
  const [groupSchedule, setGroupSchedule] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [searchedGroups, setSearchedGroups] = useState<Group[] | null>(null);
  const [searchingGroups, setSearchingGroups] = useState(false);
  const groupSearchSequence = useRef(0);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [inviteeQuery, setInviteeQuery] = useState("");
  const [invitees, setInvitees] = useState<GroupInvitee[]>([]);
  const [searchingInvitees, setSearchingInvitees] = useState(false);
  const inviteeSearchSequence = useRef(0);
  const [selectedGroupPosts, setSelectedGroupPosts] = useState<Post[]>([]);
  const [groupPostKind, setGroupPostKind] = useState<"question" | "resource" | "session">("question");
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [topicLabels, setTopicLabels] = useState("");
  const [quizQuestions, setQuizQuestions] = useState("");
  const [roomMinutes, setRoomMinutes] = useState(30);
  const [roomTimer, setRoomTimer] = useState<number | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [questionDraft, setQuestionDraft] = useState({ title: "", body: "" });
  const [resourceDraft, setResourceDraft] = useState({ title: "", body: "", url: "" });
  const [accountability, setAccountability] = useState({ enabled: false, weeklyGoal: "", schedule: "" });

  const refreshCommunity = useCallback(async () => {
    const result = await getCommunityDataAction() as CommunityData;
    setCommunity(result);
    setAccountability({ enabled: result.accountabilityProfile?.enabled || false, weeklyGoal: result.accountabilityProfile?.weeklyGoal || "", schedule: result.accountabilityProfile?.schedule || "" });
  }, []);

  const refreshInbox = useCallback(async () => setInbox(await getChatInboxAction()), []);
  const refreshChat = useCallback(async (conversationId: string) => setChat(await getChatMessagesAction(conversationId)), []);

  useEffect(() => {
    Promise.all([
      refreshCommunity(),
      refreshInbox(),
      getSimplexConnectionStatusAction().then(setSimplexStatus),
    ]).catch((error) => toast({ variant: "destructive", title: "Could not load AspirantsConnect", description: error.message })).finally(() => setLoading(false));
  }, [refreshCommunity, refreshInbox, toast]);

  useEffect(() => {
    const request = ++userSearchSequence.current;
    const timer = window.setTimeout(() => {
      setSearchingUsers(true);
      void searchAspirantsAction(filters).then((results) => {
        if (request !== userSearchSequence.current) return;
        setUsers(results);
        setHasSearched(true);
      }).catch((error: any) => {
        if (request === userSearchSequence.current) toast({ variant: "destructive", title: "Could not search students", description: error.message });
      }).finally(() => {
        if (request === userSearchSequence.current) setSearchingUsers(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters.searchQuery, filters.classLevel, filters.city, toast]);

  useEffect(() => {
    const request = ++groupSearchSequence.current;
    const query = groupSearchQuery.trim();
    if (!query) {
      setSearchedGroups(null);
      setSearchingGroups(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchingGroups(true);
      void searchStudyGroupsAction(query).then((results) => {
        if (request === groupSearchSequence.current) setSearchedGroups(results);
      }).catch((error: any) => {
        if (request === groupSearchSequence.current) toast({ variant: "destructive", title: "Could not search study groups", description: error.message });
      }).finally(() => {
        if (request === groupSearchSequence.current) setSearchingGroups(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [groupSearchQuery, toast]);

  const selectedGroupInfo = community.groups.find((group) => group.id === selectedGroup);
  useEffect(() => {
    const request = ++inviteeSearchSequence.current;
    const query = inviteeQuery.trim();
    if (!selectedGroup || !selectedGroupInfo?.isOwner || query.length < 2) {
      setInvitees([]);
      setSearchingInvitees(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchingInvitees(true);
      void searchGroupInviteesAction(selectedGroup, query).then((results) => {
        if (request === inviteeSearchSequence.current) setInvitees(results);
      }).catch((error: any) => {
        if (request === inviteeSearchSequence.current) toast({ variant: "destructive", title: "Could not find students", description: error.message });
      }).finally(() => {
        if (request === inviteeSearchSequence.current) setSearchingInvitees(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [inviteeQuery, selectedGroup, selectedGroupInfo?.isOwner, toast]);

  useEffect(() => {
    if (requestedTab === "chats" || requestedConversation) setTab("chats");
    if (requestedConversation) setSelectedChat(requestedConversation);
  }, [requestedTab, requestedConversation]);

  useEffect(() => {
    if (!selectedChat || tab !== "chats") return;
    let active = true;
    const update = async () => {
      try {
        const data = await getChatMessagesAction(selectedChat);
        if (active) setChat(data);
        if (active) await refreshInbox();
      } catch (error: any) {
        if (active) toast({ variant: "destructive", title: "Could not refresh chat", description: error.message });
      }
    };
    void update();
    const interval = window.setInterval(update, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [selectedChat, tab, refreshInbox, toast]);

  useEffect(() => {
    if (roomTimer === null || roomTimer <= 0) return;
    const interval = window.setInterval(() => setRoomTimer((seconds) => seconds === null ? null : Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [roomTimer]);

  const perform = async (task: () => Promise<void>) => {
    setBusy(true);
    try { await task(); }
    catch (error: any) { toast({ variant: "destructive", title: "Could not complete that action", description: error.message }); }
    finally { setBusy(false); }
  };

  const openChat = (username: string) => perform(async () => {
    const conversation = await startDirectChatAction(username);
    await refreshInbox();
    setSelectedChat(conversation.id);
    setChat(await getChatMessagesAction(conversation.id));
    setNewChatUsername("");
    setTab("chats");
  });
  const send = () => perform(async () => {
    if (!selectedChat || !draft.trim()) return;
    await sendChatMessageAction(selectedChat, draft);
    setDraft("");
    await refreshChat(selectedChat);
    await refreshInbox();
  });
  const loadGroup = (id: string) => perform(async () => {
    setSelectedGroup(id);
    setInviteeQuery("");
    setInvitees([]);
    setSelectedGroupPosts(await getGroupPostsAction(id) as Post[]);
  });
  const addGroupMember = (username: string) => perform(async () => {
    if (!selectedGroup) throw new Error("Choose one of your groups first.");
    await inviteStudyGroupMemberAction(selectedGroup, username);
    setInviteeQuery("");
    setInvitees([]);
    await refreshCommunity();
    toast({ title: `@${username} added to the study group` });
  });
  const createGroup = () => perform(async () => {
    await createStudyGroupAction({ name: groupName, description: groupDescription, subject: groupSubject, schedule: groupSchedule });
    setGroupName(""); setGroupDescription(""); setGroupSubject(""); setGroupSchedule("");
    await refreshCommunity();
  });
  const createGroupPost = () => perform(async () => {
    if (!selectedGroup) throw new Error("Choose one of your groups first.");
    await createCommunityPostAction({ kind: groupPostKind, groupId: selectedGroup, title: postTitle, body: postBody, url: postUrl || undefined, durationMinutes: roomMinutes, topicLabels: topicLabels.split(",").map((s) => s.trim()).filter(Boolean), quizQuestions: quizQuestions.split("\n").map((s) => s.trim()).filter(Boolean) });
    setPostTitle(""); setPostBody(""); setPostUrl(""); setTopicLabels(""); setQuizQuestions("");
    setSelectedGroupPosts(await getGroupPostsAction(selectedGroup) as Post[]);
    await refreshCommunity();
  });
  const saveAccountability = () => perform(async () => {
    await setAccountabilityProfileAction(accountability);
    await refreshCommunity();
    toast({ title: accountability.enabled ? "Accountability profile enabled" : "Accountability profile hidden" });
  });

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Loading AspirantsConnect…</div>;

  return <div className="mx-auto w-full max-w-6xl space-y-5 pb-16">
    <header><h1 className="break-words font-headline text-3xl text-primary sm:text-4xl">AspirantsConnect</h1><p className="mt-2 text-muted-foreground">Find study partners, ask questions, and revise together.</p></header>
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
        {[['discover','Discover'],['chats',`Chats${inbox.length ? ` (${inbox.length})` : ""}`],['groups',`Study groups (${community.groups.length})`],['questions','Peer Q&A'],['accountability','Partners'],['resources','Resources']].map(([value,label]) => <TabsTrigger key={value} className="shrink-0" value={value}>{label}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="discover" className="space-y-4">
        <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_1fr] sm:items-end">
          <label className="space-y-1 text-xs font-medium">Find students<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9 pr-9" placeholder="Name, username, or bio" value={filters.searchQuery || ""} onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })} />{searchingUsers && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div></label>
          <label className="space-y-1 text-xs font-medium">Class<select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.classLevel || "All"} onChange={(e) => setFilters({ ...filters, classLevel: e.target.value })}><option>All</option>{["Class 9","Class 10","Class 11","Class 12","12+","Dropper"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="space-y-1 text-xs font-medium">City (if shared)<Input placeholder="Optional city" value={filters.city || ""} onChange={(e) => setFilters({ ...filters, city: e.target.value })} /></label>
        </CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{users.map((person) => <Card key={person.username}><CardHeader><CardTitle className="break-words text-lg">{person.fullName || person.username}</CardTitle><CardDescription>@{person.username}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{[person.classLevel,person.examFocus,person.city].filter(Boolean).join(" · ")}</p>{person.bio && <p className="line-clamp-3 text-sm">{person.bio}</p>}<div className="flex flex-wrap gap-2"><a href={`/profile/${encodeURIComponent(person.username)}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline">Public profile</Button></a><Button size="sm" onClick={() => void openChat(person.username)}><MessageCircle className="mr-2 size-4" />Message</Button></div></CardContent></Card>)}{users.length === 0 && <p className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{hasSearched ? "No students match these filters. Try a broader search." : "Use Search to find students. Profiles are available to signed-in students; personal topics remain private."}</p>}</div>
      </TabsContent>

      <TabsContent value="chats" className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="min-w-0"><CardHeader><CardTitle>Direct messages</CardTitle><CardDescription>Messages expire after 24 hours.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex gap-2"><Input placeholder="Username" value={newChatUsername} onChange={(e) => setNewChatUsername(e.target.value)} /><Button aria-label="Start chat" disabled={busy || !newChatUsername.trim()} onClick={() => void openChat(newChatUsername)}><Plus className="size-4" /></Button></div><div className="space-y-2">{inbox.map((item) => <button key={item.id} onClick={() => { setSelectedChat(item.id); setChat(null); }} className={`w-full min-w-0 rounded-lg border p-3 text-left ${selectedChat === item.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><span className="block truncate text-sm font-medium">{("fullName" in item.otherUser && item.otherUser.fullName) || `@${item.otherUser.username}`}</span><span className="block truncate text-xs text-muted-foreground">{item.lastMessage?.body || "No messages yet"}</span></button>)}</div></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>{chat ? `@${inbox.find((item) => item.id === selectedChat)?.otherUser.username || "Chat"}` : "Choose a conversation"}</CardTitle><CardDescription>Chats are encrypted in storage and expire after 24 hours.</CardDescription></CardHeader><CardContent className="space-y-3">
          {simplexStatus?.configured && <div className="rounded-lg border bg-muted/40 p-3 text-sm"><p>{simplexStatus.linked ? "Your SimpleX account is linked." : "Link your SimpleX account to use relay delivery."}</p>{!simplexStatus.linked && <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => void perform(async () => setSimplexLink(await createSimplexAccountLinkAction()))}>Connect SimpleX</Button>}<Button className="ml-2 mt-2" size="sm" variant="ghost" onClick={() => void perform(async () => setSimplexStatus(await getSimplexConnectionStatusAction()))}>Refresh status</Button>{simplexLink && <div className="mt-3 space-y-2 rounded-md bg-background p-3"><p className="text-xs">{simplexLink.instructions}</p><a className="break-all text-xs text-primary underline" href={simplexLink.contactLink} target="_blank" rel="noopener noreferrer">Open SimpleX contact link</a><p className="font-mono text-sm">{simplexLink.linkCode}</p></div>}</div>}
          {chat && <><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void perform(async () => { await updateChatPreferenceAction(chat.conversation.id,"mute",!chat.conversation.muted); await refreshChat(chat.conversation.id); })}>{chat.conversation.muted ? "Unmute" : "Mute"}</Button><Button size="sm" variant="outline" onClick={() => void perform(async () => { await updateChatPreferenceAction(chat.conversation.id,"close",!chat.conversation.closed); await refreshChat(chat.conversation.id); })}>{chat.conversation.closed ? "Reopen chat" : "Close chat"}</Button><Button size="sm" variant="destructive" onClick={() => { const reason = window.prompt("Why are you reporting this conversation?"); if (reason?.trim()) void perform(async () => { await reportChatAction(chat.conversation.id,reason,inbox.find((item) => item.id === selectedChat)?.otherUser.username || ""); toast({ title: "Report emailed to the admin" }); }); }}><Flag className="mr-1 size-4" />Report</Button></div>
          <div className="max-h-[55vh] min-h-64 space-y-3 overflow-y-auto rounded-lg border p-3">{chat.messages.map((message) => <div key={message.id} className={`max-w-[90%] rounded-lg p-3 text-sm sm:max-w-[75%] ${message.mine ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}><p className="mb-1 text-xs opacity-70">{message.mine ? "You" : `@${message.sender.username}`} · {new Date(message.createdAt).toLocaleTimeString()}</p><p className="whitespace-pre-wrap break-words">{message.body}</p>{message.mine && message.relayStatus === "failed" && <p className="mt-1 text-xs font-medium">In-app delivery saved; SimpleX relay unavailable.</p>}{message.mine && message.relayStatus === "app-only" && simplexStatus?.configured && <p className="mt-1 text-xs opacity-70">App-only: connect both accounts to relay this message through SimpleX.</p>}</div>)}{chat.messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Say hello to start the conversation.</p>}</div>
          <div className="flex gap-2"><Textarea className="min-h-10" placeholder={chat.conversation.closed ? "Reopen this chat to send" : "Write a message"} value={draft} disabled={chat.conversation.closed} onChange={(e) => setDraft(e.target.value)} /><Button disabled={busy || chat.conversation.closed || !draft.trim()} onClick={send}><Send className="size-4" /></Button></div></>}
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="groups" className="space-y-4">
        <Card><CardHeader><CardTitle>Create a study group</CardTitle><CardDescription>Groups have member-only posts, shared resources, and revision rooms.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Input placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} /><Input placeholder="Subject" value={groupSubject} onChange={(e) => setGroupSubject(e.target.value)} /><Input placeholder="Description" value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} /><Input placeholder="Optional study schedule" value={groupSchedule} onChange={(e) => setGroupSchedule(e.target.value)} /><Button className="sm:col-span-2 sm:justify-self-start" disabled={busy} onClick={createGroup}>Create group</Button></CardContent></Card>
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><h2 className="font-semibold">Your groups</h2>{community.groups.map((group) => <Card key={group.id}><CardContent className="space-y-3 p-4"><button className="w-full text-left" onClick={() => void loadGroup(group.id)}><p className="font-semibold">{group.name}</p><p className="text-sm text-muted-foreground">{group.subject} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"}</p><p className="text-sm">{group.description}</p></button><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void loadGroup(group.id)}>Open group</Button>{group.isOwner && group.memberCount === 1 ? <Button size="sm" variant="destructive" onClick={() => void perform(async () => { if (!window.confirm("Delete this empty group and its posts?")) return; await deleteStudyGroupAction(group.id); await refreshCommunity(); setSelectedGroup(null); })}>Delete empty group</Button> : <Button size="sm" variant="ghost" onClick={() => void perform(async () => { await leaveStudyGroupAction(group.id); await refreshCommunity(); if (selectedGroup === group.id) setSelectedGroup(null); })}><LogOut className="mr-1 size-4" />Leave</Button>}</div></CardContent></Card>)}{community.groups.length === 0 && <p className="text-sm text-muted-foreground">Create a group or join one below.</p>}</div><div className="space-y-3"><div><h2 className="font-semibold">Available study groups</h2><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9 pr-9" placeholder="Search groups by name, subject, or exam" value={groupSearchQuery} onChange={(event) => setGroupSearchQuery(event.target.value)} />{searchingGroups && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div></div>{(searchedGroups ?? community.publicGroups).map((group) => <Card key={group.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-semibold">{group.name}</p><p className="text-sm text-muted-foreground">{group.subject} · {group.memberCount} members</p><p className="line-clamp-2 text-xs text-muted-foreground">{group.description}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(async () => { await joinStudyGroupAction(group.id); await refreshCommunity(); })}>Join</Button></CardContent></Card>)}{(searchedGroups ?? community.publicGroups).length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No groups match that search.</p>}</div></div>
        {selectedGroup && selectedGroupInfo?.isOwner && <Card><CardHeader><CardTitle>Add students</CardTitle><CardDescription>Search by username, name, or class. Added students can access this group’s posts and revision rooms.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9 pr-9" placeholder="Search students to add" value={inviteeQuery} onChange={(event) => setInviteeQuery(event.target.value)} />{searchingInvitees && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div>{inviteeQuery.trim().length < 2 ? <p className="text-xs text-muted-foreground">Enter at least two characters to search.</p> : invitees.length === 0 && !searchingInvitees ? <p className="text-sm text-muted-foreground">No students found.</p> : <div className="divide-y rounded-md border">{invitees.map((person) => <div key={person.username} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{person.fullName || person.username}</p><p className="text-xs text-muted-foreground">@{person.username}{person.classLevel ? ` · ${person.classLevel}` : ""}</p></div><Button size="sm" disabled={busy} onClick={() => void addGroupMember(person.username)}>Add</Button></div>)}</div>}</CardContent></Card>}
        {selectedGroup && <Card><CardHeader><CardTitle>Group activity</CardTitle><CardDescription>Only group members can see and post here.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 sm:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={groupPostKind} onChange={(e) => setGroupPostKind(e.target.value as typeof groupPostKind)}><option value="question">Group question</option><option value="resource">Share a resource</option><option value="session">Create revision room</option></select><Input placeholder="Title" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} /></div><Textarea placeholder="Details" value={postBody} onChange={(e) => setPostBody(e.target.value)} />{groupPostKind === "resource" && <Input placeholder="Resource link (https://…)" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />}{groupPostKind === "session" && <><Input placeholder="Shared topic list, comma separated" value={topicLabels} onChange={(e) => setTopicLabels(e.target.value)} /><Textarea placeholder="Shared quiz questions, one per line" value={quizQuestions} onChange={(e) => setQuizQuestions(e.target.value)} /><label className="text-sm">Timer minutes <Input type="number" min={1} max={360} value={roomMinutes} onChange={(e) => setRoomMinutes(Number(e.target.value))} /></label></>}<Button disabled={busy || !postTitle.trim() || !postBody.trim()} onClick={createGroupPost}>Post to group</Button><div className="space-y-3">{selectedGroupPosts.map((post) => <Card key={post.id}><CardHeader><CardDescription>{post.kind} · @{post.author.username}</CardDescription><CardTitle className="text-lg">{post.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm">{post.body}</p>{post.url && <a className="break-all text-sm text-primary underline" href={post.url} target="_blank" rel="noopener noreferrer">{post.url}</a>}{post.kind === "session" && <><div className="flex flex-wrap gap-2">{post.topicLabels?.map((topic) => <span key={topic} className="rounded-full bg-muted px-3 py-1 text-xs">{topic}</span>)}</div>{post.quizQuestions?.map((question, index) => <label key={index} className="flex gap-2 text-sm"><input type="checkbox" />{question}</label>)}<div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => setRoomTimer((post.durationMinutes || 30) * 60)}><Timer className="mr-2 size-4" />Start {post.durationMinutes || 30} minute timer</Button>{roomTimer !== null && roomTimer > 0 && <strong className="font-mono">{Math.floor(roomTimer / 60)}:{String(roomTimer % 60).padStart(2,"0")}</strong>}{roomTimer === 0 && <span className="text-xs text-muted-foreground">Timer complete</span>}</div></>}</CardContent></Card>)}</div></CardContent></Card>}
      </TabsContent>

      <TabsContent value="questions" className="space-y-4">
        <Card><CardHeader><CardTitle>Ask the community</CardTitle><CardDescription>Your question and username are public to signed-in students.</CardDescription></CardHeader><CardContent className="space-y-3"><Input placeholder="Question title" value={questionDraft.title} onChange={(e) => setQuestionDraft({ ...questionDraft, title: e.target.value })} /><Textarea placeholder="Add context" value={questionDraft.body} onChange={(e) => setQuestionDraft({ ...questionDraft, body: e.target.value })} /><Button disabled={busy || !questionDraft.title.trim() || !questionDraft.body.trim()} onClick={() => void perform(async () => { await createCommunityPostAction({ kind: "question", ...questionDraft }); setQuestionDraft({ title: "", body: "" }); await refreshCommunity(); })}>Post question</Button></CardContent></Card>
        {community.questions.map((question) => <Card key={question.id}><CardHeader><CardDescription>@{question.author.username}</CardDescription><CardTitle>{question.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm">{question.body}</p><div className="space-y-2">{question.answers?.map((answer) => <div key={answer.id} className="rounded-lg bg-muted p-3"><p className="mb-1 text-xs text-muted-foreground">@{answer.author.username}</p><p className="whitespace-pre-wrap text-sm">{answer.body}</p><Button size="sm" variant="ghost" onClick={() => void perform(async () => { await markAnswerHelpfulAction(answer.id); await refreshCommunity(); })}><Check className="mr-1 size-4" />Helpful ({answer.helpfulCount})</Button></div>)}</div><Textarea placeholder="Write an answer" value={answerDrafts[question.id] || ""} onChange={(e) => setAnswerDrafts({ ...answerDrafts, [question.id]: e.target.value })} /><Button size="sm" disabled={busy || !answerDrafts[question.id]?.trim()} onClick={() => void perform(async () => { const body = answerDrafts[question.id]; await createCommunityPostAction({ kind: "answer", title: `Answer: ${question.title}`, body, parentId: question.id }); setAnswerDrafts({ ...answerDrafts, [question.id]: "" }); await refreshCommunity(); })}><Send className="mr-2 size-4" />Answer</Button></CardContent></Card>)}
      </TabsContent>

      <TabsContent value="accountability" className="space-y-4">
        <Card><CardHeader><CardTitle>Accountability partners</CardTitle><CardDescription>Share a weekly goal and schedule only when you opt in. You can turn it off any time.</CardDescription></CardHeader><CardContent className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountability.enabled} onChange={(e) => setAccountability({ ...accountability, enabled: e.target.checked })} />Match me with a partner</label><Input placeholder="Weekly study goal" value={accountability.weeklyGoal} onChange={(e) => setAccountability({ ...accountability, weeklyGoal: e.target.value })} /><Input placeholder="Available schedule" value={accountability.schedule} onChange={(e) => setAccountability({ ...accountability, schedule: e.target.value })} /><Button disabled={busy || !accountability.weeklyGoal.trim() || !accountability.schedule.trim()} onClick={saveAccountability}>Save preferences</Button></CardContent></Card>
        {community.accountabilityProfiles.map((partner) => <Card key={partner.username}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{partner.fullName || partner.username} <span className="font-normal text-muted-foreground">@{partner.username}</span></p><p className="text-sm">{partner.weeklyGoal}</p><p className="text-xs text-muted-foreground">{partner.schedule}</p></div><Button size="sm" onClick={() => void openChat(partner.username)}><MessageCircle className="mr-2 size-4" />Message</Button></CardContent></Card>)}
      </TabsContent>

      <TabsContent value="resources" className="space-y-4">
        <Card><CardHeader><CardTitle>Share a study resource</CardTitle><CardDescription>Only share material you have permission to distribute.</CardDescription></CardHeader><CardContent className="space-y-3"><Input placeholder="Title" value={resourceDraft.title} onChange={(e) => setResourceDraft({ ...resourceDraft, title: e.target.value })} /><Textarea placeholder="Notes or description" value={resourceDraft.body} onChange={(e) => setResourceDraft({ ...resourceDraft, body: e.target.value })} /><Input placeholder="Optional https:// link" value={resourceDraft.url} onChange={(e) => setResourceDraft({ ...resourceDraft, url: e.target.value })} /><Button disabled={busy || !resourceDraft.title.trim() || !resourceDraft.body.trim()} onClick={() => void perform(async () => { await createCommunityPostAction({ kind: "resource", ...resourceDraft }); setResourceDraft({ title: "", body: "", url: "" }); await refreshCommunity(); })}><BookOpenCheck className="mr-2 size-4" />Share resource</Button></CardContent></Card>
        {community.resources.map((resource) => <Card key={resource.id}><CardHeader><CardDescription>@{resource.author.username}</CardDescription><CardTitle>{resource.title}</CardTitle></CardHeader><CardContent className="space-y-2"><p className="whitespace-pre-wrap text-sm">{resource.body}</p>{resource.url && <a className="break-all text-sm text-primary underline" href={resource.url} target="_blank" rel="noopener noreferrer">{resource.url}</a>}</CardContent></Card>)}
      </TabsContent>
    </Tabs>
    {busy && <div className="sr-only" role="status"><Loader2 className="animate-spin" /></div>}
  </div>;
}
