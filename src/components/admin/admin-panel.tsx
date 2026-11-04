"use client";

import { useState, useEffect } from "react";
import {
  getAllUsersAction,
  deleteUserAction,
  getBansAction,
  banEntityAction,
  unbanEntityAction,
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
  getDonationInfoAction,
  updateDonationSettingsAction,
  addDonorCardAction,
  deleteDonorCardAction,
} from "@/app/actions/donation";
import {
  getChangelogsAction,
  createChangelogAction,
  deleteChangelogAction,
} from "@/app/actions/changelog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  QrCode,
} from "lucide-react";
import { UploadButton } from "@/utils/uploadthing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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

  // Donation & UPI State
  const [donationSettings, setDonationSettings] = useState({
    upiId: "harsh.2525@ptaxis",
    qrCodeUrl: "",
    customInstructions: "",
    thankYouNote: "",
  });
  const [donorCards, setDonorCards] = useState<any[]>([]);
  const [newDonor, setNewDonor] = useState({
    username: "",
    amount: "",
    tier: "Supporter" as "Supporter" | "Patron" | "Benefactor" | "Legend",
    message: "",
  });
  const [isSavingDonation, setIsSavingDonation] = useState(false);
  const [isAddingDonor, setIsAddingDonor] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, bansRes, broadcastsRes, emailRes, changelogsRes] =
        await Promise.all([
          getAllUsersAction(),
          getBansAction(),
          getActiveBroadcastsAction(),
          getEmailBroadcastHistoryAction().catch(() => ({ success: true, broadcasts: [] })),
          getChangelogsAction().catch(() => ({ success: true, changelogs: [] })),
        ]);

      if (usersRes.success) setUsers(usersRes.users);
      if (bansRes.success) setBans(bansRes.bans);
      if (broadcastsRes.success) setActiveBroadcasts(broadcastsRes.broadcasts);
      if (emailRes?.success) setEmailBroadcasts(emailRes.broadcasts || []);
      if (changelogsRes?.success) setChangelogs(changelogsRes.changelogs || []);
      const donationRes = await getDonationInfoAction().catch(() => ({ success: true, settings: null, donors: [] }));
      if (donationRes?.success) {
        if (donationRes.settings) setDonationSettings(donationRes.settings);
        if (donationRes.donors) setDonorCards(donationRes.donors);
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

  // Create Changelog
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

      await createChangelogAction(formData);
      toast({ title: "Changelog Published!", description: `${changelogVersion} is now visible on /changelog` });
      setChangelogVersion("");
      setChangelogTitle("");
      setChangelogContent("");
      fetchData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setChangelogLoading(false);
    }
  };

  const handleSaveDonationSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDonation(true);
    try {
      const res = await updateDonationSettingsAction(donationSettings);
      if (res.success) {
        toast({ title: "UPI Settings Saved", description: "Donation page details updated successfully." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsSavingDonation(false);
    }
  };

  const handleAddDonorCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDonor.username.trim() || !newDonor.amount) {
      toast({ variant: "destructive", title: "Error", description: "Username and amount are required." });
      return;
    }
    setIsAddingDonor(true);
    try {
      const res = await addDonorCardAction({
        username: newDonor.username,
        amount: Number(newDonor.amount),
        tier: newDonor.tier,
        message: newDonor.message,
      });
      if (res.success) {
        toast({ title: "Donor Card Added!", description: `Added @${newDonor.username} to Hall of Patrons.` });
        setDonorCards([res.donor, ...donorCards]);
        setNewDonor({ username: "", amount: "", tier: "Supporter", message: "" });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsAddingDonor(false);
    }
  };

  const handleDeleteDonorCard = async (uuid: string) => {
    if (!confirm("Remove this donor card from Hall of Patrons?")) return;
    try {
      await deleteDonorCardAction(uuid);
      toast({ title: "Donor Card Removed" });
      setDonorCards(donorCards.filter((d) => d.uuid !== uuid));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
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
        </TabsList>

        {/* USERS TAB */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users ({users.length})</CardTitle>
              <CardDescription>View and manage all registered users.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
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
                      const isBadeMaalik = ["anurag", "rohit"].includes(u.username.toLowerCase());
                      return (
                        <tr key={u.uuid} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 font-medium">
                            <span className="flex items-center gap-1.5">
                              @{u.username}
                              {isBadeMaalik && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-gradient-to-r from-purple-500 to-amber-500 text-white shadow-xs">
                                  👑 Bade Maalik
                                </span>
                              )}
                            </span>
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
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteUser(u.uuid)}
                              disabled={u.username === "mythicalhrg"}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </Button>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
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
              <form onSubmit={handleCreateChangelog} className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Version Tag</label>
                    <Input
                      placeholder="e.g. v2.2.0"
                      value={changelogVersion}
                      onChange={(e) => setChangelogVersion(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={changelogCategory} onValueChange={setChangelogCategory}>
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

                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    placeholder="e.g. OpenRouter Free Migration & Concept Mirror Upgrades"
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

                <Button type="submit" disabled={changelogLoading}>
                  {changelogLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Publish Changelog Update
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Published Changelogs ({changelogs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
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
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteChangelog(c._id)}
                            >
                              <Trash2 className="w-4 h-4" />
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

        {/* DONATIONS & UPI CONFIG TAB */}
        <TabsContent value="donations">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* UPI QR & Instructions Settings */}
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" /> UPI & QR Configuration
                </CardTitle>
                <CardDescription>
                  Configure your official UPI ID, QR code image, and custom instructions shown on /donate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveDonationSettings} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Official UPI ID / VPA
                    </label>
                    <Input
                      value={donationSettings.upiId}
                      onChange={(e) => setDonationSettings({ ...donationSettings, upiId: e.target.value })}
                      placeholder="e.g. harsh.2525@ptaxis"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      UPI QR Code Image URL
                    </label>
                    <Input
                      value={donationSettings.qrCodeUrl}
                      onChange={(e) => setDonationSettings({ ...donationSettings, qrCodeUrl: e.target.value })}
                      placeholder="https://... or /qr-code.png or paste base64 image data"
                    />
                    {donationSettings.qrCodeUrl && (
                      <div className="mt-2 p-2 border rounded-lg bg-white max-w-[140px] aspect-square flex items-center justify-center">
                        <img src={donationSettings.qrCodeUrl} alt="QR Preview" className="max-w-full max-h-full object-contain" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Custom Instructions for Donors
                    </label>
                    <Textarea
                      value={donationSettings.customInstructions}
                      onChange={(e) => setDonationSettings({ ...donationSettings, customInstructions: e.target.value })}
                      placeholder="Instructions shown on the donation card..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Thank You Message
                    </label>
                    <Input
                      value={donationSettings.thankYouNote}
                      onChange={(e) => setDonationSettings({ ...donationSettings, thankYouNote: e.target.value })}
                      placeholder="Thank you for supporting ConceptNichod!"
                    />
                  </div>

                  <Button type="submit" disabled={isSavingDonation} className="w-full">
                    {isSavingDonation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Heart className="mr-2 h-4 w-4 fill-current" />}
                    Save UPI Settings
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Donor Cards Manager (Hall of Patrons) */}
            <div className="lg:col-span-7 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" /> Add Donor Card
                  </CardTitle>
                  <CardDescription>
                    Manually add verified donor contributions to showcase on the public Hall of Patrons (/donate).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddDonorCard} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Username
                        </label>
                        <Input
                          placeholder="e.g. anurag or rohit"
                          value={newDonor.username}
                          onChange={(e) => setNewDonor({ ...newDonor, username: e.target.value })}
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Donated Amount (₹)
                        </label>
                        <Input
                          type="number"
                          placeholder="e.g. 500, 1000"
                          value={newDonor.amount}
                          onChange={(e) => setNewDonor({ ...newDonor, amount: e.target.value })}
                          required
                          min={1}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Honorary Tier
                        </label>
                        <Select
                          value={newDonor.tier}
                          onValueChange={(val: any) => setNewDonor({ ...newDonor, tier: val })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Tier" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Supporter">Supporter (₹100+)</SelectItem>
                            <SelectItem value="Patron">Patron (₹500+)</SelectItem>
                            <SelectItem value="Benefactor">Benefactor (₹1,000+)</SelectItem>
                            <SelectItem value="Legend">Legend (₹2,500+)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Personal Message / Note
                        </label>
                        <Input
                          placeholder="e.g. Keep empowering students!"
                          value={newDonor.message}
                          onChange={(e) => setNewDonor({ ...newDonor, message: e.target.value })}
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={isAddingDonor} className="w-full">
                      {isAddingDonor ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Add Donor Card to Hall of Patrons
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* List of Current Donor Cards */}
              <Card>
                <CardHeader>
                  <CardTitle>Hall of Patrons Cards ({donorCards.length})</CardTitle>
                  <CardDescription>All publicly displayed donor cards on the donation page.</CardDescription>
                </CardHeader>
                <CardContent>
                  {donorCards.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No donor cards added yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {donorCards.map((donor) => (
                        <div
                          key={donor.uuid}
                          className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col justify-between space-y-2 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm text-foreground">@{donor.username}</p>
                              <p className="text-base font-black text-primary">₹{Number(donor.amount).toLocaleString('en-IN')}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px]">{donor.tier}</Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteDonorCard(donor.uuid)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          {donor.message && (
                            <p className="text-xs text-muted-foreground italic">"{donor.message}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
