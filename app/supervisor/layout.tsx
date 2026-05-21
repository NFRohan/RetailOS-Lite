import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut } from "lucide-react";

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-navy text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-navy p-4 lg:block">
          <div className="mb-8 flex items-center gap-2 px-2">
            <LayoutDashboard className="h-5 w-5 text-gold" />
            <span className="font-bold">
              RetailOS <span className="text-gold">Command</span>
            </span>
          </div>
          <nav className="space-y-1">
            <Link
              href="/supervisor"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-gold"
            >
              Dashboard
            </Link>
          </nav>
          <form
            className="absolute bottom-4 left-4"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="ghost" size="sm" type="submit" className="text-white/60 hover:text-white">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </form>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-white/10 px-6 lg:hidden">
            <span className="font-bold text-gold">RetailOS Command</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="icon" type="submit">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
