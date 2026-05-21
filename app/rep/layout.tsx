import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Plus } from "lucide-react";

export default function RepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-rep-bg">
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/rep/visits" className="font-bold text-navy">
            RetailOS <span className="text-gold">Rep</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" asChild>
              <Link href="/rep/visits/new">
                <Plus className="h-4 w-4" />
                New visit
              </Link>
            </Button>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button size="icon" variant="ghost" type="submit">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
    </div>
  );
}
