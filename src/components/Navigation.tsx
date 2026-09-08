import type { KeyboardEvent } from "react";
import { BrainCircuit, Lightbulb, Database, LogOut, ExternalLink, Search } from "lucide-react";
import { motion } from "motion/react";
import { TabType, SpreadsheetConfig } from "../types";
import ConsistemLogo from "./ConsistemLogo";

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  spreadsheet: SpreadsheetConfig | null;
  onOpenConfig: () => void;
  onLogout: () => void;
  onOpenSearch?: () => void;
  userName?: string | null;
  userPhoto?: string | null;
}

export default function Navigation({
  activeTab,
  setActiveTab,
  spreadsheet,
  onOpenConfig,
  onLogout,
  onOpenSearch,
  userName,
  userPhoto,
}: NavigationProps) {
  const handleTabKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll('[role="tab"]')
    ) as HTMLButtonElement[];
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  };

  return (
    <header
      id="app-header"
      className="fixed top-0 left-0 right-0 z-40 px-2 sm:px-6 pt-2 sm:pt-4 pointer-events-none flex justify-center"
    >
      {/* Consistem Floating Pill (site-header__pill) */}
      <div
        id="site-header-pill"
        className="pointer-events-auto w-full max-w-6xl bg-[var(--color-surface)]/90 backdrop-blur-xl border border-white/10 shadow-[var(--shadow-md)] rounded-full px-2 sm:px-5 py-2 flex items-center justify-between gap-1 sm:gap-3"
      >
        {/* Brand & Submark */}
        <div id="brand-container" className="hidden sm:flex items-center gap-3">
          <ConsistemLogo variant="white" badge="Sinapse" size="sm" />
          <span className="hidden lg:inline-block w-px h-4 bg-white/15" />
          <span className="hidden lg:inline-block text-[11px] text-white/50 font-normal tracking-tight">
            Grafo de Conhecimento
          </span>
        </div>

        {/* Primary Navigation Tabs (Segmented Control with Glassmorphism) */}
        <nav
          id="tabs-navigation"
          className="relative flex items-center justify-center max-w-fit gap-1 bg-white/[0.08] backdrop-blur-md p-1 rounded-full border border-white/15 shadow-[0_2px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)]"
          aria-label="Navegação Principal"
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={handleTabKeyDown}
        >
          <button
            id="tab-capture"
            role="tab"
            aria-label="Captura"
            aria-selected={activeTab === "capture"}
            aria-controls="capture-panel"
            tabIndex={activeTab === "capture" ? 0 : -1}
            onClick={() => setActiveTab("capture")}
            className={`relative px-2.5 sm:px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-300 ease-out flex items-center justify-center gap-1.5 group hover:scale-105 active:scale-95 transform ${
              activeTab === "capture"
                ? "text-[var(--color-on-primary)] font-semibold"
                : "text-[var(--color-on-surface-variant)] hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            {activeTab === "capture" && (
              <motion.div
                layoutId="active-nav-indicator"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              />
            )}
            <Lightbulb
              size={13}
              className={`relative z-10 transition-colors duration-300 ${
                activeTab === "capture" ? "text-[var(--color-secondary)]" : "text-white/60 group-hover:text-white/90"
              }`}
            />
            <span className="relative z-10 hidden min-[420px]:inline transition-colors duration-300 whitespace-nowrap">Captura</span>
          </button>

          <button
            id="tab-graph"
            role="tab"
            aria-label="Grafo Sináptico"
            aria-selected={activeTab === "graph"}
            aria-controls="graph-panel"
            tabIndex={activeTab === "graph" ? 0 : -1}
            onClick={() => setActiveTab("graph")}
            className={`relative px-2.5 sm:px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-300 ease-out flex items-center justify-center gap-1.5 group hover:scale-105 active:scale-95 transform ${
              activeTab === "graph"
                ? "text-[var(--color-on-primary)] font-semibold"
                : "text-[var(--color-on-surface-variant)] hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            {activeTab === "graph" && (
              <motion.div
                layoutId="active-nav-indicator"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              />
            )}
            <BrainCircuit
              size={13}
              className={`relative z-10 transition-colors duration-300 ${
                activeTab === "graph" ? "text-[var(--color-tertiary)]" : "text-white/60 group-hover:text-white/90"
              }`}
            />
            <span className="relative z-10 hidden min-[420px]:inline transition-colors duration-300 whitespace-nowrap">Grafo Sináptico</span>
          </button>
        </nav>

        {/* Secondary External Actions & Controls */}
        <div id="user-controls" className="flex items-center gap-1.5 sm:gap-2.5">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="p-2 rounded-full text-[var(--color-on-surface-variant)] hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Abrir pesquisa universal"
            >
              <Search size={14} />
            </button>
          )}
          {spreadsheet ? (
            <a
              id="open-sheet-link"
              href={`https://docs.google.com/spreadsheets/d/${spreadsheet.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/15 transition-all py-1.5 px-3 rounded-full font-sans shadow-sm"
              title="Abrir base vinculada em nova aba"
            >
              <Database size={12} className="text-[#EBAF2D]" />
              <span className="max-w-[100px] truncate text-[11px] font-medium">{spreadsheet.name}</span>
              <ExternalLink size={10} className="opacity-60" />
            </a>
          ) : null}

          <button
            id="open-config-btn"
            onClick={onOpenConfig}
            className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              !spreadsheet
                ? "btn-consistem-warm text-white"
                : "bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 hover:text-white"
            }`}
            title="Configurar Conexão"
            aria-label={spreadsheet ? "Alterar conexão com planilha" : "Conectar planilha"}
          >
            <Database size={13} />
            <span className="hidden sm:inline">{spreadsheet ? "Conectado" : "Conectar"}</span>
          </button>

          {/* User Profile & Logout */}
          <div id="profile-section" className="flex items-center gap-1 sm:gap-2 border-l border-white/15 pl-1.5 sm:pl-2.5">
            {userPhoto ? (
              <img
                src={userPhoto}
                alt={userName || "Usuário"}
                className="w-6 h-6 rounded-full border border-white/20"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/10 text-[11px] flex items-center justify-center text-white font-medium font-sans border border-white/15">
                {userName ? userName.charAt(0).toUpperCase() : "C"}
              </div>
            )}

            <button
              id="logout-btn"
              onClick={onLogout}
              className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Sair da conta"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
