"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

export function DashboardButton() {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <Link href="/dashboard" tabIndex={isInitializing ? -1 : 0} className={isInitializing ? 'pointer-events-none w-full' : 'w-full'}>
      <Button className="w-full" size="lg" disabled={isInitializing}>
        {isInitializing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Initializing...
          </>
        ) : (
          <>
            Go to Dashboard <ArrowRight className="ml-2"/>
          </>
        )}
      </Button>
    </Link>
  );
}
