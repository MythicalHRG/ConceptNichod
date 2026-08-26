"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, User, Settings, Loader2 } from "lucide-react";
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
import { updateProfileAction, changePasswordAction, deleteAccountAction } from "@/app/actions/auth";
import { loadCaptchaEnginge, LoadCanvasTemplate, validateCaptcha } from "react-simple-captcha";

export function UserProfileButton() {
  const { user, isLoggedIn, logout, login, setAuthModalOpen } = useAuth();
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

  const [deleteOtp, setDeleteOtp] = useState("");
  const [isDeleteOtpSent, setIsDeleteOtpSent] = useState(false);
  const [isDeleteEmailVerified, setIsDeleteEmailVerified] = useState(false);
  const [deleteCaptchaValue, setDeleteCaptchaValue] = useState("");
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    if (activeTab === "delete" && isDeleteEmailVerified) {
      setTimeout(() => {
        try {
          loadCaptchaEnginge(6);
        } catch(e) {}
      }, 200);
    } else if (activeTab !== "delete") {
      setIsDeleteOtpSent(false);
      setIsDeleteEmailVerified(false);
      setDeleteOtp("");
      setDeleteCaptchaValue("");
    }
  }, [activeTab, isDeleteEmailVerified]);

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

  const handleDeleteSendOtp = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, action: "send", isPasswordReset: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsDeleteOtpSent(true);
      toast({ title: "OTP Sent", description: "Check your email for the verification code." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to send OTP", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteVerifyOtp = async () => {
    if (!deleteOtp) {
      toast({ variant: "destructive", title: "Error", description: "Please enter the OTP." });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, otp: deleteOtp, action: "verify" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsDeleteEmailVerified(true);
      toast({ title: "Email Verified!", description: "You can now delete your account." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDeleteEmailVerified) return;
    if (!validateCaptcha(deleteCaptchaValue)) {
      toast({ variant: "destructive", title: "Captcha Failed", description: "Please enter the correct captcha." });
      setDeleteCaptchaValue("");
      loadCaptchaEnginge(6);
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", user?.email || "");
      formData.append("otp", deleteOtp);
      const res = await deleteAccountAction(formData);
      if (res?.success) {
        toast({ title: "Account Deleted" });
        setIsSettingsOpen(false);
        logout();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: err.message });
    } finally {
      setIsLoading(false);
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

  if (isLoggedIn && user) {
    return (
      <>
        <div className="flex flex-col gap-2 p-2 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="bg-primary/10 p-1.5 rounded-full">
              <User className="size-4 text-primary" />
            </div>
            <div className="flex flex-col flex-1 overflow-hidden">
                <span className="text-xs truncate font-medium flex-1">
                {user.username}
                </span>
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
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
                <TabsTrigger value="delete" className="text-destructive data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive">Danger</TabsTrigger>
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email (Only Gmail/Outlook)</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
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
                      {["Class 9", "Class 10", "Class 11", "Class 12", "Dropper", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
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
              
              <TabsContent value="password">
                <form onSubmit={handleChangePassword} className="space-y-4 px-1 pb-2">
                  <div className="space-y-2 text-sm text-muted-foreground text-center mb-4">
                    Update your password. You will need your current password to make this change.
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Current Password</label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Password</label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full mt-4" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="delete">
                <form onSubmit={handleDeleteAccount} className="space-y-4 px-1 pb-2">
                  <div className="space-y-2 text-sm text-destructive text-center mb-4 border border-destructive/20 bg-destructive/10 p-3 rounded-md">
                    <strong>Warning:</strong> Deleting your account is permanent. All your generated topics, materials, and data will be permanently erased.
                  </div>
                  
                  {!isDeleteEmailVerified ? (
                    <div className="space-y-4">
                      <div className="flex gap-2 items-end">
                        <div className="space-y-2 flex-1">
                          <label className="text-sm font-medium">OTP Code</label>
                          <Input
                            placeholder="6-digit code"
                            value={deleteOtp}
                            onChange={(e) => setDeleteOtp(e.target.value)}
                            disabled={isDeleteEmailVerified}
                          />
                        </div>
                        <Button type="button" onClick={handleDeleteSendOtp} disabled={isLoading || isDeleteEmailVerified} variant={isDeleteOtpSent ? "outline" : "default"}>
                          {isDeleteOtpSent ? "Resend OTP" : "Send OTP"}
                        </Button>
                      </div>
                      {isDeleteOtpSent && !isDeleteEmailVerified && (
                        <Button type="button" onClick={handleDeleteVerifyOtp} disabled={isLoading || deleteOtp.length < 6} className="w-full">
                          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Verify OTP"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center justify-center space-y-2 p-4 bg-muted/50 rounded-lg">
                        <LoadCanvasTemplate />
                        <Input
                          placeholder="Enter Captcha"
                          value={deleteCaptchaValue}
                          onChange={(e) => setDeleteCaptchaValue(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" variant="destructive" className="w-full" disabled={isLoading || !deleteCaptchaValue}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Permanently Delete Account"}
                      </Button>
                    </div>
                  )}
                </form>
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
