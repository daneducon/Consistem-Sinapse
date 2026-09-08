import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { initAuth, googleSignIn, logoutUser, type GoogleUser } from "./lib/googleAuth";
import { appendIdeaRow, clearUserIdeaCache, fetchIdeas, isLegacyIdeaId, migrateLegacyIdeaIds, updateBatchIdeaConnections } from "./lib/googleSheets";
import { analyzeIdeaWithOpenRouter, analyzeUrlContentWithOpenRouter } from "./lib/openrouter";
import { detectUrl } from "./lib/urlReader";
import { IdeaSaveError, type IdeaSaveStage, type TabType, type SpreadsheetConfig, type IdeaRow, type Idea } from "./types";
import { SessionExpiredError } from "./lib/errors";

import LoginScreen from "./components/LoginScreen";
import Navigation from "./components/Navigation";
import IdeaCapture from "./components/IdeaCapture";
import SpreadsheetSetup from "./components/SpreadsheetSetup";

const SynapticGraph = lazy(() => import("./components/SynapticGraph"));
const UniversalSearchBar = lazy(() => import("./components/UniversalSearchBar"));

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showReconnectModal, setShowReconnectModal] = useState(false);

  // Active Tab: capture, graph, themes
  const [activeTab, setActiveTab] = useState<TabType>("capture");

  // Configured Spreadsheet
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetConfig | null>(null);
  
  // Show Setup Modal
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Universal Semantic Search State (Ctrl + K)
  const [showUniversalSearch, setShowUniversalSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetIdeaId, setTargetIdeaId] = useState<number | null>(null);

  // Ideas fetched from Google Sheets
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [migratingIds, setMigratingIds] = useState(false);

  // Global Ctrl + K / Cmd + K shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowUniversalSearch((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const loadIdeas = useCallback(async () => {
    if (!token || !spreadsheet) {
      setIdeas([]);
      return;
    }
    setLoadingIdeas(true);
    setFetchError(null);
    try {
      const result = await fetchIdeas(token, spreadsheet.id, spreadsheet.sheetName, user!.uid);
      setIdeas(result.ideas);
      setFetchError(
        result.stale
          ? `Dados locais desatualizados: ${result.error || "não foi possível consultar o Google Sheets."}`
          : null
      );
    } catch (err: any) {
      console.error("Error fetching ideas:", err);
      if (err instanceof SessionExpiredError) setShowReconnectModal(true);
      const isUnavailable =
        err?.message?.toLowerCase().includes("unavailable") ||
        err?.message?.toLowerCase().includes("indisponível");

      setFetchError(
        isUnavailable
          ? "O serviço do Google Sheets está temporariamente indisponível e os dados não puderam ser carregados."
          : err.message || "Erro ao carregar ideias do Google Sheets."
      );
    } finally {
      setLoadingIdeas(false);
    }
  }, [token, user?.uid, spreadsheet?.id, spreadsheet?.sheetName]);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setAuthError(null);
        setUser(currentUser);
        setToken(accessToken);
        setAuthInitialized(true);
      },
      (message) => {
        setAuthError(message || null);
        setUser(null);
        setToken(null);
        setAuthInitialized(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Load configured spreadsheet from localStorage on login
  useEffect(() => {
    if (user?.uid) {
      const savedConfig = localStorage.getItem(`spreadsheet_config_${user.uid}`);
      if (savedConfig) {
        try {
          setSpreadsheet(JSON.parse(savedConfig));
        } catch (e) {
          console.error("Failed to parse saved spreadsheet config", e);
        }
      }
    } else {
      setSpreadsheet(null);
    }
  }, [user?.uid]);

  // Sync ideas from sheet
  useEffect(() => {
    if (user?.uid && token && spreadsheet?.id && spreadsheet?.sheetName) {
      loadIdeas();
    } else {
      setIdeas([]);
    }
  }, [user?.uid, token, spreadsheet?.id, spreadsheet?.sheetName, loadIdeas]);

  // Handle Google Login
  const handleLogin = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login process failed:", err);
      setAuthError(err?.message || "Não foi possível conectar sua conta Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleReconnect = async () => {
    setSigningIn(true);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setToken(result.accessToken);
      setShowReconnectModal(false);
      setAuthError(null);
    } catch (err: any) {
      setAuthError(err?.message || "Não foi possível renovar a conexão com o Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleMigrateLegacyIds = async () => {
    if (!token || !spreadsheet) return;
    setMigratingIds(true);
    try {
      await migrateLegacyIdeaIds(token, spreadsheet.id, spreadsheet.sheetName);
      await loadIdeas();
    } catch (err: any) {
      if (err instanceof SessionExpiredError) setShowReconnectModal(true);
      setFetchError(err?.message || "Não foi possível normalizar os IDs antigos.");
    } finally {
      setMigratingIds(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      if (user) clearUserIdeaCache(user.uid);
      await logoutUser();
      setUser(null);
      setToken(null);
      setSpreadsheet(null);
      setActiveTab("capture");
    } catch (err) {
      console.error("Logout process failed:", err);
    }
  };

  // Select Spreadsheet Configuration
  const handleSelectSpreadsheet = (config: SpreadsheetConfig) => {
    setSpreadsheet(config);
    if (user) {
      localStorage.setItem(`spreadsheet_config_${user.uid}`, JSON.stringify(config));
    }
  };

  // Save Idea logic (Thinking of follow-up question first, then semantic categorization & Google Sheets Sync)
  const handleSaveIdea = async (
    ideaText: string,
    onQuestionGenerated?: (question: string) => void,
    onProgress?: (stage: IdeaSaveStage) => void
  ) => {
    if (!token || !spreadsheet) {
      throw new Error("Não autenticado ou planilha não configurada.");
    }

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

    // Etapa 1: Verificar se a entrada é ou contém uma URL (YouTube, artigos, blogs, redes)
    let finalRawText = ideaText;
    let aiAnalysis: {
      temaMacro: string;
      palavrasChave: string;
      provocacoesFollowUp: string;
    };

    const detected = detectUrl(ideaText);
    if (detected) {
      onProgress?.("reading");
      // A leitura do link acontece no backend para evitar CORS e exposição de credenciais.
      const urlAnalysis = await analyzeUrlContentWithOpenRouter(
        detected.url,
        detected.userNotes,
        ideas
      );

      finalRawText = urlAnalysis.resumoGerado;
      aiAnalysis = {
        temaMacro: urlAnalysis.temaMacro,
        palavrasChave: urlAnalysis.palavrasChave,
        provocacoesFollowUp: urlAnalysis.provocacoesFollowUp,
      };
    } else {
      // Ideia tradicional em texto
      onProgress?.("analyzing");
      aiAnalysis = await analyzeIdeaWithOpenRouter(ideaText, ideas);
    }

    // Imediatamente atualiza o placeholder com a próxima pergunta antes mesmo de salvar na planilha
    if (onQuestionGenerated && aiAnalysis.provocacoesFollowUp) {
      onQuestionGenerated(aiAnalysis.provocacoesFollowUp);
    }

    onProgress?.("saving");
    const appended = await appendIdeaRow(token, spreadsheet.id, spreadsheet.sheetName, {
      dataCriacao: formattedDate,
      textoBruto: finalRawText,
      temaMacro: aiAnalysis.temaMacro,
      palavrasChave: aiAnalysis.palavrasChave,
      conexoesId: "[]",
      provocacoesFollowUp: aiAnalysis.provocacoesFollowUp,
    });
    const newIdeaId = appended.idNota;

    // Etapa 2: Mapeamento de conexões no grafo
    onProgress?.("connecting");
    const normalizedNewTheme = (aiAnalysis.temaMacro || "").trim().toUpperCase();

    const sameThemeExisting = ideas
      .filter((item) => (item.temaMacro || "").trim().toUpperCase() === normalizedNewTheme)
      .sort((a, b) => b.rowNumber - a.rowNumber)
      .slice(0, 8);
    const directMatchingIds = sameThemeExisting.map((item) => item.idNota).sort((a, b) => a - b);
    const newConexoesIdString = JSON.stringify(directMatchingIds);

    const updatesForExisting: Array<{ rowNumber: number; conexoesId: string }> = [
      { rowNumber: appended.rowNumber, conexoesId: newConexoesIdString },
    ];

    sameThemeExisting.forEach((item) => {
      let existingIds: number[] = [];
      try {
        if (item.conexoesId) {
          const parsed = JSON.parse(item.conexoesId);
          if (Array.isArray(parsed)) {
            existingIds = parsed.map(Number).filter((n) => !isNaN(n));
          }
        }
      } catch {
        existingIds = (item.conexoesId || "")
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
      }

      if (!existingIds.includes(newIdeaId)) {
        const updatedIds = [...existingIds, newIdeaId].sort((a, b) => a - b);
        updatesForExisting.push({
          rowNumber: item.rowNumber,
          conexoesId: JSON.stringify(updatedIds),
        });
      }
    });

    const newIdeaRow: IdeaRow = {
      idNota: newIdeaId,
      dataCriacao: formattedDate,
      textoBruto: finalRawText,
      temaMacro: aiAnalysis.temaMacro,
      palavrasChave: aiAnalysis.palavrasChave,
      conexoesId: newConexoesIdString,
      provocacoesFollowUp: aiAnalysis.provocacoesFollowUp,
    };

    try {
      await updateBatchIdeaConnections(token, spreadsheet.id, spreadsheet.sheetName, updatesForExisting);
    } catch (err: any) {
      if (err instanceof SessionExpiredError) {
        setShowReconnectModal(true);
        throw new IdeaSaveError(
          "A nota foi salva, mas a sessão expirou antes de confirmar as conexões. Não salve novamente; reconecte sua conta.",
          true,
          true
        );
      }
      try {
        await loadIdeas();
      } catch {}
      throw new IdeaSaveError(
        `A nota foi salva, mas houve uma falha parcial ao atualizar o grafo. Não salve novamente. ${err?.message || "Reconecte e recarregue as ideias."}`,
        true
      );
    }

    onProgress?.("syncing");
    await loadIdeas();

    return newIdeaRow;
  };

  // Loading state
  if (!authInitialized) {
    return (
      <div className="min-h-screen consistem-canvas-bg text-white flex flex-col items-center justify-center relative">
        <Loader2 size={36} className="text-[#EBAF2D] animate-spin mb-4" />
        <p className="text-xs font-medium text-white/60 tracking-tight font-sans">
          Carregando ecossistema Consistem...
        </p>
      </div>
    );
  }

  // Login view: Consistem LMS split-screen matching screenshot & design system
  if (!user) {
    return (
      <div className="relative">
        {authError && (
          <div role="alert" className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-lg px-4 py-3 rounded-xl bg-[#2A1717] border border-[#DF5241]/40 text-sm text-white">
            {authError}
          </div>
        )}
        <LoginScreen onLogin={handleLogin} signingIn={signingIn} />
      </div>
    );
  }

  // Logged-in application
  return (
    <div className="min-h-screen consistem-canvas-bg text-white flex flex-col relative overflow-x-hidden pt-24 pb-16">
      
      {/* Consistem Floating Header */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        spreadsheet={spreadsheet}
        onOpenConfig={() => setShowSetupModal(true)}
        onLogout={handleLogout}
        onOpenSearch={() => setShowUniversalSearch(true)}
        userName={user.displayName}
        userPhoto={user.photoURL}
      />

      {/* Main Content Area */}
      <main id="app-main-content" className="flex-1 flex flex-col justify-center px-4 sm:px-6 relative z-10">
        {/* Banner de feedback caso o Google Sheets apresente indisponibilidade transitória */}
        {fetchError && (
          <div
            id="sheets-service-alert"
            role="alert"
            className="w-full max-w-2xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-[#EBAF2D]/10 border border-[#EBAF2D]/25 backdrop-blur-md flex items-center justify-between gap-3 text-xs text-white/90 shadow-lg"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle size={16} className="text-[#EBAF2D] shrink-0" />
              <span className="truncate">{fetchError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-retry-sheets"
                onClick={() => loadIdeas()}
                disabled={loadingIdeas}
                className="px-3 py-1.5 rounded-full bg-[#EBAF2D]/20 hover:bg-[#EBAF2D]/30 text-[#EBAF2D] font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {loadingIdeas ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                <span>Tentar novamente</span>
              </button>
              <button
                id="btn-dismiss-alert"
                onClick={() => setFetchError(null)}
                className="p-1 text-white/50 hover:text-white rounded-full transition-colors"
                title="Dispensar aviso"
                aria-label="Dispensar aviso"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {ideas.some((idea) => isLegacyIdeaId(idea.idNota)) && (
          <div className="w-full max-w-2xl mx-auto mb-6 rounded-2xl border border-[#EBAF2D]/25 bg-[#EBAF2D]/[0.08] px-4 py-3 text-sm text-white/85 shadow-lg sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="font-semibold text-white">IDs antigos encontrados</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/60">
                Normalize {ideas.filter((idea) => isLegacyIdeaId(idea.idNota)).length} registros e suas conexões para recuperar a sequência numérica.
              </p>
            </div>
            <button
              type="button"
              onClick={handleMigrateLegacyIds}
              disabled={migratingIds}
              className="mt-3 inline-flex shrink-0 items-center gap-2 rounded-full border border-[#EBAF2D]/30 bg-[#EBAF2D]/15 px-4 py-2 text-xs font-semibold text-[#EBAF2D] transition-colors hover:bg-[#EBAF2D]/25 disabled:opacity-50 sm:mt-0"
            >
              {migratingIds && <Loader2 size={13} className="animate-spin" />}
              {migratingIds ? "Normalizando..." : "Normalizar IDs"}
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "capture" && (
            <motion.div
              key="capture-tab"
              id="capture-panel"
              role="tabpanel"
              aria-labelledby="tab-capture"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col"
            >
              {!spreadsheet ? (
                <div className="py-6 flex flex-col items-center justify-center">
                  <SpreadsheetSetup
                    accessToken={token}
                    spreadsheet={spreadsheet}
                    onSelectSpreadsheet={handleSelectSpreadsheet}
                  />
                </div>
              ) : (
                <IdeaCapture
                  spreadsheet={spreadsheet}
                  ideas={ideas}
                  onSaveIdea={handleSaveIdea}
                  onOpenConfig={() => setShowSetupModal(true)}
                  onSessionExpired={() => setShowReconnectModal(true)}
                />
              )}
            </motion.div>
          )}

          {activeTab === "graph" && (
            <motion.div
              key="graph-tab"
              id="graph-panel"
              role="tabpanel"
              aria-labelledby="tab-graph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div className="min-h-[60vh] grid place-items-center"><Loader2 className="animate-spin text-[#EBAF2D]" aria-label="Carregando grafo" /></div>}>
                <SynapticGraph
                  ideas={ideas}
                  loading={loadingIdeas}
                  searchQuery={searchQuery}
                  onClearSearch={() => {
                    setSearchQuery("");
                    setTargetIdeaId(null);
                  }}
                  onOpenSearch={() => setShowUniversalSearch(true)}
                  targetNodeId={targetIdeaId}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto text-center pt-12 pb-4 px-6 border-t border-white/10 text-xs text-white/40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>© 2026 Consistem Sistemas. Confiança em cada decisão.</span>
        </div>
        <div className="flex items-center gap-4 text-white/50">
          <a
            href="https://consistem.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            consistem.com.br
          </a>
        </div>
      </footer>

      {/* Universal Semantic Search Modal (Ctrl + K) */}
      {showUniversalSearch && (
        <Suspense fallback={null}>
          <UniversalSearchBar
            isOpen
            onClose={() => setShowUniversalSearch(false)}
            ideas={ideas}
            onSelectSearchQuery={(query, id) => {
              setSearchQuery(query);
              setTargetIdeaId(id || null);
              setActiveTab("graph");
            }}
          />
        </Suspense>
      )}

      {/* Settings Modal (Overlay) */}
      {showSetupModal && (
        <SpreadsheetSetup
          accessToken={token}
          spreadsheet={spreadsheet}
          onSelectSpreadsheet={handleSelectSpreadsheet}
          onClose={() => setShowSetupModal(false)}
          isModal={true}
        />
      )}

      {showReconnectModal && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 backdrop-blur-md" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reconnect-title"
            className="w-full max-w-md rounded-3xl border border-white/15 bg-[var(--color-surface-card)] p-6 shadow-[var(--shadow-xl)] sm:p-8"
          >
            <div className="mb-5 grid h-10 w-10 place-items-center rounded-2xl bg-[#EBAF2D]/10 text-[#EBAF2D]">
              <RefreshCw size={18} />
            </div>
            <h2 id="reconnect-title" className="text-xl font-semibold text-white">Reconecte sua conta Google</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              A autorização do Sheets expirou. Seu texto continua no card e será preservado enquanto você renova o acesso.
            </p>
            {authError && <p role="alert" className="mt-3 text-xs leading-relaxed text-[#FF7B6B]">{authError}</p>}
            <button
              type="button"
              onClick={handleReconnect}
              disabled={signingIn}
              autoFocus
              className="btn-consistem-warm mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm disabled:opacity-60"
            >
              {signingIn && <Loader2 size={16} className="animate-spin" />}
              {signingIn ? "Reconectando..." : "Reconectar com Google"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
