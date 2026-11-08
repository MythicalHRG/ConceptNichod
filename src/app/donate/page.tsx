"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Heart, Copy, Check, ArrowLeft, QrCode, Sparkles, ShieldCheck, 
  Award, Star, Users, ExternalLink, HelpCircle 
} from "lucide-react";
import { getDonationInfoAction } from "@/app/actions/donation";
import { Rupee } from "@/components/ui/rupee-symbol";

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

export default function DonatePage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DonationSettings | null>(null);
  const [donors, setDonors] = useState<DonorCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDonationInfoAction()
      .then((res) => {
        if (res.success) {
          setSettings(res.settings);
          setDonors(res.donors || []);
        }
      })
      .catch((err) => console.error("Failed to load donation info:", err))
      .finally(() => setIsLoading(false));
  }, []);

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

  const getTierBadgeStyle = (tier: string) => {
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
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-6 sm:py-10 px-3.5 sm:px-6 lg:px-8 pb-safe">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-10">
        
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

        {/* Main Grid: QR & Instructions + Hall of Patrons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: UPI QR Card & Instructions (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="border-primary/30 shadow-md bg-gradient-to-b from-card to-card/90 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-primary" />
              <CardHeader className="text-center pb-3">
                <CardTitle className="text-xl font-bold flex items-center justify-center gap-2 font-headline">
                  <QrCode className="w-5 h-5 text-primary" /> Scan & Donate via UPI
                </CardTitle>
                <CardDescription className="text-xs">
                  Zero commission • Instant 100% direct developer support
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 flex flex-col items-center">
                {/* QR Code Container */}
                <div className="p-4 bg-white rounded-2xl shadow-inner border border-border/40 flex items-center justify-center max-w-[240px] w-full aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={settings?.qrCodeUrl || "/qr.png"} 
                    alt="Admin UPI QR Code" 
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>

                {/* UPI ID Pill & Copy Button */}
                <div className="w-full space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block text-center">
                    Official UPI Virtual Payment Address (VPA)
                  </label>
                  <div className="flex items-center gap-2 p-2 bg-muted/60 rounded-xl border border-border/80">
                    <span className="font-mono text-sm font-bold text-foreground px-2 truncate flex-1">
                      {settings?.upiId || "harsh.2525@ptaxis"}
                    </span>
                    <Button 
                      size="sm" 
                      onClick={handleCopyUpi} 
                      className="shrink-0 gap-1.5"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                {/* Custom Admin Instructions */}
                <div className="w-full space-y-2 bg-muted/30 p-4 rounded-xl border border-border/60 text-xs text-foreground/80 leading-relaxed">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Instructions for Donors:
                  </p>
                  <p className="whitespace-pre-line">
                    {settings?.customInstructions || 
                      "Scan using Google Pay, PhonePe, Paytm, or BHIM UPI. Mention your username in the transaction remarks so we can honor your support on our Hall of Patrons!"}
                  </p>
                  {settings?.thankYouNote && (
                    <p className="text-primary font-medium italic pt-1 border-t border-border/40">
                      "{settings.thankYouNote}"
                    </p>
                  )}
                </div>
              </CardContent>
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
                  <Card key={donor.uuid} className="border border-border/80 shadow-sm hover:border-primary/40 transition-all">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
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
                      <div className="text-lg font-black text-primary flex items-center">
                        <Rupee amount={donor.amount} />
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
                  Scan the UPI QR code on the left to contribute any amount. Our admin will celebrate your contribution right here on the Hall of Patrons!
                </p>
              </Card>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
