import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード", icon: "dashboard" },
  { href: "/days", label: "履歴", icon: "history_edu" },
  { href: "/calendar", label: "カレンダー", icon: "calendar_month" },
  { href: "/analytics", label: "アナリティクス", icon: "analytics" },
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
    <div className="flex h-screen w-full overflow-hidden bg-[#112211]">
      {/* 左サイドバー（固定幅） */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-[#0e1c0e] border-r border-[#244724] h-screen overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex gap-3 items-center mb-4">
            <div className="w-11 h-11 rounded-full bg-[#1a331a] border-2 border-[#19e619]/20 flex items-center justify-center text-lg font-bold text-[#19e619]">
              N
            </div>
            <div className="flex flex-col">
              <span className="text-white text-sm font-bold">Nutrition</span>
              <span className="text-[#19e619]/80 text-xs">個人用</span>
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
                      ? "bg-[#19e619]/10 text-[#19e619] border border-[#19e619]/20 font-bold"
                      : "hover:bg-white/5 text-slate-400 hover:text-white font-medium"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${active ? "fill-1" : ""}`}>{icon}</span>
                  <span className="text-sm">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-[#244724]">
          <p className="text-xs text-slate-500 text-center">Nutrition Tracker</p>
        </div>
      </aside>

      {/* メイン：残り幅すべて使い AI 評価などを広く表示 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
