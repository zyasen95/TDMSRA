"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Compass,
  Target,
  BarChart2,
  Brain,
  Layers,
  BookOpen,
  PenTool,
  Settings,
  Gift,
  Shield,
  FileText,
  BookOpenCheck
} from 'lucide-react';
import { supabase } from "../lib/supabaseClient";

export default function AppLayout({ children }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect client & window width
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Collapse sidebar by default on mobile
  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") localStorage.clear();
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 grid grid-rows-[60px_1fr] sm:grid-cols-[auto_1fr] text-sm">
        {/* Mobile backdrop */}
        {isMobile && !collapsed && (
          <div
            className="fixed inset-0 z-10 bg-black/40"
            onClick={() => setCollapsed(true)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`bg-[#334155] ${
            isMobile
              ? `fixed inset-y-0 left-0 z-20 transform transition-transform duration-300 ${
                  collapsed ? "-translate-x-full" : "translate-x-0"
                } w-64`
              : `row-span-2 flex flex-col transition-all duration-300 ease-in-out ${
                  collapsed ? "w-[80px]" : "w-[250px]"
                }`
          }`}
        >
          <div className="bg-[#1e293b] p-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {collapsed ? "T" : "TopDecile"}
            </h2>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-white hover:text-blue-300 focus:outline-none"
            >
              {isMobile ? "✕" : "☰"}
            </button>
          </div>

          <nav className="flex flex-col flex-grow p-4 text-sm bg-[#334155]">
            <div className="flex flex-col gap-4">
              <a
                href="/dashboard"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <Compass className="w-5 h-5" />
                {!collapsed && <span>Dashboard</span>}
              </a>
              <a
                href="/custom-quiz"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <Target className="w-5 h-5" />
                {!collapsed && <span>Custom Quiz</span>}
              </a>
              <a
                href="/flashcards"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <Layers className="w-5 h-5" />
                {!collapsed && <span>Flashcards</span>}
              </a>
              <a
                href="/analytics"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <BarChart2 className="w-5 h-5" />
                {!collapsed && <span>Analytics</span>}
              </a>
              <a
                href="/study-plan"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <Brain className="w-5 h-5" />
                {!collapsed && <span>Study Plan</span>}
              </a>
              <a
                href="/settings"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <Settings className="w-5 h-5" />
                {!collapsed && <span>Settings</span>}
              </a>
            </div>

            <div className="flex-grow"></div>

            <div className="mt-4 pt-4 border-t border-gray-600">
              <a
                href="/ambassador"
                className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-[#475569] rounded-lg p-3 transition"
              >
                <Gift className="w-5 h-5" />
                {!collapsed && <span>Affiliate Hub</span>}
              </a>
            </div>
          </nav>
        </aside>

        {/* Header */}
        <header className="bg-[#f9fafb] border-b px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                onClick={() => setCollapsed(false)}
                className="sm:hidden text-blue-600 mr-2"
              >
                ☰
              </button>
            )}
            <BookOpenCheck className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-800">
              TopDecile / MSRA
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-blue-600 hover:underline text-sm"
          >
            Logout
          </button>
        </header>

        {/* Main content */}
        <main className="p-6 overflow-y-auto pb-20">{children}</main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-gray-600 text-sm">
            © 2025 TopDecile. Medical education platform.
          </div>
          <div className="flex items-center gap-6">
            <a
              href="/privacy-policy"
              className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors text-sm"
            >
              <Shield className="w-4 h-4" />
              <span>Privacy Policy</span>
            </a>
            <a
              href="/terms-of-service"
              className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              <span>Terms of Service</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
