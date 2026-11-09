"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./auth-context";
import { MythicalUserBadge } from "@/components/ui/mythical-glass";
import { Button } from "@/components/ui/button";
import { LogOut, User, Settings, Loader2, Palette, Sparkles, Check, Monitor, Volume2, ShieldAlert, KeyRound } from "lucide-react";
import { useTheme } from "next-themes";
import { THEME_OPTIONS } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  updateProfileAction,
  changePasswordAction,
  deleteAccountAction,
  requestEmailChangeOtpAction,
  confirmEmailChangeAction,
  requestDeleteAccountOtpAction,
} from "@/app/actions/auth";

function formatDob(dobStr?: string | null) {
  if (!dobStr) return null;
  try {
    const d = new Date(dobStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
  } catch {}
  return dobStr;
}

export function UserProfileButton() {
  const { user, isLoggedIn, isAuthReady, logout, login, setAuthModalOpen } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [examFocus, setExamFocus] = useState("");
  const [city, setCity] = useState("");
  const [futureCollege, setFutureCollege] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [instagram, setInstagram] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("profile");

  // Danger Zone: Change Email state
  const [newEmailToChange, setNewEmailToChange] = useState("");
  const [emailChangePassword, setEmailChangePassword] = useState("");
  const [emailChangeOtp, setEmailChangeOtp] = useState("");
  const [isEmailChangeOtpSent, setIsEmailChangeOtpSent] = useState(false);
  const [isEmailChangeLoading, setIsEmailChangeLoading] = useState(false);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);

  // Danger Zone: Account Deletion state
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState("");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleteOtpSent, setIsDeleteOtpSent] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteResendCooldown, setDeleteResendCooldown] = useState(0);

  // Cooldown timers
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (emailResendCooldown > 0) {
      timer = setTimeout(() => setEmailResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [emailResendCooldown]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (deleteResendCooldown > 0) {
      timer = setTimeout(() => setDeleteResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [deleteResendCooldown]);

  useEffect(() => {
    if (activeTab !== "delete") {
      setDeleteCurrentPassword("");
      setDeleteOtp("");
      setDeleteConfirmationText("");
      setIsDeleteOtpSent(false);
      setEmailChangePassword("");
      setNewEmailToChange("");
      setEmailChangeOtp("");
      setIsEmailChangeOtpSent(false);
    }
  }, [activeTab]);

  const openSettings = () => {
    if (user) {
      setEmail(user.email);
      setUsername(user.username);
      setBio(user.bio || "");
      setClassLevel(user.classLevel || "");
      setExamFocus((user as any).examFocus || "");
      setCity((user as any).city || "");
      setFutureCollege((user as any).futureCollege || "");
      setSnapchat((user as any).snapchat || "");
      setInstagram((user as any).instagram || "");
    }
    setIsSettingsOpen(true);
    setActiveTab("profile");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("username", username);
      formData.append("bio", bio);
      formData.append("classLevel", classLevel);
      formData.append("examFocus", examFocus);
      formData.append("city", city);
      formData.append("futureCollege", futureCollege);
      formData.append("snapchat", snapchat);
      formData.append("instagram", instagram);

      const res = await updateProfileAction(formData);
      if (res.success && res.user) {
        login(res.user);
        toast({ title: "Profile updated successfully" });
        setIsSettingsOpen(false);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!deleteCurrentPassword) {
      toast({
        variant: "destructive",
        title: "Password Required",
        description: "Please enter your current password to authorize requesting a deletion code.",
      });
      return;
    }

    setIsDeleteLoading(true);
    try {
      const res = await requestDeleteAccountOtpAction(deleteCurrentPassword);
      if (res.success) {
        setIsDeleteOtpSent(true);
        setDeleteResendCooldown(60);
        toast({
          title: "Deletion Code Sent",
          description: "A 6-digit authorization code has been dispatched to your email.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Send Code",
        description: err.message,
      });
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDeleteOtpSent) return;
    if (!deleteOtp || deleteOtp.length < 6) {
      toast({
        variant: "destructive",
        title: "Code Required",
        description: "Please enter the 6-digit code received on your email.",
      });
      return;
    }
    if (deleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      toast({
        variant: "destructive",
        title: "Confirmation Required",
        description: 'Please type "DELETE" exactly to confirm account deletion.',
      });
      return;
    }

    setIsDeleteLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", user?.email || "");
      formData.append("otp", deleteOtp.trim());
      formData.append("password", deleteCurrentPassword);
      formData.append("confirmation", deleteConfirmationText.trim().toUpperCase());

      const res = await deleteAccountAction(formData);
      if (res?.success) {
        toast({ title: "Account Deleted", description: "Your account and data have been permanently erased." });
        setIsSettingsOpen(false);
        logout();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Deletion Failed", description: err.message });
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("currentPassword", currentPassword);
      formData.append("newPassword", newPassword);
      const res = await changePasswordAction(formData);
      if (res.success) {
        toast({ title: "Password Updated successfully" });
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestEmailChangeOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailToChange) {
      toast({ variant: "destructive", title: "Email Required", description: "Please enter your new email address." });
      return;
    }
    if (!emailChangePassword) {
      toast({ variant: "destructive", title: "Password Required", description: "Please enter your current password to authorize email change." });
      return;
    }
    setIsEmailChangeLoading(true);
    try {
      const res = await requestEmailChangeOtpAction(newEmailToChange, emailChangePassword);
      if (res.success) {
        setIsEmailChangeOtpSent(true);
        setEmailResendCooldown(60);
        toast({ title: "OTP Sent", description: "Verification code sent to your new email." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Request Failed", description: err.message });
    } finally {
      setIsEmailChangeLoading(false);
    }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailToChange || !emailChangeOtp) {
      toast({ variant: "destructive", title: "Error", description: "Please enter the OTP." });
      return;
    }
    setIsEmailChangeLoading(true);
    try {
      const res = await confirmEmailChangeAction(newEmailToChange, emailChangeOtp);
      if (res.success && res.user) {
        login(res.user);
        toast({ title: "Email Changed Successfully", description: "Your email has been updated." });
        setNewEmailToChange("");
        setEmailChangePassword("");
        setEmailChangeOtp("");
        setIsEmailChangeOtpSent(false);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: err.message });
    } finally {
      setIsEmailChangeLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground" role="status" aria-label="Restoring session">
        <Loader2 className="size-4 animate-spin" />
        <span>Checking session…</span>
      </div>
    );
  }

  if (isLoggedIn && user) {
    const isMythical = user.username.toLowerCase() === "mythicalhrg";
    return (
      <>
        <div className={isMythical
          ? "flex flex-col gap-2 p-2.5 rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-purple-600/15 backdrop-blur-xl shadow-[0_4px_20px_rgba(245,158,11,0.2)]"
          : "flex flex-col gap-2 p-2 bg-muted/50 rounded-lg border"
        }>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className={isMythical ? "bg-amber-500/20 p-1.5 rounded-full text-amber-400 border border-amber-400/30" : "bg-primary/10 p-1.5 rounded-full"}>
              <User className="size-4 text-primary" />
            </div>
            <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                  {isMythical ? (
                    <MythicalUserBadge username={user.username} size="xs" />
                  ) : (
                    <span className="text-xs truncate font-medium">
                      @{user.username}
                    </span>
                  )}
                </div>
                <span className="text-[10px] truncate text-muted-foreground flex-1">
                {user.email}
                </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open(`/profile/${user.username}`, '_blank')}
                  className="w-full h-8 text-xs justify-center flex-1"
              >
                  <User className="size-3 mr-2" />
                  Profile
              </Button>
              <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={openSettings}
                  className="w-full h-8 text-xs justify-center flex-1"
              >
                  <Settings className="size-3 mr-2" />
                  Settings
              </Button>
            </div>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={logout}
                className="w-full h-8 text-xs justify-center text-destructive hover:text-destructive"
            >
                <LogOut className="size-3 mr-2" />
                Logout
            </Button>
          </div>
        </div>

        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Profile Settings</DialogTitle>
              <DialogDescription>
                Update your account details here.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4 text-xs sm:text-sm">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="appearance">Themes</TabsTrigger>
                <TabsTrigger value="delete" className="text-destructive data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive">Danger <span className="hidden sm:inline">Zone</span></TabsTrigger>
              </TabsList>
              
              <TabsContent value="profile">
                <form onSubmit={handleUpdate} className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pb-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username</label>
                    <Input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Email Address</label>
                    <Input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="bg-muted text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      To change email, open the <span className="text-destructive font-medium cursor-pointer underline" onClick={() => setActiveTab("delete")}>Danger</span> tab (OTP required).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <span role="img" aria-label="Birthday cake">🎂</span>
                      <span>Birthday</span>
                    </label>
                    <Input
                      type="text"
                      value={formatDob(user?.dob) || user?.dob || "Not set"}
                      disabled
                      className="bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Class / Grade</label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={classLevel}
                      onChange={(e) => setClassLevel(e.target.value)}
                    >
                      <option value="">Select Class</option>
                      {["Class 9", "Class 10", "Class 11", "Class 12", "12+", "Dropper", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Exam (Optional)</label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={examFocus}
                      onChange={(e) => setExamFocus(e.target.value)}
                    >
                      <option value="">None</option>
                      {["JEE", "NEET", "UPSC", "CA", "NDA", "CUET", "Other"].map(ex => <option key={ex} value={ex}>{ex}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bio</label>
                    <Input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Residency (City)</label>
                    <Input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Future College / Goal</label>
                    <Input
                      type="text"
                      value={futureCollege}
                      onChange={(e) => setFutureCollege(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Snapchat</label>
                    <Input
                      type="text"
                      value={snapchat}
                      onChange={(e) => setSnapchat(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Instagram</label>
                    <Input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Changes"}
                  </Button>
                </form>
              </TabsContent>

              {/* APPEARANCE & THEMES TAB */}
              <TabsContent value="appearance">
                <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pb-2">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Palette className="w-4 h-4 text-primary" /> Visual Palettes
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Choose an interface theme designed for long study sessions and high focus.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    {THEME_OPTIONS.map((t) => {
                      const isSelected = theme === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setTheme(t.id)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                              : "border-border/70 hover:border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shrink-0 shadow-xs"
                              style={{ backgroundColor: t.color }}
                            />
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{t.label}</p>
                            <p className="text-[10px] text-muted-foreground">{t.description}</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* System Theme Card */}
                    <div
                      onClick={() => setTheme("system")}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-2 col-span-2 ${
                        theme === "system"
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                          : "border-border/70 hover:border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Monitor className="w-4 h-4 text-muted-foreground" />
                        {theme === "system" && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">System Default</p>
                        <p className="text-[10px] text-muted-foreground">Sync automatically with your operating system appearance</p>
                      </div>
                    </div>
                  </div>

                  {/* Study & Proctoring Notes */}
                  <div className="pt-2 border-t border-border/60 space-y-2">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Active Session Proctoring
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      During active practice tests, minimizing the browser window or switching to another tab triggers automatic test submission to guarantee academic integrity.
                    </p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="delete" className="space-y-6 max-h-[60vh] overflow-y-auto px-1 pb-2">
                {/* Change Password Section (Danger Zone) */}
                <div className="border border-border/80 rounded-lg p-4 bg-muted/20 space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary" /> Change Password
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Update your account password. You will need your current password to make this change.
                    </p>
                  </div>
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Current Password</label>
                      <Input
                        type="password"
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">New Password</label>
                      <Input
                        type="password"
                        placeholder="New password (8+ chars, upper, lower, number, symbol)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" size="sm" className="w-full" disabled={isLoading || !currentPassword || !newPassword}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
                    </Button>
                  </form>
                </div>

                {/* Change Email Section */}
                <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5 space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                      Change Email Address
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      To protect your account, enter your current password and new email address to receive a verification OTP.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Current Email</label>
                      <Input
                        type="email"
                        value={user?.email || ""}
                        disabled
                        className="h-8 text-xs bg-muted/60 text-muted-foreground cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Verify Current Password</label>
                      <Input
                        type="password"
                        placeholder="Current password"
                        value={emailChangePassword}
                        onChange={(e) => setEmailChangePassword(e.target.value)}
                        disabled={isEmailChangeOtpSent || isEmailChangeLoading}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">New Email (@gmail.com, @outlook.com/in)</label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="newemail@gmail.com"
                          value={newEmailToChange}
                          onChange={(e) => setNewEmailToChange(e.target.value)}
                          disabled={isEmailChangeOtpSent || isEmailChangeLoading}
                          className="h-9 text-xs"
                        />
                        <Button 
                          type="button" 
                          size="sm"
                          onClick={handleRequestEmailChangeOtp} 
                          disabled={isEmailChangeLoading || !newEmailToChange || !emailChangePassword || emailResendCooldown > 0}
                          className="h-9 text-xs shrink-0"
                          variant={isEmailChangeOtpSent ? "outline" : "default"}
                        >
                          {isEmailChangeLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : emailResendCooldown > 0 ? (
                            `Wait ${emailResendCooldown}s`
                          ) : isEmailChangeOtpSent ? (
                            "Resend"
                          ) : (
                            "Send OTP"
                          )}
                        </Button>
                      </div>
                    </div>

                    {isEmailChangeOtpSent && (
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        <label className="text-xs font-medium text-primary">Enter 6-digit OTP Code sent to {newEmailToChange}</label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="6-digit OTP"
                            maxLength={6}
                            value={emailChangeOtp}
                            onChange={(e) => setEmailChangeOtp(e.target.value.replace(/\D/g, ""))}
                            className="h-9 text-xs font-mono tracking-widest text-center"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={handleConfirmEmailChange}
                            disabled={isEmailChangeLoading || emailChangeOtp.length < 6}
                            className="h-9 text-xs shrink-0"
                          >
                            {isEmailChangeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Change"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account Deletion Section */}
                {user?.username?.toLowerCase() === "mythicalhrg" ? (
                  <div className="border border-amber-500/40 rounded-xl p-4 bg-amber-500/10 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-sm text-amber-300">
                      <ShieldAlert className="w-4 h-4 text-amber-400" /> Platform Owner Account Protected
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The root platform administrator account <strong>@{user.username}</strong> is permanently protected and cannot be deleted.
                    </p>
                  </div>
                ) : (
                  <div className="border border-destructive/30 rounded-xl p-4 bg-destructive/5 space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-destructive" /> Permanently Delete Account
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Deleting your account is permanent. All your generated topics, practice test analytics, notes, and study group memberships will be erased.
                      </p>
                    </div>

                    {!isDeleteOtpSent ? (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Verify Current Password</label>
                          <Input
                            type="password"
                            placeholder="Enter current password to authorize deletion request"
                            value={deleteCurrentPassword}
                            onChange={(e) => setDeleteCurrentPassword(e.target.value)}
                            disabled={isDeleteLoading}
                            className="h-9 text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            An authorization code will be sent to <strong>{user?.email}</strong> once your password is confirmed.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 font-medium"
                          onClick={handleDeleteSendOtp}
                          disabled={isDeleteLoading || !deleteCurrentPassword || deleteResendCooldown > 0}
                        >
                          {isDeleteLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : deleteResendCooldown > 0 ? (
                            `Resend code in ${deleteResendCooldown}s`
                          ) : (
                            "Request Deletion Authorization Code"
                          )}
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={handleDeleteAccount} className="space-y-3 pt-2 border-t border-destructive/20">
                        <div className="p-2.5 rounded-lg bg-destructive/10 text-[11px] text-destructive leading-relaxed">
                          ⚠️ Authorization code sent to <strong>{user?.email}</strong>. Enter the 6-digit code and type <strong>DELETE</strong> below to finalize account destruction.
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">6-Digit Deletion Code</label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="6-digit code"
                              maxLength={6}
                              value={deleteOtp}
                              onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, ""))}
                              disabled={isDeleteLoading}
                              className="h-9 text-sm font-mono text-center tracking-widest"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleDeleteSendOtp}
                              disabled={isDeleteLoading || deleteResendCooldown > 0}
                              className="h-9 text-xs shrink-0"
                            >
                              {deleteResendCooldown > 0 ? `${deleteResendCooldown}s` : "Resend"}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Confirm Intent</label>
                          <Input
                            placeholder='Type "DELETE" to confirm'
                            value={deleteConfirmationText}
                            onChange={(e) => setDeleteConfirmationText(e.target.value)}
                            disabled={isDeleteLoading}
                            className="h-9 text-xs font-mono uppercase"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Type DELETE in capital letters to confirm this action.
                          </p>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="flex-1 h-9 text-xs"
                            disabled={isDeleteLoading}
                            onClick={() => {
                              setIsDeleteOtpSent(false);
                              setDeleteOtp("");
                              setDeleteConfirmationText("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            variant="destructive"
                            size="sm"
                            className="flex-1 h-9 text-xs font-semibold"
                            disabled={
                              isDeleteLoading ||
                              deleteOtp.length < 6 ||
                              deleteConfirmationText.trim().toUpperCase() !== "DELETE"
                            }
                          >
                            {isDeleteLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              "Permanently Delete Account"
                            )}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button 
      variant="default" 
      className="w-full"
      onClick={() => setAuthModalOpen(true)}
    >
      Sign In
    </Button>
  );
}
