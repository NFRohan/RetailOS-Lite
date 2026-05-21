import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, ShieldCheck, Settings } from "lucide-react";

const navItems = [
  { href: "/supervisor", label: "Overview", icon: LayoutDashboard },
  { href: "/supervisor/visits", label: "Visit Logs", icon: ClipboardList },
  { href: "/supervisor#compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/supervisor#settings", label: "Settings", icon: Settings },
];

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-surface min-h-screen text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[#d7ddeb] bg-[#edf2ff] p-4 lg:flex lg:flex-col">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
              R
            </div>
            <div>
              <p className="font-bold leading-none text-navy">RetailOS Lite</p>
              <p className="mt-1 text-xs text-muted-foreground">Field Execution</p>
            </div>
          </div>
          <Button asChild size="sm" className="mb-6 bg-navy text-white hover:bg-navy/90">
            <Link href="/supervisor/visits">
              <BarChart3 className="mr-2 h-4 w-4" />
              View Reports
            </Link>
          </Button>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-navy/70 transition-colors hover:bg-[#d9f7ff] hover:text-navy"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            className="mt-auto"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="ghost" size="sm" type="submit" className="text-navy/60 hover:text-navy">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </form>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-white/85 px-6 backdrop-blur lg:hidden">
            <span className="font-bold text-navy">RetailOS Lite</span>
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
          <main className="flex-1 p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
