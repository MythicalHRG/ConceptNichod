"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Clock } from "lucide-react";
import { getActiveBroadcastsAction, getUnreadCountAction, markBroadcastsAsReadAction } from "@/app/actions/broadcast";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch count on mount and every 60 seconds
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await getUnreadCountAction();
        if (res.success) setUnreadCount(res.count);
      } catch (e) {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  // When popover opens, fetch broadcasts and mark as read
  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    if (open) {
      try {
        const res = await getActiveBroadcastsAction();
        if (res.success) setBroadcasts(res.broadcasts);
        
        // Mark as read in background
        if (unreadCount > 0) {
          await markBroadcastsAsReadAction();
          setUnreadCount(0);
        }
      } catch (e) {}
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 font-semibold border-b bg-muted/30">
          Global Notifications
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {broadcasts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Bell className="w-8 h-8 opacity-20" />
              <p>You're all caught up!</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {broadcasts.map((b) => {
                const hoursLeft = Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)));
                return (
                  <div key={b._id} className="p-4 border-b last:border-0 hover:bg-muted/10 transition-colors">
                    <h4 className="font-semibold text-sm mb-1">{b.subject}</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{b.message}</p>
                    <div className="mt-3 flex items-center text-xs text-muted-foreground font-medium bg-secondary/50 w-fit px-2 py-1 rounded-md">
                      <Clock className="w-3 h-3 mr-1" />
                      Expires in {hoursLeft} hours
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
