import { useState, useEffect, useRef, type FormEvent } from "react";
import { Database, Plus, Search, Check, RefreshCw, X, FileSpreadsheet, AlertCircle } from "lucide-react";
import { listSpreadsheets, createIdeaSpreadsheet, ensureBaseSheet, SpreadsheetFile } from "../lib/googleSheets";
import { SpreadsheetConfig } from "../types";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogFocus(isOpen: boolean, onClose?: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      if (initialFocusRef.current) initialFocusRef.current.focus();
      else dialogRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
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
  }, [isOpen, onClose]);

  return { dialogRef, initialFocusRef };
}

interface SpreadsheetSetupProps {
  accessToken: string | null;
  spreadsheet: SpreadsheetConfig | null;
  onSelectSpreadsheet: (config: SpreadsheetConfig) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export default function SpreadsheetSetup({
  accessToken,
  spreadsheet,
  onSelectSpreadsheet,
  onClose,
  isModal = false,
}: SpreadsheetSetupProps) {
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customId, setCustomId] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const { dialogRef, initialFocusRef } = useDialogFocus(isModal, onClose);

  const loadSpreadsheetsList = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const list = await listSpreadsheets(accessToken);
      setSpreadsheets(list);
    } catch (err: any) {
      console.error(err);
      setError("Não foi possível listar as planilhas do Google Drive.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadSpreadsheetsList();
    }
  }, [accessToken]);

  const handleCreateNew = async () => {
    if (!accessToken) return;
    setCreating(true);
    setError("");
    setSuccessMsg("");
    try {
      const sheetId = await createIdeaSpreadsheet(accessToken, "Captura de Ideias");
      
      const config: SpreadsheetConfig = {
        id: sheetId,
        name: "Captura de Ideias",
        sheetName: "Base",
      };

      onSelectSpreadsheet(config);
      setSuccessMsg("Planilha 'Captura de Ideias' criada com sucesso!");
      
      await loadSpreadsheetsList();
      
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao criar nova planilha.");
    } finally {
      setCreating(false);
    }
  };

  const handleSelectExisting = async (file: SpreadsheetFile) => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const activeSheetName = await ensureBaseSheet(accessToken, file.id);
      
      const config: SpreadsheetConfig = {
        id: file.id,
        name: file.name,
        sheetName: activeSheetName,
      };

      onSelectSpreadsheet(config);
      setSuccessMsg(`Planilha '${file.name}' conectada com sucesso!`);
      
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao verificar planilha.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectCustomId = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || !customId.trim()) return;
    
    let extractedId = customId.trim();
    const sheetUrlPattern = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = extractedId.match(sheetUrlPattern);
    if (match && match[1]) {
      extractedId = match[1];
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const activeSheetName = await ensureBaseSheet(accessToken, extractedId);
      
      const getMetaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${extractedId}?fields=properties(title)`;
      const res = await fetch(getMetaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      let name = "Planilha Conectada";
      if (res.ok) {
        const meta = await res.json();
        name = meta.properties?.title || "Planilha Conectada";
      }

      const config: SpreadsheetConfig = {
        id: extractedId,
        name: name,
        sheetName: activeSheetName,
      };

      onSelectSpreadsheet(config);
      setSuccessMsg(`Planilha '${name}' vinculada com sucesso!`);
      setCustomId("");
      
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      setError("Planilha inválida ou sem permissão de acesso. Verifique o ID/Link.");
    } finally {
      setLoading(false);
    }
  };

  const filteredSheets = spreadsheets.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const content = (
    <div id="setup-content" className="text-left font-sans">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#EBAF2D]">
            <Database size={16} />
          </div>
          <div>
            <h2 id="spreadsheet-setup-title" className="text-sm font-semibold tracking-tight text-[var(--color-on-surface)]">
              Conexão com o Google Sheets
            </h2>
            <p className="text-[11px] text-white/50">Base de dados e armazenamento do Grafo</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Fechar configuração de planilha"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3.5 rounded-xl bg-[var(--color-error-container)] border border-[var(--color-error)]/40 text-[var(--color-error)] text-xs flex items-center gap-2.5">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="mb-4 p-3.5 rounded-xl bg-[var(--color-status-success-subtle)] border border-[var(--color-status-success)]/40 text-[var(--color-status-success)] text-xs flex items-center gap-2.5">
          <Check size={15} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Recommended New Spreadsheet */}
      <div className="mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold text-white">Criar Nova Planilha Padrão</h3>
          <p className="text-xs text-white/70 mt-0.5 max-w-sm font-normal">
            Cria <strong>"Captura de Ideias"</strong> no seu Drive pessoal, com a aba <strong>"Base"</strong> pré-formatada. Você será o proprietário.
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          disabled={creating || loading}
          className="btn-consistem-warm w-full sm:w-auto px-5 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {creating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span>Criando...</span>
            </>
          ) : (
            <>
              <Plus size={13} />
              <span>Criar Nova</span>
            </>
          )}
        </button>
      </div>

      {/* Select existing spreadsheet */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-white/70">Planilhas autorizadas no seu Drive</h3>
          <button
            onClick={loadSpreadsheetsList}
            className="text-xs text-white/60 hover:text-white flex items-center gap-1.5 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-3">
          <label htmlFor="spreadsheet-search" className="sr-only">Buscar planilhas no Google Drive</label>
          <Search className="absolute left-3.5 top-3 text-white/30" size={13} />
          <input
            id="spreadsheet-search"
            ref={initialFocusRef}
            type="text"
            placeholder="Buscar planilhas no seu Drive..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
          />
        </div>

        {/* Spreadsheets List */}
        <div className="max-h-44 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5 bg-black/20">
          {loading && spreadsheets.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/50 flex flex-col items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Carregando arquivos...</span>
            </div>
          ) : filteredSheets.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/40">
              Nenhuma planilha encontrada.
            </div>
          ) : (
            filteredSheets.map((file) => {
              const isSelected = spreadsheet?.id === file.id;
              return (
                <button
                  key={file.id}
                  onClick={() => handleSelectExisting(file)}
                  disabled={loading || creating}
                  className="w-full text-left p-3 hover:bg-white/5 flex items-center justify-between transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet size={16} className="text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white/90 truncate group-hover:text-white">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-white/60 font-mono mt-0.5">
                        Modificado em: {new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-full text-[11px] font-semibold flex items-center gap-1">
                      <Check size={10} />
                      <span>Conectada</span>
                    </span>
                  ) : (
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-[#EBAF2D] font-medium">
                      Conectar
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-white/60">
        Por segurança, o Sinapse acessa apenas planilhas criadas ou previamente autorizadas para a aplicação.
      </p>

      {/* Alternative: Link by ID */}
      <form onSubmit={handleConnectCustomId} className="border-t border-white/10 pt-4 mb-6">
        <label htmlFor="spreadsheet-custom-id" className="block text-xs font-semibold text-white/70 mb-2">Vincular ID ou link direto</label>
        <div className="flex gap-2">
          <input
            id="spreadsheet-custom-id"
            type="text"
            placeholder="Cole o link ou ID da planilha do Sheets..."
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            disabled={loading || creating}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={!customId.trim() || loading || creating}
            className="btn-consistem-outline px-5 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Vincular
          </button>
        </div>
      </form>

    </div>
  );

  if (isModal) {
    return (
      <div
        id="setup-modal-backdrop"
        className="fixed inset-0 z-50 bg-[var(--color-backdrop)] backdrop-blur-md flex items-center justify-center p-4"
        onClick={(event) => event.target === event.currentTarget && onClose?.()}
      >
        <div
          ref={dialogRef}
          id="setup-modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="spreadsheet-setup-title"
          tabIndex={-1}
          className="max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto w-full bg-[var(--color-surface)] border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[var(--shadow-lg)] relative"
        >
          <div className="relative z-10">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="setup-card" className="max-w-lg w-full mx-auto bg-[var(--color-surface)]/90 backdrop-blur-md border border-white/15 rounded-3xl p-6 sm:p-8 shadow-[var(--shadow-lg)] relative my-10">
      <div className="relative z-10">
        {content}
      </div>
    </div>
  );
}
