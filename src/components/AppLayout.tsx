import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード", icon: "dashboard" },
  { href: "/days", label: "履歴", icon: "history_edu" },
  { href: "/calendar", label: "カレンダー", icon: "calendar_month" },
  { href: "/analytics", label: "アナリティクス", icon: "analytics" },
  { href: "/personal", label: "パーソナル", icon: "person" },
  { href: "/settings", label: "設定", icon: "settings" },
] as const;

/** 左サイドバー＋メインのレイアウト。メインはAI評価などを最大幅で表示 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = router.pathname;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-page)]">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border-card)] h-screen overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex gap-3 items-center mb-4">
            <div className="w-11 h-11 rounded-full bg-[var(--bg-card)] border-2 border-[var(--nav-active-border)] flex items-center justify-center text-lg font-bold text-[var(--primary)]">
              N
            </div>
            <div className="flex flex-col">
              <span className="text-[var(--text-primary)] text-sm font-bold">からだノート</span>
              <span className="text-[var(--primary)] opacity-80 text-xs">個人用</span>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ href, label, icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    active
                      ? "bg-[var(--nav-active-bg)] text-[var(--primary)] border border-[var(--nav-active-border)] font-bold"
                      : "hover:bg-[var(--bg-card-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] font-medium"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${active ? "fill-1" : ""}`}>{icon}</span>
                  <span className="text-sm">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-[var(--border-card)]">
          <p className="text-xs text-[var(--text-tertiary)] text-center">からだノート</p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
