"use client";
import { useState, useEffect } from "react";
import { getAllUsersAction, deleteUserAction, getBansAction, banEntityAction, unbanEntityAction } from "@/app/actions/admin";
import { createBroadcastAction, getActiveBroadcastsAction, deleteBroadcastAction } from "@/app/actions/broadcast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Ban } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [activeBroadcasts, setActiveBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banType, setBanType] = useState<"ip" | "email" | "username">("email");
  const [banValue, setBanValue] = useState("");
  const [banReason, setBanReason] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, bansRes, broadcastsRes] = await Promise.all([
        getAllUsersAction(),
        getBansAction(),
        getActiveBroadcastsAction()
      ]);
      if (usersRes.success) setUsers(usersRes.users);
      if (bansRes.success) setBans(bansRes.bans);
      if (broadcastsRes.success) setActiveBroadcasts(broadcastsRes.broadcasts);
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
      setUsers(users.filter(u => u.uuid !== uuid));
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
      fetchData(); // Refresh bans
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleUnban = async (id: string) => {
    try {
      await unbanEntityAction(id);
      toast({ title: "Unbanned successfully" });
      setBans(bans.filter(b => b._id !== id));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateBroadcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBroadcastLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      await createBroadcastAction(formData);
      toast({ title: "Broadcast Sent!", description: "Message is now live for all users for 36 hours." });
      (e.target as HTMLFormElement).reset();
      fetchData(); // Refresh active broadcasts
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
      setActiveBroadcasts(activeBroadcasts.filter(b => b._id !== id));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users">Manage Users</TabsTrigger>
          <TabsTrigger value="bans">Manage Bans</TabsTrigger>
          <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
        </TabsList>

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
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.uuid} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-medium">@{u.username}</td>
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3">{u.fullName}</td>
                        <td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(u.uuid)} disabled={u.username === 'mythicalhrg'}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
                  <Input required placeholder="e.g. badguy@gmail.com or 192.168.1.1" value={banValue} onChange={e => setBanValue(e.target.value)} />
                </div>
                <div className="flex-[2] space-y-2">
                  <label className="text-sm font-medium">Reason (Optional)</label>
                  <Input placeholder="Why is this banned?" value={banReason} onChange={e => setBanReason(e.target.value)} />
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
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bans.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No active bans.</td></tr>
                    ) : bans.map(b => (
                      <tr key={b._id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium uppercase">{b.type}</td>
                        <td className="px-4 py-3">{b.value}</td>
                        <td className="px-4 py-3">{b.reason || '-'}</td>
                        <td className="px-4 py-3">{new Date(b.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" onClick={() => handleUnban(b._id)}>
                            Unban
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broadcasts">
          <Card>
            <CardHeader>
              <CardTitle>Send Global Broadcast</CardTitle>
              <CardDescription>This message will appear in the notification bell for all users and automatically disappear after 36 hours.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateBroadcast} className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input name="subject" placeholder="e.g. Server Maintenance Tonight" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <Textarea name="message" placeholder="Type your broadcast message here..." rows={5} required />
                </div>
                <p className="text-xs text-muted-foreground italic">Note: 50MB file attachments are temporarily disabled until external storage is configured.</p>
                <Button type="submit" disabled={broadcastLoading}>
                  {broadcastLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send Broadcast
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
                    ) : activeBroadcasts.map(b => {
                      const hoursLeft = Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)));
                      return (
                        <tr key={b._id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium max-w-[200px] truncate">{b.subject}</td>
                          <td className="px-4 py-3 max-w-[300px] truncate">{b.message}</td>
                          <td className="px-4 py-3">{hoursLeft} hours</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteBroadcast(b._id)}>
                              <Trash2 className="w-4 h-4" />
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
      </Tabs>
    </div>
  );
}
