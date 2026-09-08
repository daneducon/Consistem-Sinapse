import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import {
  Search,
  X,
  CornerDownLeft,
  ArrowRight,
  BrainCircuit,
  Compass,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Idea } from "../types";
import { performSemanticSearch, SemanticSearchResult } from "../lib/semanticSearch";
import { formatIdeaReference } from "../lib/ideaReference";

interface UniversalSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  ideas: Idea[];
  onSelectSearchQuery: (query: string, targetIdeaId?: number) => void;
}

const POPULAR_CONCEPTS = [
  "Estratégia de Vendas e Leads",
  "Automação e Indústria",
  "Processos Comerciais B2B",
  "Sincronização em Nuvem",
  "Gargalos Operacionais",
  "Inteligência Artificial e Sinapse",
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogFocus(isOpen: boolean, onClose: () => void, initialFocusRef: RefObject<HTMLInputElement | null>) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => initialFocusRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      ) as HTMLElement[];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [initialFocusRef, isOpen, onClose]);

  return dialogRef;
}

export default function UniversalSearchBar({
  isOpen,
  onClose,
  ideas,
  onSelectSearchQuery,
}: UniversalSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, inputRef);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Execute fast semantic search as query updates
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const matched = performSemanticSearch(query, ideas);
    setResults(matched);
    setSelectedIndex(0);
  }, [query, ideas]);

  // Handle global key events within the modal
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]);
      } else if (query.trim()) {
        handleSubmitQuery(query.trim());
      }
    }
  };

  const handleSelectResult = (result: SemanticSearchResult) => {
    onSelectSearchQuery(query.trim() || result.idea.temaMacro || "", result.idea.idNota);
    onClose();
  };

  const handleSubmitQuery = (selectedQuery: string) => {
    onSelectSearchQuery(selectedQuery);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="universal-search-backdrop"
          className="fixed inset-0 z-50 bg-[var(--color-backdrop)] backdrop-blur-md flex items-start justify-center pt-16 sm:pt-28 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            id="universal-search-palette"
            role="dialog"
            aria-modal="true"
            aria-labelledby="universal-search-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full max-w-2xl max-h-[calc(100dvh-5rem)] sm:max-h-[calc(100dvh-8rem)] bg-[var(--color-surface)] border border-white/15 rounded-3xl shadow-[var(--shadow-xl)] overflow-hidden flex flex-col"
          >
            <h2 id="universal-search-title" className="sr-only">Pesquisar ideias</h2>
            {/* Search Input Bar */}
            <div className="relative flex items-center px-5 py-4 border-b border-white/10 gap-3">
              <Search size={18} className="text-[#EBAF2D] shrink-0" />
              <label htmlFor="universal-search-input" className="sr-only">
                Pesquisar ideias, temas e palavras-chave
              </label>
              <input
                ref={inputRef}
                id="universal-search-input"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-controls={results.length > 0 ? "universal-search-results" : undefined}
                aria-expanded={query.trim() !== "" && results.length > 0}
                aria-activedescendant={results[selectedIndex] ? `search-option-${results[selectedIndex].idea.idNota}` : undefined}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pesquisar ideias, temas, palavras-chave..."
                className="w-full bg-transparent border-0 outline-none text-white placeholder-white/40 text-base font-normal tracking-tight focus:ring-0"
              />

              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-1 rounded-full text-white/40 hover:text-white transition-colors"
                  aria-label="Limpar pesquisa"
                >
                  <X size={16} />
                </button>
              )}

              <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-white/60 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                <span>Esc</span>
              </div>
            </div>

            {/* Results or Suggested Concepts Area */}
            <div className="max-h-[380px] overflow-y-auto p-4 space-y-3">
              {query.trim() === "" ? (
                /* Suggested Concepts when empty */
                <div className="space-y-3 py-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white/50 px-1">
                    <Compass size={13} className="text-[#DF5241]" />
                    <span>Sugestões rápidas</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {POPULAR_CONCEPTS.map((concept, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setQuery(concept);
                        }}
                        className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/15 text-left transition-all group"
                      >
                        <span className="text-xs text-white/80 group-hover:text-white font-medium truncate">
                          {concept}
                        </span>
                        <ArrowRight size={12} className="text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : results.length === 0 ? (
                /* No matches */
                <div className="py-8 text-center space-y-2">
                  <BrainCircuit size={28} className="mx-auto text-white/20" />
                  <p className="text-sm text-white/70 font-medium">Nenhum resultado encontrado para "{query}"</p>
                  <button
                    onClick={() => handleSubmitQuery(query)}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#EBAF2D] hover:bg-white/10 transition-colors"
                  >
                    <span>Pesquisar no grafo assim mesmo</span>
                    <CornerDownLeft size={11} />
                  </button>
                </div>
              ) : (
                /* Results List */
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-2 text-xs text-white/50 font-medium" aria-live="polite">
                    <span>{results.length} {results.length === 1 ? "resultado" : "resultados"}</span>
                    <span className="text-[11px] text-white/40">Pressione Enter para focar</span>
                  </div>

                  <div id="universal-search-results" role="listbox" aria-label="Resultados da pesquisa" className="space-y-2">
                  {results.map((res, index) => {
                    const isSelected = index === selectedIndex;
                    const relevancePercent = Math.round(res.score * 100);

                    return (
                      <button
                        key={res.idea.idNota}
                        id={`search-option-${res.idea.idNota}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectResult(res)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full text-left p-3.5 rounded-2xl transition-all flex flex-col gap-1.5 border ${
                          isSelected
                            ? "bg-white/[0.08] border-[#EBAF2D]/50 shadow-[0_4px_20px_rgba(235,175,45,0.15)]"
                            : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono text-[11px] text-white/60 bg-white/5 px-1.5 py-0.5 rounded">
                              {formatIdeaReference(res.idea.idNota)}
                            </span>
                            <span className="text-xs font-semibold text-white/90 truncate uppercase tracking-tight">
                              {res.idea.temaMacro || "Geral"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
                                relevancePercent >= 70
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : "bg-[#EBAF2D]/20 text-[#EBAF2D] border border-[#EBAF2D]/30"
                              }`}
                            >
                              {relevancePercent}% compatível
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">
                          {res.idea.textoBruto}
                        </p>

                        {res.matchedConcepts.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            {res.matchedConcepts.slice(0, 3).map((concept, ci) => (
                              <span
                                key={ci}
                                className="text-[11px] bg-white/5 text-white/70 px-2 py-0.5 rounded-md border border-white/5"
                              >
                                {concept}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Footer Info */}
            <div className="px-5 py-3 bg-white/[0.02] border-t border-white/10 flex items-center justify-between text-[11px] text-white/40">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <strong className="font-mono text-white/60">↑↓</strong> Navegar
                </span>
                <span className="flex items-center gap-1">
                  <strong className="font-mono text-white/60">Enter</strong> Focar
                </span>
                <span className="flex items-center gap-1">
                  <strong className="font-mono text-white/60">Esc</strong> Fechar
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
