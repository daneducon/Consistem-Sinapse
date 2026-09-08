import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  CornerDownLeft,
  Check,
  AlertCircle,
  Database,
  ArrowRight,
  X,
  Link2,
  Youtube,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ShiningText } from "@/registry/spell-ui/shining-text";
import { IdeaSaveError, type Idea, type IdeaSaveStage, type SpreadsheetConfig, type IdeaRow } from "../types";
import { detectUrl } from "../lib/urlReader";
import { formatIdeaReference } from "../lib/ideaReference";
import { SessionExpiredError } from "../lib/errors";

interface IdeaCaptureProps {
  spreadsheet: SpreadsheetConfig | null;
  ideas: Idea[];
  onSaveIdea: (
    text: string,
    onQuestionGenerated?: (question: string) => void,
    onProgress?: (stage: IdeaSaveStage) => void
  ) => Promise<IdeaRow>;
  onOpenConfig: () => void;
  onSessionExpired: () => void;
}

const MAX_IDEA_LENGTH = 10_000;

// 1. Estímulos Iniciais Naturais (Quebra-Gelo e Captura de Links)
const REFLECTIVE_PROMPTS: string[] = [
  // Foco em Aprendizado e Links
  "O que você descobriu de novo hoje? (digite sua ideia ou cole um link)",
  "Cole um link de artigo/vídeo para sintetizar ou anote uma ideia...",
  "Qual foi o maior aprendizado da semana?",
  "Que conceito ou técnica você absorveu recentemente?",
  "Que conversa recente mudou sua perspectiva?",

  // Foco em Estratégia
  "Qual problema estamos ignorando?",
  "Que ideia pode mudar nosso jogo hoje?",
  "Qual decisão difícil precisa ser tomada em breve?",
  "O que faríamos diferente se começássemos hoje do zero?",
  "Que gargalo operacional precisa de uma solução inovadora?",

  // Foco em Observação & Curadoria
  "O que chamou sua atenção no mercado recentemente?",
  "Qual padrão você notou hoje?",
  "Que atrito frequente dos clientes merece ser eliminado?",
  "Que conteúdo ou referência externa merece estar no seu grafo hoje?",
];

export default function IdeaCapture({
  spreadsheet,
  ideas,
  onSaveIdea,
  onOpenConfig,
  onSessionExpired,
}: IdeaCaptureProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState<{ id: number; title: string } | null>(null);
  const [saveStage, setSaveStage] = useState<IdeaSaveStage>("analyzing");

  const detectedUrl = detectUrl(text);

  // Placeholder dinâmico (sem rótulos ou menções a IA)
  const [currentPlaceholder, setCurrentPlaceholder] = useState<string>(() => {
    const randomIndex = Math.floor(Math.random() * REFLECTIVE_PROMPTS.length);
    return REFLECTIVE_PROMPTS[randomIndex];
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-foco permanente na caixa de texto
  useEffect(() => {
    textareaRef.current?.focus();
  }, [status]);

  // Toast efêmero desaparece após 3.5s
  useEffect(() => {
    if (toastMessage) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 3500);
    }
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [toastMessage]);

  const getRandomPrompt = useCallback((): string => {
    const available = REFLECTIVE_PROMPTS.filter((p) => p !== currentPlaceholder);
    return available[Math.floor(Math.random() * available.length)] || REFLECTIVE_PROMPTS[0];
  }, [currentPlaceholder]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (status === "saving") return;
    if (!spreadsheet) {
      setStatus("error");
      setErrorMessage("Por favor, inicialize a sua conexão para registrar ideias.");
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText) return;
    if (trimmedText.length > MAX_IDEA_LENGTH) {
      setStatus("error");
      setErrorMessage(`A ideia deve ter no máximo ${MAX_IDEA_LENGTH.toLocaleString("pt-BR")} caracteres.`);
      return;
    }

    const detected = detectUrl(trimmedText);
    setSaveStage(detected ? "reading" : "analyzing");

    setStatus("saving");
    setErrorMessage("");

    // Fallback rápido: se demorar mais de 2s para vir a pergunta contextual, atualiza para outro estímulo
    const fallbackTimer = setTimeout(() => {
      setCurrentPlaceholder(getRandomPrompt());
    }, 2000);

    try {
      // Callback acionado na PRIMEIRA ETAPA do processamento (assim que a próxima pergunta é elaborada)
      const handleQuestionReady = (nextQuestion: string) => {
        clearTimeout(fallbackTimer);
        let formatted = nextQuestion.trim().replace(/^["']|["']$/g, "");
        if (formatted) {
          setCurrentPlaceholder(formatted);
        }
      };

      const result = await onSaveIdea(trimmedText, handleQuestionReady, setSaveStage);
      clearTimeout(fallbackTimer);

      const entryId = result.idNota || Date.now();
      const firstWords = trimmedText.split(/\s+/).slice(0, 4).join(" ");
      setText("");
      setStatus("idle");

      // Feedback discreto no topo
      setToastMessage({
        id: entryId,
        title: result.temaMacro || firstWords,
      });

      // Devolve o foco sem interrupções
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 30);
    } catch (err: any) {
      clearTimeout(fallbackTimer);
      console.error(err);
      if (err instanceof SessionExpiredError || (err instanceof IdeaSaveError && err.sessionExpired)) {
        onSessionExpired();
      }
      if (err instanceof IdeaSaveError && err.persisted) setText("");
      setStatus("error");
      setErrorMessage(
        err.message || "Erro ao salvar. Verifique sua conexão e tente novamente."
      );
    }
  };

  const stageMessages: Record<IdeaSaveStage, string> = {
    reading: "Lendo e sintetizando o conteúdo do link...",
    analyzing: "Analisando e organizando sua ideia...",
    saving: "Reservando o próximo registro no Sheets...",
    connecting: "Criando conexões com ideias relacionadas...",
    syncing: "Confirmando a sincronização do histórico...",
  };
  const recentIdeas = [...ideas].sort((a, b) => b.rowNumber - a.rowNumber).slice(0, 5);

  return (
    <div
      id="capture-container"
      className="max-w-3xl w-full mx-auto flex flex-col justify-between min-h-[75vh] py-6 sm:py-8 relative"
    >
      {/* Toast Notification Flutuante e Efêmero */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            role="status"
            aria-live="polite"
            className="fixed top-24 right-4 sm:right-8 z-50 flex items-center gap-3 bg-[#18191C]/95 backdrop-blur-xl border border-emerald-500/30 text-white px-4 py-3 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Check size={14} />
            </div>
            <div className="text-xs">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <span>Ideia salva · {formatIdeaReference(toastMessage.id)}</span>
              </p>
              <p className="text-white/60 text-[11px] truncate max-w-[200px]">
                {toastMessage.title}
              </p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              aria-label="Fechar confirmação"
              className="text-white/40 hover:text-white transition-colors ml-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cabeçalho Editorial Elegante */}
      <div className="text-center mb-8 sm:mb-10">
        <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white font-sans mb-2">
          Confiança em cada ideia.
        </h2>
        <p className="text-sm sm:text-base text-white/70 max-w-xl mx-auto font-normal">
          Capture pensamentos, aprendizados e ideias estratégicas em um fluxo contínuo.
        </p>
      </div>

      {/* Aviso de Planilha Desconectada */}
      <AnimatePresence mode="wait">
        {!spreadsheet && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-5 rounded-2xl bg-[#1C1D21] border border-[#EBAF2D]/30 text-white flex items-start gap-3.5"
          >
            <div className="w-8 h-8 rounded-full bg-[#EBAF2D]/10 flex items-center justify-center text-[#EBAF2D] shrink-0 mt-0.5">
              <Database size={16} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm text-white mb-1">
                Conecte seu espaço de trabalho
              </p>
              <p className="text-xs text-white/60 mb-3 leading-relaxed">
                Para registrar seus insights e habilitar o grafo de conhecimento em tempo real, inicialize a sincronização com sua conta corporativa.
              </p>
              <button
                onClick={onOpenConfig}
                className="btn-consistem-warm px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <span>Inicializar Conexão</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Principal de Captura Ultra Limpo */}
      <div className="flex-1 flex flex-col justify-center">
        <div
          id="capture-box"
          className="relative overflow-hidden bg-[linear-gradient(145deg,rgba(30,31,35,0.96),rgba(20,21,24,0.96))] backdrop-blur-md border border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_18px_55px_rgba(0,0,0,0.34)] transition-all duration-300 focus-within:border-[#EBAF2D]/25 focus-within:shadow-[0_20px_65px_rgba(0,0,0,0.42)]"
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#EBAF2D]/45 to-transparent" />
          <div className="relative">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Registre o que merece continuar vivo</p>
                  <p className="mt-0.5 text-xs text-white/55">Escreva livremente ou cole um link de referência.</p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                <ShieldCheck size={11} />
                Sincronizado ao Sheets
              </span>
            </div>

            {/* Caixa de Texto com Placeholder Reflexivo (sem badges ou botões de carregamento) */}
            <label htmlFor="idea-input-field" className="sr-only">
              Ideia, anotação ou link para registrar
            </label>
            <textarea
              id="idea-input-field"
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (status === "error") {
                  setStatus("idle");
                  setErrorMessage("");
                }
              }}
              onKeyDown={handleKeyDown}
              disabled={status === "saving"}
              maxLength={MAX_IDEA_LENGTH}
              aria-describedby="idea-character-count idea-save-status"
              aria-invalid={status === "error"}
              placeholder={currentPlaceholder}
              className="w-full bg-transparent border-0 outline-none text-white placeholder-white/35 text-xl sm:text-2xl font-normal tracking-tight resize-none min-h-[150px] sm:min-h-[180px] focus:ring-0 leading-relaxed text-left font-sans transition-opacity duration-300 disabled:opacity-70"
            />

            {/* Badge de Detecção de Link em Tempo Real */}
            <AnimatePresence>
              {detectedUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 6, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-3"
                >
                  <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#EBAF2D]/10 border border-[#EBAF2D]/25 text-xs text-[#EBAF2D]">
                    {detectedUrl.type === "youtube" ? (
                      <Youtube size={15} className="shrink-0 text-red-400" />
                    ) : (
                      <Link2 size={15} className="shrink-0 text-[#EBAF2D]" />
                    )}
                    <div className="flex-1 truncate">
                      <span className="font-medium text-white/90">
                        {detectedUrl.type === "youtube"
                          ? "Vídeo do YouTube detectado"
                          : detectedUrl.type === "article"
                            ? "Artigo / Blog detectado"
                            : "Link da Web detectado"}
                        :
                      </span>{" "}
                      <span className="text-white/60 font-mono text-[11px]">{detectedUrl.domain}</span>
                      <span className="text-white/40 ml-1.5 hidden sm:inline">
                        · O link será processado por serviços externos de leitura e IA
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 text-xs leading-relaxed">
              <p className="text-white/45">
                Links podem ser processados por serviços externos de leitura e transcrição.
              </p>
            </div>

            {/* Barra Inferior de Controles */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-5 border-t border-white/10">
              {/* Status / Atalho */}
              <div id="idea-save-status" className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="wait">
                  {status === "saving" && (
                    <motion.div
                      key="saving-status"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-xs font-medium text-white/70"
                    >
                      <ShiningText
                        text={stageMessages[saveStage]}
                        className="font-medium"
                      />
                    </motion.div>
                  )}

                  {status === "error" && (
                    <motion.div
                      key="error-status"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#DF5241] max-w-sm"
                      role="alert"
                      title={errorMessage}
                    >
                      <AlertCircle size={14} className="shrink-0" />
                      <span className="leading-relaxed">{errorMessage}</span>
                    </motion.div>
                  )}

                  {status === "idle" && (
                    <motion.div
                      key="idle-status"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hidden sm:flex items-center gap-1.5 text-xs text-white/40"
                    >
                      <CornerDownLeft size={12} />
                      <span>
                        Use <strong className="text-white/70 font-medium">Ctrl + Enter</strong> para registrar sem interromper o fluxo
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Botão de Ação & Contador */}
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                <span id="idea-character-count" className="text-xs font-mono text-white/40">
                  {text.length}/1.000 caracteres
                </span>

                <button
                  id="save-idea-btn"
                  onClick={handleSubmit}
                  disabled={!text.trim() || status === "saving" || !spreadsheet}
                  aria-label={status === "saving" ? "Salvando ideia" : "Salvar ideia"}
                  className={`px-6 py-2.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-200 flex items-center gap-2 ${!text.trim() || status === "saving" || !spreadsheet
                    ? "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
                    : "btn-consistem-warm"
                    }`}
                >
                  {status === "saving" ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <ShiningText text="Registrando..." className="font-semibold" />
                    </>
                  ) : (
                    <>
                      <span>Salvar</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Micro-Log Discreto (Recibo de Linha Única) */}
        {recentIdeas.length > 0 && (
          <div id="micro-log-receipts" className="mt-5 space-y-1.5 max-w-2xl mx-auto w-full">
            <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/40">
              Últimos registros no Sheets
            </p>
            <AnimatePresence>
              {recentIdeas.map((entry, index) => (
                <motion.div
                  key={entry.idNota}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, delay: index * 0.03 }}
                  className="flex items-center justify-between py-1.5 px-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/60 hover:text-white/80 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Check size={12} className="text-emerald-400 shrink-0" />
                    <span className="font-mono text-[11px] text-white/55">
                      {formatIdeaReference(entry.idNota)}
                    </span>
                    <span className="text-white/30">·</span>
                    <span className="text-white/80 font-medium truncate font-sans">
                      {entry.temaMacro || "Sem tema"}
                    </span>
                    <span className="hidden sm:inline text-white/35 truncate">
                      · {entry.textoBruto.split(/\s+/).slice(0, 5).join(" ")}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-white/40 shrink-0 ml-3">
                    {entry.dataCriacao.match(/\d{2}:\d{2}/)?.[0] || entry.dataCriacao}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
