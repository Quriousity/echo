import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECHO",
  description: "Live Korean · English · Chinese · Japanese interpreting, side by side",
};

// 저장된 테마(없으면 시스템 설정)를 그리기 전에 <html data-theme> 로 붙여 깜빡임을 막는다 — components/ThemeToggle.tsx 와 같은 키
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("echo:theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
