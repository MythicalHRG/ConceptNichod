import { FlippingBook } from '@/components/flipping-book';
import { Logo } from '@/components/ui/logo';
import { DashboardButton } from '@/components/dashboard-button';

const FloatingBooks = () => (
  <div className="absolute inset-0 w-full h-full overflow-hidden -z-10">
    <div className="book" style={{ top: '10%', left: '5%', width: '60px', height: '90px', animationDelay: '0s', animationDuration: '20s', backgroundColor: 'hsl(var(--accent) / 0.5)' }}></div>
    <div className="book" style={{ top: '20%', left: '85%', width: '80px', height: '120px', animationDelay: '-8s', animationDuration: '18s' }}></div>
    <div className="book" style={{ top: '70%', left: '15%', width: '100px', height: '150px', animationDelay: '-3s', animationDuration: '22s', backgroundColor: 'hsl(var(--secondary) / 0.5)' }}></div>
    <div className="book" style={{ top: '80%', left: '70%', width: '50px', height: '75px', animationDelay: '-12s', animationDuration: '15s', backgroundColor: 'hsl(var(--accent) / 0.5)' }}></div>
    <div className="book" style={{ top: '40%', left: '45%', width: '90px', height: '135px', animationDelay: '-5s', animationDuration: '25s' }}></div>
  </div>
);

export default function Home() {
  return (
      <main className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background p-4 lg:p-8 overflow-hidden">
        <FloatingBooks />
        <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="mb-4 flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
              <Logo className="h-12 w-12 shrink-0 drop-shadow-lg sm:h-16 sm:w-16" />
              <h1 className="text-3xl font-headline font-bold text-foreground sm:text-4xl md:text-5xl">
                ConceptNichod
              </h1>
            </div>
            <p className="mt-2 text-lg md:text-xl text-muted-foreground max-w-md">
              Unlock your potential. Master any concept with AI-powered summaries, dynamic questions, and personalized feedback.
            </p>
            <p className="mt-4 text-base text-muted-foreground/80 max-w-md">
                Powered by Sharma Achievers' Institute in collaboration with Zirconel.
            </p>

            <div className="w-full max-w-sm mt-8">
              <DashboardButton />
            </div>

          </div>

          <div className="hidden lg:flex items-center justify-center perspective-1000 mt-6 lg:mt-0 scale-90 sm:scale-95 lg:scale-100">
            <FlippingBook />
          </div>
        </div>
      </main>
  );
}
