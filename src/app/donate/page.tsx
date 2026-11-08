"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Heart, Copy, Check, ArrowLeft, QrCode, Sparkles, ShieldCheck, 
  Award, Star, Users, ExternalLink, ArrowRight, Loader2, Zap,
  CheckCircle2, Info, ChevronDown, ChevronUp, Lock, UserCheck, LogIn
} from "lucide-react";
import { IndianRupee } from "lucide-react";
import { Rupee } from "@/components/ui/rupee-symbol";
import { 
  getDonationInfoAction, 
  createDonationCheckoutAction,
  getCurrentUserDonationContextAction,
  checkDonationStatusAction
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
  amount: number;
  tier: "Supporter" | "Patron" | "Benefactor" | "Legend";
  message?: string;
  donatedAt: string;
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

function DonatePageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // Settings & Donors state
  const [settings, setSettings] = useState<DonationSettings | null>(null);
  const [donors, setDonors] = useState<DonorCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showManualQr, setShowManualQr] = useState(false);

  // Form State
  const [selectedAmount, setSelectedAmount] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [isLoggedInUser, setIsLoggedInUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Celebration State
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [confirmedDonor, setConfirmedDonor] = useState<DonorCard | null>(null);

  const activeAmount = customAmount !== "" ? Number(customAmount) || 0 : (selectedAmount || 100);
  const currentTier = getTierForAmount(activeAmount);

  // Load initial settings and current user context
  useEffect(() => {
    Promise.all([
      getDonationInfoAction(),
      getCurrentUserDonationContextAction()
    ])
      .then(([infoRes, userRes]) => {
        if (infoRes.success) {
          setSettings(infoRes.settings);
          setDonors(infoRes.donors || []);
        }
        if (userRes.success && userRes.username) {
          setUsername(userRes.username);
          setIsLoggedInUser(true);
        } else {
          setIsLoggedInUser(false);
        }
      })
      .catch((err) => console.error("Failed to load donation context:", err))
      .finally(() => setIsLoading(false));
  }, []);

  // Handle return from MysticPayments checkout (?status=success&orderId=...)
  useEffect(() => {
    const statusParam = searchParams.get("status");
    const orderIdParam = searchParams.get("orderId");

    if (statusParam === "success" && orderIdParam) {
      setSuccessOrderId(orderIdParam);
      toast({
        title: "🎉 Payment Successful!",
        description: "Your patronage is verified and immortalized in the Hall of Patrons.",
      });

      // Probe donation status to immediately confirm donor appearance
      checkDonationStatusAction(orderIdParam).then((res) => {
        if (res.success && res.isConfirmed && res.donor) {
          setConfirmedDonor(res.donor);
        }
        // Refresh donor list
        getDonationInfoAction().then((freshRes) => {
          if (freshRes.success && freshRes.donors) {
            setDonors(freshRes.donors);
          }
        });
      });
    }
  }, [searchParams, toast]);

  const handleCopyUpi = () => {
    if (!settings?.upiId) return;
    navigator.clipboard.writeText(settings.upiId);
    setCopied(true);
    toast({
      title: "UPI ID Copied!",
      description: `${settings.upiId} copied to clipboard.`,
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

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoggedInUser || !username) {
      toast({
        title: "Sign In Required",
        description: "Please sign in with your account to make a donation.",
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

    setIsSubmitting(true);
    try {
      const res = await createDonationCheckoutAction({
        amount: activeAmount,
        username: username.trim().replace(/^@+/, ""),
      });

      if (res.success && res.checkoutUrl) {
        toast({
          title: "Redirecting to MysticPayments...",
          description: "Opening sovereign UPI checkout portal.",
        });
        window.location.href = res.checkoutUrl;
      } else {
        toast({
          title: "Payment Initialization Failed",
          description: res.error || "Could not launch checkout session. Please try again.",
          variant: "destructive",
        });
        setIsSubmitting(false);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-6 sm:py-10 px-3.5 sm:px-6 lg:px-8 pb-safe">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-10">
        
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
              ConceptNichod is dedicated to building 100% free, concept-first cognitive learning tools for every competitive aspirant and student across India. Your direct patronage sustains our servers and AI compute.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 text-xs border-primary/30 bg-primary/5 text-primary flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Direct Community Driven
            </Badge>
          </div>
        </div>

        {/* Celebration Banner if returned with ?status=success */}
        {successOrderId && (
          <Card className="border-emerald-500/50 bg-emerald-500/10 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    Payment Verified & Honored!
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {confirmedDonor
                      ? `Thank you @${confirmedDonor.username}! Your ${confirmedDonor.tier} Patron badge is now live in the Hall of Patrons.`
                      : "Thank you for empowering free education! Your patronage record is now active in the Hall of Patrons."}
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white px-3 py-1 text-xs shrink-0">
                Order #{successOrderId.slice(-8)}
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* Main Grid: Interactive Donation Checkout + Hall of Patrons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Interactive Payment Widget & Manual Fallback (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Interactive Patron Checkout Card */}
            <Card className="border-primary/40 shadow-xl bg-gradient-to-b from-card via-card to-card/95 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-primary" />
              
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl font-bold flex items-center gap-2 font-headline">
                    <Zap className="w-5 h-5 text-amber-500" /> Become a Patron
                  </CardTitle>
                  <Badge variant="outline" className={`text-[10px] font-bold ${getTierBadgeStyle(currentTier)}`}>
                    {currentTier} Tier
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Automated instant recognition • Sovereign 0% commission UPI gateway
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <form onSubmit={handleProceedToPayment} className="space-y-5">
                  
                  {/* Preset Amount Chips with SVG Indian Rupee */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Select Contribution Amount
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESET_AMOUNTS.map((preset) => {
                        const isSelected = selectedAmount === preset.value && customAmount === "";
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleSelectPreset(preset.value)}
                            className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border text-xs font-bold transition-all ${
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

                  {/* Custom Amount Input with SVG Indian Rupee */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="custom-amount" className="font-semibold text-muted-foreground flex items-center gap-1">
                        <span>Or Custom Amount</span>
                        <span className="inline-flex items-center text-xs text-muted-foreground">
                          (<IndianRupee className="w-3 h-3 inline stroke-[2]" />)
                        </span>
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

                  {/* Username Field — STRICTLY UNEDITABLE & LOCKED */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label className="font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-primary" /> Patron Account Handle
                      </Label>
                      {isLoggedInUser && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <Check className="w-3 h-3" /> Verified Profile
                        </span>
                      )}
                    </div>

                    {isLoggedInUser ? (
                      <div className="flex items-center justify-between gap-3 p-3 bg-muted/60 rounded-xl border border-border/80">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                            @
                          </span>
                          <span className="font-mono text-sm font-bold text-foreground truncate">
                            {username}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] gap-1 shrink-0 bg-background/80 font-mono text-muted-foreground">
                          <Lock className="w-2.5 h-2.5" /> Fixed
                        </Badge>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <Info className="w-4 h-4 shrink-0" />
                          <span>Sign in required to donate</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          To ensure every spot on the Hall of Patrons belongs to an authentic student, you must be signed in with your account.
                        </p>
                        <Link href="/login?redirect=/donate" className="block">
                          <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-xs h-8">
                            <LogIn className="w-3.5 h-3.5" /> Sign In with Your Account
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Submit CTA Button with SVG Indian Rupee */}
                  <Button
                    type="submit"
                    disabled={isSubmitting || activeAmount < 1 || !isLoggedInUser}
                    className="w-full h-11 text-sm font-bold bg-gradient-to-r from-rose-500 via-amber-500 to-primary hover:opacity-95 shadow-lg shadow-primary/20 gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Initiating MysticPayments Checkout...
                      </>
                    ) : !isLoggedInUser ? (
                      <>
                        <Lock className="w-4 h-4" />
                        Sign In to Donate
                      </>
                    ) : (
                      <>
                        <span>Proceed to Pay via UPI •</span>
                        <span className="inline-flex items-center gap-0.5">
                          <IndianRupee className="w-3.5 h-3.5 stroke-[2.6]" />
                          <span>{activeAmount.toLocaleString("en-IN")}</span>
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>

                  {/* Security Assurance */}
                  <div className="pt-1 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>256-Bit Bank Encryption • Powered by MysticPayments</span>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Offline / Manual QR Accordion Fallback */}
            <Card className="border-border/80 bg-card/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowManualQr(!showManualQr)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <QrCode className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Prefer Direct Offline UPI VPA / QR Scan?
                  </span>
                </div>
                {showManualQr ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {showManualQr && (
                <CardContent className="pt-0 pb-5 px-5 space-y-4 border-t border-border/60">
                  <p className="text-xs text-muted-foreground pt-3">
                    If you prefer paying outside the automated checkout, scan the official QR code or copy our VPA below:
                  </p>

                  <div className="p-3 bg-white rounded-xl shadow-inner border border-border/40 flex items-center justify-center max-w-[180px] mx-auto w-full aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={settings?.qrCodeUrl || "/qr.png"} 
                      alt="Admin UPI QR Code" 
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-muted/60 rounded-xl border border-border/80">
                    <span className="font-mono text-xs font-bold text-foreground px-2 truncate flex-1">
                      {settings?.upiId || "harsh.2525@ptaxis"}
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleCopyUpi} 
                      className="shrink-0 gap-1.5 h-7 text-xs"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>

                  <div className="bg-muted/40 p-3 rounded-lg text-[11px] text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Note for Offline Payers:</p>
                    <p>
                      {settings?.customInstructions || "Mention your username in UPI remarks. Offline payments are reviewed and added to the Hall of Patrons by the admin team."}
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>

          </div>

          {/* Right Column: Hall of Patrons / Donor Wall (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold font-headline">Hall of Patrons</h2>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
                {donors.length} Honored Benefactor{donors.length === 1 ? "" : "s"}
              </span>
            </div>

            {donors.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {donors.map((donor) => (
                  <Card 
                    key={donor.uuid} 
                    className={`border transition-all duration-300 hover:shadow-md ${
                      successOrderId && donor.uuid === `mp_${successOrderId}`
                        ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5"
                        : "border-border/80 hover:border-primary/40 bg-card"
                    }`}
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <CardTitle className="text-base font-bold flex items-center gap-1.5 font-headline">
                            @{donor.username}
                          </CardTitle>
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(donor.donatedAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric"
                            })}
                          </span>
                        </div>

                        <Badge variant="outline" className={`text-[10px] font-bold ${getTierBadgeStyle(donor.tier)}`}>
                          {donor.tier}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 pt-2 space-y-2">
                      <div className="text-lg font-black text-primary flex items-center gap-1">
                        <Rupee amount={donor.amount} className="w-4 h-4 stroke-[2.8]" />
                      </div>
                      {donor.message && (
                        <p className="text-xs text-muted-foreground italic line-clamp-2">
                          "{donor.message}"
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center border-dashed border-border/80 bg-muted/10 space-y-3">
                <Heart className="w-10 h-10 text-muted-foreground/60 mx-auto" />
                <h3 className="text-base font-semibold">Be the First Patron</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Select an amount and proceed to checkout on the left. Your contribution will be automatically celebrated right here!
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
