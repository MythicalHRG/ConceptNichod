"use client";

import { useState, useEffect } from "react";
import {
  getAllUsersAction,
  deleteUserAction,
  updateUserCredentialsAction,
  getBansAction,
  banEntityAction,
  unbanEntityAction,
  getAllStudyGroupsAdminAction,
  deleteStudyGroupAdminAction,
} from "@/app/actions/admin";
import {
  createBroadcastAction,
  getActiveBroadcastsAction,
  deleteBroadcastAction,
} from "@/app/actions/broadcast";
import {
  sendEmailBroadcastAction,
  getEmailBroadcastHistoryAction,
} from "@/app/actions/email-broadcast";
import {
  getAdminDonationSettingsAction,
  updateDonationSettingsAction,
} from "@/app/actions/donation";
import {
  getChangelogsAction,
  createChangelogAction,
  updateChangelogAction,
  deleteChangelogAction,
} from "@/app/actions/changelog";
import { Rupee } from "@/components/ui/rupee-symbol";
import { MythicalUserBadge } from "@/components/ui/mythical-glass";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Trash2,
  Ban,
  Upload,
  Mail,
  Send,
  Sparkles,
  Paperclip,
  CheckCircle2,
  Clock,
  Radio,
  Heart,
  Pencil,
  Wand2,
  AlertCircle,
  Users,
  MessageSquare,
  Search,
  ShieldAlert,
} from "lucide-react";
import { UploadButton } from "@/utils/uploadthing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DonationReconciliation } from "@/components/admin/donation-reconciliation";

function parseSemver(v: string) {
  if (!v) return null;
  const match = v.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: match[2] !== undefined ? parseInt(match[2], 10) : 0,
    patch: match[3] !== undefined ? parseInt(match[3], 10) : 0,
  };
}

function calculateNextVersion(majorDigit: number | string, category: string, logs: any[]): string {
  const targetMajor = typeof majorDigit === "string" ? parseInt(majorDigit, 10) || 2 : majorDigit;
  const matching = (logs || [])
    .map((l) => parseSemver(l.version))
    .filter((s): s is { major: number; minor: number; patch: number } => s !== null && s.major === targetMajor);

  if (category === "Major Update") {
    return `v${targetMajor + 1}.0.0`;
  }

  if (category === "Feature") {
    if (matching.length > 0) {
      const maxMinor = Math.max(...matching.map((s) => s.minor));
      return `v${targetMajor}.${maxMinor + 1}.0`;
    }
    return `v${targetMajor}.1.0`;
  }

  // Improvement, Bug Fix, Security -> increment third digit (patch)
  if (matching.length > 0) {
    const maxMinor = Math.max(...matching.map((s) => s.minor));
    const atMaxMinor = matching.filter((s) => s.minor === maxMinor);
    const maxPatch = atMaxMinor.length > 0 ? Math.max(...atMaxMinor.map((s) => s.patch)) : 0;
    return `v${targetMajor}.${maxMinor}.${maxPatch + 1}`;
  }
  return `v${targetMajor}.0.1`;
}

export function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [activeBroadcasts, setActiveBroadcasts] = useState<any[]>([]);
  const [emailBroadcasts, setEmailBroadcasts] = useState<any[]>([]);
  const [changelogs, setChangelogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Bans state
  const [banType, setBanType] = useState<"ip" | "email" | "username">("email");
  const [banValue, setBanValue] = useState("");
  const [banReason, setBanReason] = useState("");

  // Edit Credentials Dialog state (Platform Owner only)
  const [editingUser, setEditingUser] = useState<{ uuid: string; username: string; email: string; fullName: string } | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);

  // In-app Broadcast state
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [expiryHours, setExpiryHours] = useState<string>("36");

  // Email Broadcast state
  const [recipientType, setRecipientType] = useState<"all" | "custom">("all");
  const [customTo, setCustomTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailAttachmentUrl, setEmailAttachmentUrl] = useState<string | null>(null);
  const [emailAttachmentName, setEmailAttachmentName] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  // Changelog state
  const [changelogVersion, setChangelogVersion] = useState("");
  const [changelogTitle, setChangelogTitle] = useState("");
  const [changelogCategory, setChangelogCategory] = useState("Feature");
  const [changelogContent, setChangelogContent] = useState("");
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [majorDigit, setMajorDigit] = useState("2");
  const [editingChangelogId, setEditingChangelogId] = useState<string | null>(null);
  const [isAutoVersion, setIsAutoVersion] = useState(true);

  // Donation & UPI State
  const [donationSettings, setDonationSettings] = useState({
    upiId: "",
  });
  const [isSavingDonation, setIsSavingDonation] = useState(false);

  // Study Groups State
  const [studyGroups, setStudyGroups] = useState<any[]>([]);
  const [studyGroupSearch, setStudyGroupSearch] = useState("");
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<any | null>(null);

  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, bansRes, broadcastsRes, emailRes, changelogsRes, studyGroupsRes] =
        await Promise.all([
          getAllUsersAction(),
          getBansAction(),
          getActiveBroadcastsAction(),
          getEmailBroadcastHistoryAction().catch(() => ({ success: true, broadcasts: [] })),
          getChangelogsAction().catch(() => ({ success: true, changelogs: [] })),
          getAllStudyGroupsAdminAction().catch(() => ({ success: true, groups: [] })),
        ]);

      if (usersRes.success) setUsers(usersRes.users);
      if (bansRes.success) setBans(bansRes.bans);
      if (broadcastsRes.success) setActiveBroadcasts(broadcastsRes.broadcasts);
      if (emailRes?.success) setEmailBroadcasts(emailRes.broadcasts || []);
      if (changelogsRes?.success) setChangelogs(changelogsRes.changelogs || []);
      if (studyGroupsRes?.success) setStudyGroups(studyGroupsRes.groups || []);
      const donationRes = await getAdminDonationSettingsAction().catch(() => ({ success: false, settings: null }));
      if (donationRes?.success && donationRes.settings) {
        setDonationSettings({ upiId: donationRes.settings.upiId || "" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-assign version tag based on 1st digit (major) and category (type)
  useEffect(() => {
    if (isAutoVersion && !editingChangelogId) {
      const nextVer = calculateNextVersion(majorDigit, changelogCategory, changelogs);
      setChangelogVersion(nextVer);
    }
  }, [majorDigit, changelogCategory, changelogs, isAutoVersion, editingChangelogId]);

  const handleDeleteStudyGroup = async (groupId: string) => {
    try {
      setDeletingGroupId(groupId);
      const res = await deleteStudyGroupAdminAction(groupId);
      if (res.success) {
        toast({ title: "Study Group Deleted", description: res.message });
        setStudyGroups((prev) => prev.filter((g) => g.id !== groupId));
        setGroupToDelete(null);
      }
    } catch (e: any) {
      toast({ title: "Failed to delete group", description: e.message, variant: "destructive" });
    } finally {
      setDeletingGroupId(null);
    }
  };

  const filteredStudyGroups = studyGroups.filter((g) => {
    if (!studyGroupSearch.trim()) return true;
    const q = studyGroupSearch.toLowerCase();
    return (
      (g.name && g.name.toLowerCase().includes(q)) ||
      (g.subject && g.subject.toLowerCase().includes(q)) ||
      (g.examFocus && g.examFocus.toLowerCase().includes(q)) ||
      (g.ownerUsername && g.ownerUsername.toLowerCase().includes(q)) ||
      (g.description && g.description.toLowerCase().includes(q))
    );
  });

  const handleDeleteUser = async (uuid: string) => {
    if (!confirm("Are you sure you want to permanently delete this user?")) return;
    try {
      await deleteUserAction(uuid);
      toast({ title: "User deleted successfully" });
      setUsers(users.filter((u) => u.uuid !== uuid));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleOpenEditUser = (u: any) => {
    setEditingUser(u);
    setEditUsername(u.username || "");
    setEditEmail(u.email || "");
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editUsername.trim() || !editEmail.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Username and email cannot be empty." });
      return;
    }

    setIsSavingCredentials(true);
    try {
      const res = await updateUserCredentialsAction({
        targetUuid: editingUser.uuid,
        newUsername: editUsername.trim(),
        newEmail: editEmail.trim(),
      });

      if (res.success && res.user) {
        toast({
          title: "Credentials Updated",
          description: `Updated @${res.user.username} (${res.user.email})`,
        });

        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.uuid === editingUser.uuid
              ? { ...u, username: res.user!.username, email: res.user!.email }
              : u
          )
        );

        setEditingUser(null);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message || "Could not update credentials",
      });
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const handleBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banValue) return;
    try {
      await banEntityAction(banType, banValue, banReason);
      toast({ title: "Ban added successfully" });
      setBanValue("");
      setBanReason("");
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleUnban = async (id: string) => {
    try {
      await unbanEntityAction(id);
      toast({ title: "Unbanned successfully" });
      setBans(bans.filter((b) => b._id !== id));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Create In-App Broadcast
  const handleCreateBroadcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBroadcastLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("expiryHours", expiryHours);
    if (uploadedFileUrl) {
      formData.set("fileUrl", uploadedFileUrl);
    }

    try {
      await createBroadcastAction(formData);
      toast({
        title: "Broadcast Published!",
        description: `Message is now live for all users for ${expiryHours} hours.`,
      });
      form.reset();
      setUploadedFileUrl(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    if (!confirm("Are you sure you want to delete this broadcast?")) return;
    try {
      await deleteBroadcastAction(id);
      toast({ title: "Broadcast deleted successfully" });
      setActiveBroadcasts(activeBroadcasts.filter((b) => b._id !== id));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Send Email Broadcast
  const handleSendEmailBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Subject and Body are required." });
      return;
    }

    setEmailSending(true);
    try {
      const formData = new FormData();
      formData.append("recipientType", recipientType);
      if (recipientType === "custom") {
        formData.append("to", customTo);
      }
      formData.append("cc", emailCc);
      formData.append("bcc", emailBcc);
      formData.append("subject", emailSubject);
      formData.append("body", emailBody);
      if (emailAttachmentUrl) {
        formData.append("attachmentUrl", emailAttachmentUrl);
        formData.append("attachmentName", emailAttachmentName || "attachment");
      }

      const res = await sendEmailBroadcastAction(formData);
      toast({
        title: "Email Broadcast Sent!",
        description: `Successfully delivered to ${res.sentCount} recipient(s) from mythicalhrg@gmail.com`,
      });

      setEmailSubject("");
      setEmailBody("");
      setCustomTo("");
      setEmailCc("");
      setEmailBcc("");
      setEmailAttachmentUrl(null);
      setEmailAttachmentName("");
      fetchData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Email Broadcast Failed", description: e.message });
    } finally {
      setEmailSending(false);
    }
  };

  // Create or Update Changelog
  const handleCreateChangelog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changelogVersion.trim() || !changelogTitle.trim() || !changelogContent.trim()) {
      toast({ variant: "destructive", title: "Error", description: "All fields are required." });
      return;
    }

    setChangelogLoading(true);
    try {
      const formData = new FormData();
      formData.append("version", changelogVersion);
      formData.append("title", changelogTitle);
      formData.append("category", changelogCategory);
      formData.append("content", changelogContent);

      if (editingChangelogId) {
        await updateChangelogAction(editingChangelogId, formData);
        toast({ title: "Changelog Updated!", description: `${changelogVersion} updated successfully.` });
        setEditingChangelogId(null);
      } else {
        const res = await createChangelogAction(formData);
        toast({ 
          title: (res as any)?.updated ? "Changelog Updated!" : "Changelog Published!", 
          description: `${changelogVersion} is live on /changelog` 
        });
      }

      setChangelogTitle("");
      setChangelogContent("");
      setIsAutoVersion(true);
      fetchData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setChangelogLoading(false);
    }
  };

  const handleEditChangelog = (log: any) => {
    setEditingChangelogId(log._id);
    setChangelogVersion(log.version);
    setChangelogCategory(log.category);
    setChangelogTitle(log.title);
    setChangelogContent(log.content);
    setIsAutoVersion(false);
    const parsed = parseSemver(log.version);
    if (parsed) {
      setMajorDigit(String(parsed.major));
    }
    const formEl = document.getElementById("changelog-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCancelEditChangelog = () => {
    setEditingChangelogId(null);
    setChangelogTitle("");
    setChangelogContent("");
    setIsAutoVersion(true);
    const nextVer = calculateNextVersion(majorDigit, changelogCategory, changelogs);
    setChangelogVersion(nextVer);
  };

  const handleSaveDonationSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donationSettings.upiId.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Official UPI ID cannot be empty." });
      return;
    }
    setIsSavingDonation(true);
    try {
      const res = await updateDonationSettingsAction({
        upiId: donationSettings.upiId.trim(),
      });
      if (res.success) {
        toast({ title: "UPI ID Saved", description: "Official UPI ID updated successfully." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsSavingDonation(false);
    }
  };

  const handleDeleteChangelog = async (id: string) => {
    if (!confirm("Are you sure you want to delete this changelog entry?")) return;
    try {
      await deleteChangelogAction(id);
      toast({ title: "Changelog entry removed" });
      setChangelogs(changelogs.filter((c) => c._id !== id));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="users">
        <TabsList className="mb-4 flex flex-wrap gap-1">
          <TabsTrigger value="users">Manage Users</TabsTrigger>
          <TabsTrigger value="bans">Manage Bans</TabsTrigger>
          <TabsTrigger value="broadcasts" className="flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-primary" /> In-App Broadcasts
          </TabsTrigger>
          <TabsTrigger value="email-broadcast" className="flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-emerald-500" /> Email Broadcast
          </TabsTrigger>
          <TabsTrigger value="changelog" className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" /> Changelog Manager
          </TabsTrigger>
          <TabsTrigger value="donations" className="flex items-center gap-1.5">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" /> Donations & UPI
          </TabsTrigger>
          <TabsTrigger value="study-groups" className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-cyan-400" /> Study Groups ({studyGroups.length})
          </TabsTrigger>
        </TabsList>

        {/* USERS TAB */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users ({users.length})</CardTitle>
              <CardDescription>View and manage all registered users.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto touch-scrollbar">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="text-xs uppercase bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">First Login</th>
                      <th className="px-4 py-3">Last Login</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isMythical = u.username.toLowerCase() === "mythicalhrg";
                      return (
                        <tr key={u.uuid} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 font-medium">
                            {isMythical ? (
                              <MythicalUserBadge username={u.username} size="sm" />
                            ) : (
                              <span className="text-foreground/90 font-mono text-xs">@{u.username}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">{u.email}</td>
                          <td className="px-4 py-3">{u.fullName}</td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded text-[11px] w-fit font-medium">
                                {u.firstLoginIp || u.lastKnownIp || "Unknown"}
                              </span>
                              {u.firstLoginAt ? (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-primary/70 inline" />
                                  {new Date(u.firstLoginAt).toLocaleString(undefined, {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(u.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded text-[11px] w-fit font-medium">
                                {u.lastLoginIp || u.lastKnownIp || "Unknown"}
                              </span>
                              {u.lastLoginAt ? (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-emerald-500 inline" />
                                  {new Date(u.lastLoginAt).toLocaleString(undefined, {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(u.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditUser(u)}
                                disabled={u.username === "mythicalhrg"}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5 border-primary/30 hover:bg-primary/10"
                                title={u.username === "mythicalhrg" ? "Root platform owner credentials are protected from modification" : "Edit user credentials"}
                              >
                                <Pencil className="w-3.5 h-3.5 text-primary" /> Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteUser(u.uuid)}
                                disabled={u.username === "mythicalhrg"}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BANS TAB */}
        <TabsContent value="bans">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add Ban</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBan} className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={banType} onValueChange={(val: any) => setBanType(val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="username">Username</SelectItem>
                      <SelectItem value="ip">IP Address</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2] space-y-2">
                  <label className="text-sm font-medium">Value to Ban</label>
                  <Input required placeholder="e.g. badguy@gmail.com or 192.168.1.1" value={banValue} onChange={(e) => setBanValue(e.target.value)} />
                </div>
                <div className="flex-[2] space-y-2">
                  <label className="text-sm font-medium">Reason (Optional)</label>
                  <Input placeholder="Why is this banned?" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
                </div>
                <Button type="submit" variant="destructive">
                  <Ban className="w-4 h-4 mr-2" /> Ban
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Bans ({bans.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto touch-scrollbar">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="text-xs uppercase bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Banned On</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bans.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No active bans.</td></tr>
                    ) : (
                      bans.map((b) => (
                        <tr key={b._id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="px-4 py-3 font-semibold uppercase text-xs">{b.type}</td>
                          <td className="px-4 py-3 font-mono text-xs">{b.value}</td>
                          <td className="px-4 py-3 text-muted-foreground">{b.reason || "None"}</td>
                          <td className="px-4 py-3">{new Date(b.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="outline" size="sm" onClick={() => handleUnban(b._id)}>
                              Unban
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* IN-APP BROADCASTS TAB (Adjustable Expiry) */}
        <TabsContent value="broadcasts">
          <Card>
            <CardHeader>
              <CardTitle>Send In-App Global Broadcast</CardTitle>
              <CardDescription>
                This notification appears in the notification bell for all users and automatically expires after your selected duration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateBroadcast} className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input name="subject" placeholder="e.g. Server Maintenance Tonight" required />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Broadcast Duration / Expiry</label>
                  <Select value={expiryHours} onValueChange={setExpiryHours}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 Hours</SelectItem>
                      <SelectItem value="12">12 Hours</SelectItem>
                      <SelectItem value="24">24 Hours (1 Day)</SelectItem>
                      <SelectItem value="36">36 Hours (Standard)</SelectItem>
                      <SelectItem value="48">48 Hours (2 Days)</SelectItem>
                      <SelectItem value="72">72 Hours (3 Days)</SelectItem>
                      <SelectItem value="168">168 Hours (1 Week)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <Textarea name="message" placeholder="Type your broadcast message here..." rows={5} required />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Attachment (Max 512MB, Optional)</label>
                  {!uploadedFileUrl ? (
                    <UploadButton
                      endpoint="broadcastAttachment"
                      onClientUploadComplete={(res) => {
                        setUploadedFileUrl(res?.[0]?.url || null);
                        toast({ title: "Upload Success", description: "File uploaded and attached." });
                      }}
                      onUploadError={(error: Error) => {
                        toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
                      }}
                    />
                  ) : (
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-green-600 font-medium break-all">File Attached Successfully!</p>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setUploadedFileUrl(null)}>Remove</Button>
                    </div>
                  )}
                  {uploadedFileUrl && <input type="hidden" name="fileUrl" value={uploadedFileUrl} />}
                </div>
                
                <Button type="submit" disabled={broadcastLoading}>
                  {broadcastLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send In-App Broadcast
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Active Broadcasts ({activeBroadcasts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto touch-scrollbar">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="text-xs uppercase bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">Expires In</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBroadcasts.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No active broadcasts.</td></tr>
                    ) : (
                      activeBroadcasts.map((b) => {
                        const hoursLeft = Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)));
                        return (
                          <tr key={b._id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="px-4 py-3 font-medium max-w-[200px] truncate">{b.subject}</td>
                            <td className="px-4 py-3 max-w-[300px] truncate">
                              {b.message}
                              {b.fileUrl && (
                                <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1 text-xs text-primary hover:underline flex items-center">
                                  <Upload className="w-3 h-3 mr-1" /> Attachment
                                </a>
                              )}
                            </td>
                            <td className="px-4 py-3">{hoursLeft} hours</td>
                            <td className="px-4 py-3 text-right">
                              <Button variant="destructive" size="sm" onClick={() => handleDeleteBroadcast(b._id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAIL BROADCAST SYSTEM TAB */}
        <TabsContent value="email-broadcast">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" /> Email Broadcast System
                  </CardTitle>
                  <CardDescription>
                    Send official email announcements directly from <strong>mythicalhrg@gmail.com</strong> with BCC, CC, Subject, Body, and File Attachments.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-primary/5 text-primary">
                  Sender: mythicalhrg@gmail.com
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendEmailBroadcast} className="space-y-4 max-w-3xl">
                {/* Recipient Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Recipients (To)</label>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="recipType"
                        checked={recipientType === "all"}
                        onChange={() => setRecipientType("all")}
                        className="accent-primary"
                      />
                      <span>All Registered Users ({users.length} active users)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="recipType"
                        checked={recipientType === "custom"}
                        onChange={() => setRecipientType("custom")}
                        className="accent-primary"
                      />
                      <span>Custom Recipient Emails</span>
                    </label>
                  </div>

                  {recipientType === "custom" && (
                    <Input
                      placeholder="user1@gmail.com, user2@outlook.com (comma separated)"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      required
                    />
                  )}
                </div>

                {/* CC & BCC */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">CC (Optional, comma-separated)</label>
                    <Input
                      placeholder="manager@example.com"
                      value={emailCc}
                      onChange={(e) => setEmailCc(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">BCC (Optional, comma-separated)</label>
                    <Input
                      placeholder="auditor@example.com"
                      value={emailBcc}
                      onChange={(e) => setEmailBcc(e.target.value)}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Subject</label>
                  <Input
                    placeholder="e.g. Important Announcement: ConceptNichod Platform Updates"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    required
                  />
                </div>

                {/* Body */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Body (Plain text or formatted)</label>
                  <Textarea
                    placeholder="Write your email announcement here..."
                    rows={8}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    required
                    className="font-sans leading-relaxed"
                  />
                </div>

                {/* File Attachment via UploadThing */}
                <div className="space-y-2 p-3 bg-muted/40 rounded-lg border">
                  <label className="text-xs font-medium flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Attachment (Optional)
                  </label>
                  {!emailAttachmentUrl ? (
                    <UploadButton
                      endpoint="broadcastAttachment"
                      onClientUploadComplete={(res) => {
                        setEmailAttachmentUrl(res?.[0]?.url || null);
                        setEmailAttachmentName(res?.[0]?.name || "Attached_Document");
                        toast({ title: "Attachment Uploaded", description: res?.[0]?.name });
                      }}
                      onUploadError={(error: Error) => {
                        toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-between text-xs bg-background p-2 rounded border">
                      <span className="font-mono text-emerald-600 truncate max-w-sm">
                        ✓ {emailAttachmentName}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEmailAttachmentUrl(null);
                          setEmailAttachmentName("");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={emailSending} size="lg" className="w-full sm:w-auto">
                  {emailSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending Broadcast Emails...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email Broadcast
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Email Broadcast Sent History */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Sent Email Broadcasts History ({emailBroadcasts.length})</CardTitle>
              <CardDescription>Audited records of past email announcements.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto touch-scrollbar">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="text-xs uppercase bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Recipients</th>
                      <th className="px-4 py-3">Sent At</th>
                      <th className="px-4 py-3">Attachment</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailBroadcasts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No emails sent yet.
                        </td>
                      </tr>
                    ) : (
                      emailBroadcasts.map((e) => (
                        <tr key={e._id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium max-w-xs truncate">{e.subject}</td>
                          <td className="px-4 py-3 text-xs">
                            {e.to?.length || 0} recipient(s)
                            {e.cc?.length > 0 && ` (+${e.cc.length} CC)`}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(e.sentAt || e.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {e.attachmentUrl ? (
                              <a href={e.attachmentUrl} target="_blank" rel="noreferrer" className="text-primary underline flex items-center gap-1">
                                <Paperclip className="w-3 h-3" /> View
                              </a>
                            ) : (
                              "None"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant={e.status === "sent" ? "default" : "destructive"}>
                              {e.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CHANGELOG MANAGER TAB */}
        <TabsContent value="changelog">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> Publish Product Changelog
              </CardTitle>
              <CardDescription>
                Post website updates, AI model changes, and bug fixes to the public <code>/changelog</code> page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form id="changelog-form" onSubmit={handleCreateChangelog} className="space-y-4 max-w-2xl">
                {editingChangelogId && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-primary/40 bg-primary/10 text-xs">
                    <span className="font-semibold text-primary flex items-center gap-1.5">
                      <Pencil className="w-3.5 h-3.5" /> Editing Changelog {changelogVersion}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancelEditChangelog} className="h-6 text-xs">
                      Cancel Edit
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 1st Digit: Major Version */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>1st Digit (Major)</span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={majorDigit}
                      onChange={(e) => {
                        setMajorDigit(e.target.value);
                        if (!editingChangelogId) setIsAutoVersion(true);
                      }}
                      placeholder="e.g. 2"
                      className="font-mono text-center font-bold text-base"
                    />
                    <p className="text-[10px] text-muted-foreground">Sets generation (v{majorDigit || 2}.x.x)</p>
                  </div>

                  {/* Category: Version Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Category (Type)
                    </label>
                    <Select 
                      value={changelogCategory} 
                      onValueChange={(val) => {
                        setChangelogCategory(val);
                        if (!editingChangelogId) setIsAutoVersion(true);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Major Update">Major Update (Bumps 1st)</SelectItem>
                        <SelectItem value="Feature">Feature (Bumps 2nd Digit)</SelectItem>
                        <SelectItem value="Improvement">Improvement (Bumps 3rd)</SelectItem>
                        <SelectItem value="Bug Fix">Bug Fix (Bumps 3rd Digit)</SelectItem>
                        <SelectItem value="Security">Security (Bumps 3rd Digit)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {changelogCategory === "Major Update" && "Increments 1st digit"}
                      {changelogCategory === "Feature" && "Assigns 2nd digit (Minor)"}
                      {(changelogCategory === "Improvement" || changelogCategory === "Bug Fix" || changelogCategory === "Security") && "Assigns 3rd digit (Patch)"}
                    </p>
                  </div>

                  {/* Calculated Version Tag */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Version Tag
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAutoVersion(true);
                          const nextVer = calculateNextVersion(majorDigit, changelogCategory, changelogs);
                          setChangelogVersion(nextVer);
                        }}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                        title="Recompute auto version"
                      >
                        <Wand2 className="w-3 h-3" /> Auto
                      </button>
                    </div>
                    <Input
                      placeholder="e.g. v2.3.0"
                      value={changelogVersion}
                      onChange={(e) => {
                        setChangelogVersion(e.target.value);
                        setIsAutoVersion(false);
                      }}
                      required
                      className="font-mono font-bold"
                    />
                    <p className="text-[10px] text-muted-foreground truncate">
                      {isAutoVersion ? "✨ Auto-assigned based on category" : "Custom override"}
                    </p>
                  </div>
                </div>

                {/* Existing version notice */}
                {changelogs.some((c) => c.version.toLowerCase().trim() === changelogVersion.toLowerCase().trim() && c._id !== editingChangelogId) && (
                  <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Version <strong>{changelogVersion}</strong> already exists. Submitting will update the existing entry in-place.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] shrink-0"
                      onClick={() => {
                        const existing = changelogs.find((c) => c.version.toLowerCase().trim() === changelogVersion.toLowerCase().trim());
                        if (existing) handleEditChangelog(existing);
                      }}
                    >
                      Load Details
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    placeholder="e.g. Intelligent Concept Mirror & Oral Defense Analytics"
                    value={changelogTitle}
                    onChange={(e) => setChangelogTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Content / Details (Markdown or bullets supported)</label>
                  <Textarea
                    placeholder="Describe what was updated, improved, or fixed..."
                    rows={6}
                    value={changelogContent}
                    onChange={(e) => setChangelogContent(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={changelogLoading}>
                    {changelogLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {editingChangelogId ? `Save Changes to ${changelogVersion}` : "Publish Changelog Update"}
                  </Button>
                  {editingChangelogId && (
                    <Button type="button" variant="outline" onClick={handleCancelEditChangelog}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Published Changelogs ({changelogs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto touch-scrollbar">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="text-xs uppercase bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Version</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changelogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No changelogs published yet.
                        </td>
                      </tr>
                    ) : (
                      changelogs.map((c) => (
                        <tr key={c._id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="px-4 py-3 font-mono font-bold text-xs">{c.version}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{c.category}</Badge>
                          </td>
                          <td className="px-4 py-3 font-medium max-w-xs truncate">{c.title}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(c.releaseDate || c.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs gap-1"
                                onClick={() => handleEditChangelog(c)}
                                title="Edit this changelog"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Edit</span>
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => handleDeleteChangelog(c._id)}
                                title="Delete changelog"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        
        </TabsContent>

        {/* DONATIONS & UPI CONFIG TAB */}
        <TabsContent value="donations">
          <div className="mb-8"><DonationReconciliation /></div>
          <div className="max-w-2xl mx-auto space-y-6">
            <Card className="border-border/80 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500" /> UPI Configuration
                </CardTitle>
                <CardDescription>
                  Configure your official UPI ID (VPA). All student contributions made in <Rupee /> on the donation page (<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/donate</code>) will be directed to this UPI ID.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveDonationSettings} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Official UPI ID / VPA
                    </label>
                    <Input
                      value={donationSettings.upiId}
                      onChange={(e) => setDonationSettings({ upiId: e.target.value })}
                      placeholder="e.g. harsh.2525@ptaxis"
                      required
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      The official VPA is the only payment destination displayed. The page will not show an unverified QR image.
                    </p>
                  </div>

                  <Button type="submit" disabled={isSavingDonation} className="w-full sm:w-auto">
                    {isSavingDonation ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Heart className="mr-2 h-4 w-4 fill-current text-rose-500" />
                    )}
                    Save UPI Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* STUDY GROUPS TAB */}
        <TabsContent value="study-groups">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-400" /> Study Groups & Chit-Chat Purge
                </CardTitle>
                <CardDescription>
                  Review active study groups. Purge chit-chat, spam, or off-topic groups and wipe all associated messages permanently.
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search groups, subjects, owners..."
                    value={studyGroupSearch}
                    onChange={(e) => setStudyGroupSearch(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-border/50 bg-card/50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Groups</span>
                  <span className="text-2xl font-bold font-mono text-cyan-400">{studyGroups.length}</span>
                </div>
                <div className="p-4 rounded-xl border border-border/50 bg-card/50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Memberships</span>
                  <span className="text-2xl font-bold font-mono text-amber-400">
                    {studyGroups.reduce((acc, g) => acc + (g.memberCount || 0), 0)}
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-border/50 bg-card/50 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Messages Exchanged</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {studyGroups.reduce((acc, g) => acc + (g.messageCount || 0), 0)}
                  </span>
                </div>
              </div>

              {/* Study Groups List */}
              {loading ? (
                <div className="py-12 flex justify-center items-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredStudyGroups.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg">
                  <p className="text-muted-foreground text-sm">
                    {studyGroupSearch ? "No study groups match your search filter." : "No study groups have been created yet."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredStudyGroups.map((group) => (
                    <div
                      key={group.id}
                      className="p-4 rounded-xl border border-border/60 bg-card/60 hover:border-cyan-500/30 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-sm text-foreground truncate max-w-xs sm:max-w-md">
                            {group.name}
                          </h4>
                          <Badge variant="outline" className="text-[10px] bg-cyan-500/10 border-cyan-500/30 text-cyan-300">
                            {group.subject}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/20 text-primary">
                            {group.examFocus}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {new Date(group.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {group.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {group.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
                          <span>
                            Owner:{" "}
                            <strong className="text-foreground">
                              {group.ownerUsername === "mythicalhrg" ? (
                                <MythicalUserBadge username={group.ownerUsername} />
                              ) : (
                                `@${group.ownerUsername}`
                              )}
                            </strong>{" "}
                            ({group.ownerFullName})
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-cyan-300 font-mono">
                            <Users className="w-3 h-3" /> {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-emerald-300 font-mono">
                            <MessageSquare className="w-3 h-3" /> {group.messageCount} messages
                          </span>
                          <span>•</span>
                          <span>Schedule: {group.schedule}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end lg:self-center">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 text-xs flex items-center gap-1.5 bg-destructive/90 hover:bg-destructive"
                          disabled={deletingGroupId === group.id}
                          onClick={() => setGroupToDelete(group)}
                        >
                          {deletingGroupId === group.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          Delete Group
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Study Group Confirmation Dialog (Admin @mythicalhrg Only) */}
      <Dialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Delete Study Group
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{groupToDelete?.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 text-xs space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[12px] space-y-1">
              <p className="font-semibold">⚠️ Irreversible Purge Action</p>
              <p>
                This will delete the study group, remove all memberships, and permanently wipe all {groupToDelete?.messageCount || 0} messages from the database.
              </p>
            </div>
            <div className="text-muted-foreground space-y-1 text-[11px] p-2.5 rounded-lg bg-muted/40 border border-border/50">
              <p>• <strong>Subject:</strong> {groupToDelete?.subject} ({groupToDelete?.examFocus})</p>
              <p>• <strong>Owner:</strong> @{groupToDelete?.ownerUsername} ({groupToDelete?.ownerFullName})</p>
              <p>• <strong>Created:</strong> {groupToDelete ? new Date(groupToDelete.createdAt).toLocaleString() : ""}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGroupToDelete(null)}
              disabled={!!deletingGroupId}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!!deletingGroupId}
              onClick={() => groupToDelete && handleDeleteStudyGroup(groupToDelete.id)}
            >
              {deletingGroupId ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Permanently Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Credentials Dialog (Platform Owner @mythicalhrg Only) */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSaveCredentials}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" /> Edit User Credentials
              </DialogTitle>
              <DialogDescription>
                Modify username and email for <strong>{editingUser?.fullName || "User"}</strong> (@{editingUser?.username}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">@</span>
                  <Input
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="pl-7 h-9 text-xs font-mono"
                    placeholder="new_username"
                    maxLength={30}
                    disabled={isSavingCredentials || editingUser?.username === "mythicalhrg"}
                  />
                </div>
                {editingUser?.username === "mythicalhrg" ? (
                  <p className="text-[11px] text-amber-500 font-semibold">
                    🔒 Root platform owner username is permanently locked to preserve administrative access.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    3-30 characters: letters, numbers, underscores (_), and periods (.).
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Email Address</label>
                <Input
                  required
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="user@gmail.com"
                />
                <p className="text-[11px] text-muted-foreground">
                  Must be a valid, unique email address.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                🔒 Security Note: Only platform owner @mythicalhrg is authorized to modify user credentials.
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingUser(null)}
                disabled={isSavingCredentials}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingCredentials}>
                {isSavingCredentials ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Save Credentials
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
