"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const message = String(formData.get("message") || "").trim();
    if (!message) {
      toast({
        title: "Message Required",
        description: "Please enter your feedback before sending.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await submitFeedbackAction(formData);
      toast({
        title: "Feedback Sent!",
        description: "Thank you! Your message has been sent directly to the developer.",
      });
      form.reset();
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to send feedback",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-background/50 backdrop-blur-sm">
          <MessageSquarePlus className="w-4 h-4" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">What is this regarding?</label>
            <Select name="type" defaultValue="suggestion" required>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="suggestion">💡 Suggestion / Idea</SelectItem>
                <SelectItem value="error">🐛 Bug / Error Report</SelectItem>
                <SelectItem value="other">📝 Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              name="message"
              placeholder="Tell us what's on your mind..."
              required
              maxLength={5000}
              rows={5}
              className="resize-none"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Send to Developer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
