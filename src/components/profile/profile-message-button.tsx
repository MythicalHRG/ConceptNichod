"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { startDirectChatAction } from "@/app/actions/chat";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function ProfileMessageButton({ username }: { username: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const openChat = async () => {
    setLoading(true);
    try {
      const conversation = await startDirectChatAction(username);
      router.push(`/dashboard/aspirants-connect?tab=chats&conversation=${encodeURIComponent(conversation.id)}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not start chat",
        description: error?.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button className="mt-4" onClick={openChat} disabled={loading}>
      {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MessageCircle className="mr-2 size-4" />}
      {loading ? "Opening chat…" : "Message"}
    </Button>
  );
}
