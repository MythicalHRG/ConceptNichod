"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { createTopicAction } from "@/app/actions";
import { useAuth } from "@/components/auth/auth-context";

const indianClasses = [
  "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
  "Class 6", "Class 7", "Class 8", "Class 9", "Class 10",
  "Class 11", "Class 12", "12+"
];

const subjectsList = [
  "English", "Maths", "Physics", "Chemistry", "Biology", 
  "Computer Science / AI / IT", "Health Care", "Social Science",
  "Economics", "Business Studies", "Accountancy", "History", 
  "Geography", "Political Science"
];

const topicSchema = z.object({
  subject: z.string({ required_error: "Please select a subject." }).min(2, "Subject must be at least 2 characters.").max(50),
  chapter: z.string().min(2, "Chapter must be at least 2 characters.").max(100),
  topic: z.string().min(3, "Topic name must be at least 3 characters.").max(100),
});

export function AddTopicButton() {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, isAuthReady, setAuthModalOpen } = useAuth();

  const form = useForm<z.infer<typeof topicSchema>>({
    resolver: zodResolver(topicSchema),
    defaultValues: { subject: "", chapter: "", topic: "" },
  });

  const isLoading = isCreating || isPending;

  const onSubmit = async (values: z.infer<typeof topicSchema>) => {
    setIsCreating(true);
    try {
      const topicId = await createTopicAction({
        name: values.topic,
        subject: values.subject,
        chapter: values.chapter,
      });

      toast({
        title: "Topic Added",
        description: `"${values.topic}" has been added successfully.`,
      });
      
      // We use startTransition to keep the UI responsive while Next.js fetches
      // the new page data. The dialog stays open and spinner keeps spinning
      // until the page transition is fully complete.
      startTransition(() => {
        router.push(`/dashboard/topic/${topicId}`);
        // Reset the form in the background
        setOpen(false);
        form.reset();
        setIsCreating(false);
      });

    } catch (error) {
      console.error("Failed to add topic:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add topic. Please try again.",
      });
      setIsCreating(false);
    }
  };

  if (pathname.startsWith('/dashboard/topic/')) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (isLoading && !newOpen) return;
      if (newOpen && !isLoggedIn) {
        setAuthModalOpen(true);
        return;
      }
      setOpen(newOpen);
    }}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-[calc(1rem+env(safe-area-inset-right,0px))] h-13 w-13 rounded-full shadow-xl sm:bottom-8 sm:right-8 sm:h-16 sm:w-16 z-40 transition-transform hover:scale-105 active:scale-95"
          size="icon"
          disabled={!isAuthReady}
        >
          <Plus className="h-7 w-7 sm:h-8 sm:w-8" />
          <span className="sr-only">Add new topic</span>
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-[425px]"
        onInteractOutside={(e) => {
          if (isLoading) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isLoading) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add a New Concept</DialogTitle>
          <DialogDescription>
            Provide details about the concept you want to master. This helps us create tailored content for you.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a subject" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subjectsList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="chapter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chapter</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Light - Reflection and Refraction" disabled={isLoading} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Spherical Mirrors" disabled={isLoading} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? "Adding & Navigating..." : "Add Topic"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
