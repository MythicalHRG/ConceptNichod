"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "./auth-context";
import { useToast } from "@/hooks/use-toast";
import { registerAction, loginAction, resetPasswordAction } from "@/app/actions/auth";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadCaptchaEnginge, LoadCanvasTemplate, validateCaptcha } from 'react-simple-captcha';
import { useEffect } from "react";

export function LoginDialog() {
  const { isAuthModalOpen, setAuthModalOpen, login } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [examFocus, setExamFocus] = useState("");
  const [city, setCity] = useState("");
  const [futureCollege, setFutureCollege] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [instagram, setInstagram] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [activeTab, setActiveTab] = useState("login");
  const [newPassword, setNewPassword] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthModalOpen) {
      setTimeout(() => {
        try {
          loadCaptchaEnginge(6);
        } catch(e) {
          console.error("Captcha failed to load", e);
        }
      }, 200);
    } else {
      // Reset states when closed
      setIsEmailVerified(false);
      setOtpSent(false);
      setOtpCode("");
    }
  }, [isAuthModalOpen]);

  const handleSendOtp = async () => {
    if (!email) {
      toast({ variant: "destructive", title: "Error", description: "Email is required to send OTP." });
      return;
    }
    if (!email.endsWith("@gmail.com") && !email.endsWith("@outlook.com") && !email.endsWith("@outlook.in")) {
      toast({ variant: "destructive", title: "Error", description: "Only @gmail.com, @outlook.com, or @outlook.in emails are allowed." });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "send", isPasswordReset: activeTab === "forgot-password" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOtpSent(true);
      toast({ title: "OTP Sent", description: "Check your email for the verification code." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to send OTP", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) {
      toast({ variant: "destructive", title: "Error", description: "Please enter the OTP." });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpCode, action: "verify" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsEmailVerified(true);
      toast({ title: "Email Verified!", description: "You can now complete registration." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (!validateCaptcha(captchaValue)) {
      toast({ variant: "destructive", title: "Captcha Failed", description: "Please enter the correct captcha." });
      setCaptchaValue("");
      loadCaptchaEnginge(6);
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);
      
      const res = await loginAction(formData);

      if (res.error) {
        throw new Error(res.error);
      }

      if (res.success && res.user) {
        login(res.user);
        toast({
          title: "Welcome back!",
          description: `Logged in as @${res.user.username}`,
        });
        setAuthModalOpen(false);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: err.message || "Invalid credentials",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !newPassword) return;
    if (!isEmailVerified) {
      toast({ variant: "destructive", title: "Verification Required", description: "Please verify your email using the OTP first." });
      return;
    }
    
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("newPassword", newPassword);
      
      const res = await resetPasswordAction(formData);
      if (res.success) {
        toast({ title: "Password Reset", description: "Your password has been successfully reset. You can now log in." });
        setActiveTab("login");
        setPassword("");
        setNewPassword("");
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reset Failed", description: err.message || "Could not reset password" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !password || !fullName || !gender || !dob || !classLevel || !city) return;
    if (!isEmailVerified) {
      toast({ variant: "destructive", title: "Verification Required", description: "Please verify your email using the OTP before registering." });
      return;
    }

    if (!validateCaptcha(captchaValue)) {
      toast({ variant: "destructive", title: "Captcha Failed", description: "Please enter the correct captcha." });
      setCaptchaValue("");
      loadCaptchaEnginge(6);
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("username", username);
      formData.append("password", password);
      formData.append("fullName", fullName);
      formData.append("gender", gender);
      formData.append("dob", dob);
      formData.append("classLevel", classLevel);
      if (examFocus) formData.append("examFocus", examFocus);
      formData.append("city", city);
      if (futureCollege) formData.append("futureCollege", futureCollege);
      if (snapchat) formData.append("snapchat", snapchat);
      if (instagram) formData.append("instagram", instagram);
      
      const res = await registerAction(formData);
      if (res.error) {
        throw new Error(res.error);
      }
      
      if (res.success && res.user) {
        login(res.user);
        toast({
          title: "Account created!",
          description: "Welcome to ConceptNichod.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: err.message || "Could not create account",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={setAuthModalOpen}>
      <DialogContent className="sm:max-w-[425px] [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Authentication Required</DialogTitle>
          <DialogDescription>
            You need to be signed in to access this feature. Only @gmail.com, @outlook.com, and @outlook.in emails are permitted.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} className="w-full" onValueChange={(val) => {
            setActiveTab(val);
            setCaptchaValue("");
            setTimeout(() => {
              try { loadCaptchaEnginge(6); } catch(e) {}
            }, 200);
          }}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="name@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <LoadCanvasTemplate />
                <Input 
                  placeholder="Enter Captcha" 
                  value={captchaValue} 
                  onChange={(e) => setCaptchaValue(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
              <div className="text-center mt-2">
                <Button 
                  type="button" 
                  variant="link" 
                  className="text-xs text-muted-foreground" 
                  onClick={() => setActiveTab("forgot-password")}
                >
                  Forgot Password?
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="forgot-password">
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground text-center mb-4">
                Enter your email address and we'll send you a verification code to reset your password.
              </div>
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="name@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={otpSent}
                  required
                />
              </div>
              
              {!otpSent ? (
                <Button 
                  type="button" 
                  className="w-full" 
                  onClick={handleSendOtp}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send OTP"}
                </Button>
              ) : (
                <>
                  {!isEmailVerified ? (
                    <>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter 6-digit OTP"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          maxLength={6}
                          required
                        />
                        <Button 
                          type="button" 
                          variant="secondary" 
                          onClick={handleVerifyOtp}
                          disabled={isLoading || otpCode.length !== 6}
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Input
                          type="password"
                          placeholder="New Password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Reset Password"}
                      </Button>
                    </>
                  )}
                </>
              )}
              <div className="text-center mt-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="text-xs" 
                  onClick={() => {
                    setActiveTab("login");
                    setOtpSent(false);
                    setIsEmailVerified(false);
                  }}
                >
                  Back to Sign In
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pb-2">
              <div className="space-y-2">
                <label className="text-xs font-medium">Full Name *</label>
                <Input type="text" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Username *</label>
                <Input type="text" placeholder="johndoe123" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-2 p-3 bg-secondary/20 rounded-md border border-primary/20">
                <label className="text-xs font-medium">Email Verification (@gmail.com, @outlook.com/in) *</label>
                <div className="flex gap-2">
                  <Input type="email" placeholder="name@gmail.com" value={email} onChange={(e) => {
                      setEmail(e.target.value);
                      setIsEmailVerified(false);
                      setOtpSent(false);
                  }} disabled={isEmailVerified} required />
                  {!isEmailVerified && (
                    <Button type="button" onClick={handleSendOtp} disabled={isLoading || isEmailVerified} variant={otpSent ? "outline" : "default"}>
                      {otpSent ? "Resend" : "Send OTP"}
                    </Button>
                  )}
                </div>
                {otpSent && !isEmailVerified && (
                  <div className="flex gap-2 mt-2">
                    <Input type="text" placeholder="Enter 6-digit OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
                    <Button type="button" onClick={handleVerifyOtp} disabled={isLoading}>Verify</Button>
                  </div>
                )}
                {isEmailVerified && (
                  <div className="text-xs text-green-600 font-semibold flex items-center gap-1">
                    ✓ Email verified successfully
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Password *</label>
                <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Gender *</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background" value={gender} onChange={(e) => setGender(e.target.value)} required>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Date of Birth *</label>
                  <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Class *</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background" value={classLevel} onChange={(e) => setClassLevel(e.target.value)} required>
                    <option value="">Select Class</option>
                    {["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12", "Dropper"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Residency (City) *</label>
                  <Input type="text" placeholder="Delhi" value={city} onChange={(e) => setCity(e.target.value)} required />
                </div>
              </div>
              {['Class 11', 'Class 12', 'Dropper'].includes(classLevel) && (
                <div className="space-y-2">
                  <label className="text-xs font-medium">Competitive Exam (Optional)</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background" value={examFocus} onChange={(e) => setExamFocus(e.target.value)}>
                    <option value="">None</option>
                    <option value="IITJEE">IIT JEE</option>
                    <option value="NEET">NEET</option>
                    <option value="UPSC">UPSC</option>
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-medium">Future College / Goal (Optional)</label>
                <Input type="text" placeholder="IIT Bombay" value={futureCollege} onChange={(e) => setFutureCollege(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Snapchat (Optional)</label>
                  <Input type="text" placeholder="@snap" value={snapchat} onChange={(e) => setSnapchat(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Instagram (Optional)</label>
                  <Input type="text" placeholder="@insta" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <LoadCanvasTemplate />
                <Input 
                  placeholder="Enter Captcha" 
                  value={captchaValue} 
                  onChange={(e) => setCaptchaValue(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <Button type="submit" className="w-full mt-4" disabled={isLoading || !isEmailVerified}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
