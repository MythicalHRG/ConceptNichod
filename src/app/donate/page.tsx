"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Heart, Copy, Check, ArrowLeft, QrCode, Sparkles, ShieldCheck, 
  Award, Star, Users, ExternalLink, ArrowRight, Loader2, Zap,
  CheckCircle2, Info, Lock, LogIn, Smartphone, History, Trophy
} from "lucide-react";
import { IndianRupee } from "lucide-react";
import { Rupee } from "@/components/ui/rupee-symbol";
import { 
  getDonationInfoAction, 
  submitDonationUtrAction,
  getCurrentUserDonationContextAction
} from "@/app/actions/donation";

interface DonationSettings {
  upiId: string;
  qrCodeUrl: string;
  customInstructions: string;
  thankYouNote: string;
}

interface DonorCard {
  uuid: string;
  username: string;
  totalAmount?: number;
  amount: number;
  donationCount?: number;
  tier: "Supporter" | "Patron" | "Benefactor" | "Legend";
  latestMessage?: string;
  message?: string;
  lastDonatedAt?: string;
  donatedAt: string;
}

interface RecentTransaction {
  uuid: string;
  username: string;
  amount: number;
  utr: string;
  donatedAt: string;
  message?: string;
}

const PRESET_AMOUNTS = [
  { value: 50, tier: "Supporter" },
  { value: 100, tier: "Supporter" },
  { value: 250, tier: "Supporter" },
  { value: 500, tier: "Patron" },
  { value: 1000, tier: "Benefactor" },
  { value: 2500, tier: "Legend" },
];

function getTierBadgeStyle(tier: string) {
  switch (tier) {
    case "Legend":
      return "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500 text-purple-600 dark:text-purple-300";
    case "Benefactor":
      return "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400";
    case "Patron":
      return "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400";
    default:
      return "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400";
  }
}

function getTierForAmount(amt: number): "Supporter" | "Patron" | "Benefactor" | "Legend" {
  if (amt >= 2500) return "Legend";
  if (amt >= 1000) return "Benefactor";
  if (amt >= 500) return "Patron";
  return "Supporter";
}

function formatRelativeTime(dateString: string) {
  try {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateString).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

function DonatePageContent() {
  const { toast } = useToast();

  // Settings, Donors & Recent Activity state
  const [settings, setSettings] = useState<DonationSettings | null>(null);
  const [donors, setDonors] = useState<DonorCard[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Form State
  const [selectedAmount, setSelectedAmount] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [utrNumber, setUtrNumber] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [isLoggedInUser, setIsLoggedInUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Celebration State
  const [verifiedDonor, setVerifiedDonor] = useState<{
    username: string;
    contributed: number;
    totalAmount: number;
    donationCount: number;
    tier: string;
  } | null>(null);

  const activeAmount = customAmount !== "" ? Number(customAmount) || 0 : (selectedAmount || 100);
  const currentTier = getTierForAmount(activeAmount);
  const receiverUpiId = settings?.upiId || "harsh.2525@ptaxis";

  // Construct dynamic UPI Intent URI
  const upiIntentUri = `upi://pay?pa=${encodeURIComponent(receiverUpiId)}&pn=${encodeURIComponent("ConceptNichod")}&am=${activeAmount}&cu=INR&tn=${encodeURIComponent(`ConceptNichod Patron ${username || "Student"}`)}`;
  const dynamicQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(upiIntentUri)}`;

  // Load initial settings, donors, and current user context
  useEffect(() => {
    Promise.all([
      getDonationInfoAction(),
      getCurrentUserDonationContextAction()
    ])
      .then(([donationRes, userRes]) => {
        if (donationRes.success) {
          if (donationRes.settings) setSettings(donationRes.settings);
          if (donationRes.donors) setDonors(donationRes.donors);
          if (donationRes.recentTransactions) setRecentTransactions(donationRes.recentTransactions);
        }
        if (userRes.success && userRes.username) {
          setUsername(userRes.username);
          setIsLoggedInUser(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load donation context:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleCopyUpi = () => {
    if (!receiverUpiId) return;
    navigator.clipboard.writeText(receiverUpiId);
    setCopied(true);
    toast({
      title: "UPI ID Copied!",
      description: `${receiverUpiId} copied to clipboard.`,
    });
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSelectPreset = (val: number) => {
    setSelectedAmount(val);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    setCustomAmount(val);
    if (val !== "") {
      setSelectedAmount(null);
    } else {
      setSelectedAmount(100);
    }
  };

  const handleUtrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphanumeric uppercase characters up to 12 digits
    const clean = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 20);
    setUtrNumber(clean);
  };

  const handleSubmitUtrVerification = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoggedInUser || !username) {
      toast({
        title: "Sign In Required",
        description: "Please sign in with your ConceptNichod account to verify your donation.",
        variant: "destructive",
      });
      return;
    }

    if (activeAmount < 1) {
      toast({
        title: "Invalid Amount",
        description: "Please enter an amount of at least ₹1.",
        variant: "destructive",
      });
      return;
    }

    const cleanUtr = utrNumber.trim();
    if (!/^[A-Za-z0-9]{8,20}$/.test(cleanUtr)) {
      toast({
        title: "Transaction Reference Required",
        description: `Please enter the transaction reference shown on your UPI receipt.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitDonationUtrAction({
        amount: activeAmount,
        utr: cleanUtr,
      });

      if (res.success && res.status === "pending") {
        setUtrNumber("");
        toast({
          title: "Submitted for bank reconciliation",
          description: res.message || "Your UTR is pending manual verification. It has not been added to the Hall of Patrons.",
        });
      } else {
        toast({
          title: "Submission not accepted",
          description: res.error || "Could not submit this transaction reference.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Verification Error",
        description: err?.message || "An unexpected error occurred while verifying your UTR.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-6 sm:py-10 px-3.5 sm:px-6 lg:px-8 pb-safe">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="space-y-1">
            <Link 
              href="/dashboard" 
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-2.5 sm:gap-3 font-headline break-words">
              <Heart className="w-7 h-7 sm:w-8 sm:h-8 text-rose-500 fill-rose-500 animate-pulse shrink-0" />
              <span>Support ConceptNichod</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
              100% free, concept-first education for competitive aspirants across India. Your direct patronage sustains our servers, database, and AI compute.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 text-xs border-primary/30 bg-primary/5 text-primary flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Direct UPI • 0% Commission
            </Badge>
          </div>
        </div>

        {/* Live Recent Transactions Feed Banner */}
        {recentTransactions.length > 0 && (
          <div className="bg-muted/30 border border-border/80 rounded-2xl p-3.5 sm:p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-primary animate-spin-slow" />
              <span>Recent Contributions</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth">
              {recentTransactions.map((tx) => (
                <div 
                  key={tx.uuid} 
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/70 text-xs shrink-0 shadow-sm hover:border-primary/40 transition-colors"
                >
                  <span className="font-bold text-foreground">@{tx.username}</span>
                  <span className="text-muted-foreground">contributed</span>
                  <span className="font-black text-primary flex items-center">
                    <Rupee amount={tx.amount} className="w-3 h-3 stroke-[2.8]" />
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                    {formatRelativeTime(tx.donatedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Celebration Banner after successful verification */}
        {verifiedDonor && (
          <Card className="border-emerald-500/50 bg-emerald-500/10 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    Payment Verified & Celebrated!
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-1">
                    <span>Thank you <strong>@{verifiedDonor.username}</strong>! You just contributed</span>
                    <strong className="text-foreground inline-flex items-center"><Rupee amount={verifiedDonor.contributed} className="w-3.5 h-3.5 stroke-[2.6]" /></strong>.
                    <span>Your cumulative patronage is now</span>
                    <strong className="text-primary font-bold inline-flex items-center"><Rupee amount={verifiedDonor.totalAmount} className="w-3.5 h-3.5 stroke-[2.6]" /></strong>
                    <span>across {verifiedDonor.donationCount} contribution{verifiedDonor.donationCount > 1 ? "s" : ""}.</span>
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white px-3.5 py-1 text-xs shrink-0 font-bold">
                {verifiedDonor.tier} Patron
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* Main Grid: Direct UPI Payment Widget + Hall of Patrons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Direct In-App Payment & UTR Entry (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            <Card className="border-primary/40 shadow-xl bg-gradient-to-b from-card via-card to-card/95 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-primary" />
              
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl font-bold flex items-center gap-2 font-headline">
                    <Zap className="w-5 h-5 text-amber-500" /> Direct UPI Contribution
                  </CardTitle>
                  <Badge variant="outline" className={`text-[10px] font-bold ${getTierBadgeStyle(currentTier)}`}>
                    {currentTier} Tier
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Scan QR, pay with any UPI App, and submit your 12-digit UTR below for instant recognition.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <form onSubmit={handleSubmitUtrVerification} className="space-y-5">
                  
                  {/* Step 1: Select Amount */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Step 1: Select Contribution Amount
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESET_AMOUNTS.map((preset) => {
                        const isSelected = selectedAmount === preset.value && customAmount === "";
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleSelectPreset(preset.value)}
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs font-bold transition-all ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20 scale-[1.02]"
                                : "border-border/80 bg-muted/40 hover:bg-muted text-foreground"
                            }`}
                          >
                            <span className="text-sm font-black flex items-center gap-0.5">
                              <IndianRupee className="w-3.5 h-3.5 stroke-[2.6]" />
                              <span>{preset.value}</span>
                            </span>
                            <span className={`text-[9px] font-normal opacity-85 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`}>
                              {preset.tier}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Amount Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="custom-amount" className="font-semibold text-muted-foreground flex items-center gap-1">
                        <span>Or Custom Amount</span>
                      </Label>
                      {activeAmount > 0 && (
                        <span className="text-muted-foreground">
                          Qualifies as <strong className="text-foreground">{currentTier}</strong>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <IndianRupee className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground stroke-[2.4]" />
                      <Input
                        id="custom-amount"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter amount (e.g. 500)"
                        value={customAmount}
                        onChange={handleCustomAmountChange}
                        className="pl-8 text-base font-semibold"
                      />
                    </div>
                  </div>

                  {/* Step 2: Pay via Dynamic QR Code or 1-Tap UPI Apps */}
                  <div className="space-y-3 pt-2 border-t border-border/60">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>Step 2: Scan QR or Tap UPI App</span>
                      <span className="text-primary font-bold font-mono inline-flex items-center">
                        <Rupee amount={activeAmount} className="w-3.5 h-3.5 stroke-[2.6]" />
                      </span>
                    </Label>

                    {/* Dynamic QR Box */}
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-border/60 flex flex-col items-center justify-center max-w-[210px] mx-auto w-full aspect-square relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={dynamicQrCodeUrl} 
                        alt="ConceptNichod UPI Payment QR" 
                        className="w-full h-full object-contain rounded-lg"
                      />
                      <span className="text-[10px] text-slate-500 font-mono mt-1 font-semibold">
                        Scan with GPay / PhonePe / Paytm
                      </span>
                    </div>

                    {/* VPA Display & Copy */}
                    <div className="flex items-center gap-2 p-2 bg-muted/60 rounded-xl border border-border/80">
                      <span className="text-xs text-muted-foreground font-semibold pl-1">VPA:</span>
                      <span className="font-mono text-xs font-bold text-foreground px-1 truncate flex-1">
                        {receiverUpiId}
                      </span>
                      <Button 
                        size="sm" 
                        type="button"
                        variant="outline"
                        onClick={handleCopyUpi} 
                        className="shrink-0 gap-1.5 h-7 text-xs"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>

                    {/* 1-Tap Mobile Intent Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <a 
                        href={`phonepe://pay?pa=${encodeURIComponent(receiverUpiId)}&pn=ConceptNichod&am=${activeAmount}&cu=INR`}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-bold transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5" /> PhonePe
                      </a>
                      <a 
                        href={`gpay://upi/pay?pa=${encodeURIComponent(receiverUpiId)}&pn=ConceptNichod&am=${activeAmount}&cu=INR`}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-bold transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5" /> Google Pay
                      </a>
                      <a 
                        href={`paytmmp://pay?pa=${encodeURIComponent(receiverUpiId)}&pn=ConceptNichod&am=${activeAmount}&cu=INR`}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 text-xs font-bold transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5" /> Paytm
                      </a>
                      <a 
                        href={upiIntentUri}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Any UPI App
                      </a>
                    </div>
                  </div>

                  {/* Step 3: Enter 12-Digit UTR */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="utr-input" className="font-semibold text-muted-foreground uppercase tracking-wider">
                        Step 3: Enter UPI Transaction Reference
                      </Label>
                      <span className={`font-mono text-xs font-bold ${utrNumber.length === 12 ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {utrNumber.length}/20 Characters
                      </span>
                    </div>

                    <div className="relative">
                      <Input
                        id="utr-input"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        maxLength={12}
                        placeholder="e.g. 431289567123"
                        value={utrNumber}
                        onChange={handleUtrChange}
                        className="font-mono text-base tracking-wider font-bold"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Enter the UPI transaction reference shown on your payment receipt.
                    </p>
                  </div>

                  {/* Username Display / Auth Requirement */}
                  <div className="space-y-1.5">
                    {isLoggedInUser ? (
                      <div className="flex items-center justify-between gap-3 p-2.5 bg-muted/60 rounded-xl border border-border/80">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                            @
                          </span>
                          <span className="font-mono text-xs font-bold text-foreground truncate">
                            {username}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] gap-1 shrink-0 bg-background/80 font-mono text-emerald-600 dark:text-emerald-400">
                          <Check className="w-2.5 h-2.5" /> Verified Account
                        </Badge>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <Info className="w-4 h-4 shrink-0" />
                          <span>Sign in required to record your donation</span>
                        </div>
                        <Link href="/login?redirect=/donate" className="block">
                          <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-xs h-8">
                            <LogIn className="w-3.5 h-3.5" /> Sign In to Donate
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Submit CTA Button */}
                  <Button
                    type="submit"
                    disabled={isSubmitting || activeAmount < 1 || !/^[A-Z0-9]{8,20}$/.test(utrNumber) || !isLoggedInUser}
                    className="w-full h-11 text-sm font-bold bg-gradient-to-r from-rose-500 via-amber-500 to-primary hover:opacity-95 shadow-lg shadow-primary/20 gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting UTR for bank reconciliation...
                      </>
                    ) : !isLoggedInUser ? (
                      <>
                        <Lock className="w-4 h-4" />
                        Sign In to Submit UTR
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Submit UTR for manual review</span>
                      </>
                    )}
                  </Button>

                  <div className="pt-0.5 flex items-center justify-center gap-2 text-[11px] text-muted-foreground text-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Duplicate references are blocked. Submission does not mean payment is verified; only bank-reconciled credits enter the Hall of Patrons.</span>
                  </div>
                </form>
              </CardContent>
            </Card>

          </div>

          {/* Right Column: Hall of Patrons / Cumulative Leaderboard (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="text-xl font-bold font-headline">Hall of Patrons</h2>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
                {donors.length} Honored Patron{donors.length === 1 ? "" : "s"}
              </span>
            </div>

            {donors.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {donors.map((donor, index) => {
                  const displayTotal = donor.totalAmount !== undefined ? donor.totalAmount : donor.amount;
                  const count = donor.donationCount || 1;
                  const isTopRank = index < 3;

                  return (
                    <Card 
                      key={donor.uuid || donor.username} 
                      className={`border transition-all duration-300 hover:shadow-md ${
                        verifiedDonor && donor.username === verifiedDonor.username
                          ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5 scale-[1.01]"
                          : isTopRank
                          ? "border-amber-500/30 bg-card"
                          : "border-border/80 hover:border-primary/40 bg-card"
                      }`}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <CardTitle className="text-base font-bold flex items-center gap-1.5 font-headline truncate">
                              {index === 0 && <span className="text-amber-500 text-sm">🥇</span>}
                              {index === 1 && <span className="text-slate-400 text-sm">🥈</span>}
                              {index === 2 && <span className="text-amber-700 text-sm">🥉</span>}
                              <span>@{donor.username}</span>
                            </CardTitle>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                              <span>
                                {donor.lastDonatedAt || donor.donatedAt 
                                  ? formatRelativeTime(donor.lastDonatedAt || donor.donatedAt)
                                  : "Supporter"}
                              </span>
                              {count > 1 && (
                                <span className="bg-primary/10 text-primary px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  {count} donations
                                </span>
                              )}
                            </div>
                          </div>

                          <Badge variant="outline" className={`text-[10px] font-bold shrink-0 ${getTierBadgeStyle(donor.tier)}`}>
                            {donor.tier}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 pt-2 space-y-2">
                        <div className="text-lg font-black text-primary flex items-center gap-1">
                          <Rupee amount={displayTotal} className="w-4 h-4 stroke-[2.8]" />
                        </div>
                        {(donor.latestMessage || donor.message) && (
                          <p className="text-xs text-muted-foreground italic line-clamp-2">
                            "{donor.latestMessage || donor.message}"
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-8 text-center border-dashed border-border/80 bg-muted/10 space-y-3">
                <Heart className="w-10 h-10 text-muted-foreground/60 mx-auto" />
                <h3 className="text-base font-semibold">Be the First Patron</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Scan the UPI QR code, pay, and submit the transaction reference. Contributions appear after bank reconciliation.
                </p>
              </Card>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

export default function DonatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <DonatePageContent />
    </Suspense>
  );
}
