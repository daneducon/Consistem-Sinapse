import { Lock, Loader2, Sparkles, Network, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { BlurReveal } from "@/registry/spell-ui/blur-reveal";
import ConsistemLogo from "./ConsistemLogo";

interface LoginScreenProps {
  onLogin: () => void;
  signingIn: boolean;
}

export default function LoginScreen({ onLogin, signingIn }: LoginScreenProps) {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[var(--color-background)] text-[var(--color-on-surface)] font-sans selection:bg-[var(--color-secondary)]/30 selection:text-white">
      {/* Coluna Esquerda: Apresentação Institucional Consistem Sinapse (Dark Theme) */}
      <section className="min-w-0 lg:w-[56%] flex flex-col justify-between p-8 sm:p-12 lg:p-16 xl:p-20 relative overflow-hidden bg-[var(--color-surface)] border-b lg:border-b-0 lg:border-r border-[var(--color-surface-bright)]">
        {/* Topo: Logo Consistem com badge Sinapse */}
        <header className="relative z-10">
          <ConsistemLogo variant="white" badge="Sinapse" size="lg" />
        </header>

        {/* Centro: Mensagem Central do Consistem Sinapse */}
        <div className="my-12 lg:my-auto w-full max-w-[620px] relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {/* Eyebrow / Label Coral Técnico Consistem */}
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#DF5241]" />
              <p
                className="text-xs sm:text-[13px] font-semibold tracking-[0.14em] uppercase text-[var(--color-secondary)]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                GESTÃO DO CONHECIMENTO MAIS INTELIGENTE
              </p>
            </div>

            {/* Headline institucional Consistem Sinapse */}
            <BlurReveal
              className="text-3xl sm:text-4xl lg:text-[44px] font-semibold text-white tracking-[-0.02em] leading-[1.12] mb-6"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Conhecimento vivo, da captura à inteligência aplicada.
            </BlurReveal>

            {/* Texto de Apoio / Subtítulo */}
            <p className="text-sm sm:text-base text-[var(--color-on-surface-muted)] leading-[1.6] max-w-[560px] font-normal mb-8">
              Centralize insights, estruture macrotemas e conecte ideias em um grafo sináptico
              interativo, com inteligência semântica e visualização em tempo real.
            </p>

            {/* Pílulas de Contexto da Aplicação */}
            <div className="flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs text-zinc-300 font-medium">
                <Network size={13} className="text-[#EBAF2D]" />
                Grafo Interativo
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs text-zinc-300 font-medium">
                <Sparkles size={13} className="text-[#DF5241]" />
                Síntese com IA
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs text-zinc-300 font-medium">
                <ShieldCheck size={13} className="text-[#2E9E66]" />
                Sincronização Contínua
              </span>
            </div>
          </motion.div>
        </div>

        {/* Rodapé da Coluna Esquerda: Badge de Status de Conexão Segura */}
        <footer className="relative z-10 pt-4">
          <div className="inline-flex items-center gap-2.5 text-xs sm:text-[13px] text-[#A2A3A8] font-normal">
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2E9E66] opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2E9E66]"></span>
            </span>
            <span>Acesso corporativo seguro com autenticação OAuth 2.0</span>
          </div>
        </footer>

        {/* Marca d'água geométrica com arcos concêntricos em tom dark */}
        <div
          className="absolute -bottom-24 -right-24 w-[560px] h-[560px] pointer-events-none select-none opacity-25 hidden sm:block"
          aria-hidden="true"
        >
          <svg viewBox="0 0 560 560" className="w-full h-full">
            <circle cx="560" cy="560" r="140" fill="none" stroke="#3A3B40" strokeWidth="1.4" />
            <circle cx="560" cy="560" r="230" fill="none" stroke="#3A3B40" strokeWidth="1.4" />
            <circle cx="560" cy="560" r="320" fill="none" stroke="#3A3B40" strokeWidth="1.4" />
            <circle cx="560" cy="560" r="410" fill="none" stroke="#3A3B40" strokeWidth="1.4" />
            <circle cx="560" cy="560" r="500" fill="none" stroke="#3A3B40" strokeWidth="1.4" />
          </svg>
        </div>
      </section>

      {/* Coluna Direita: Painel Grafite com Card Flutuante Dark de Login */}
      <section className="min-w-0 lg:w-[44%] flex items-center justify-center p-6 sm:p-10 lg:p-14 xl:p-20 bg-[var(--color-surface-dim)] relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-[440px] bg-[var(--color-surface-card)] border border-white/10 rounded-[28px] p-8 sm:p-10 shadow-[var(--shadow-xl)] relative"
        >
          {/* Subtítulo / Tag de Identificação do Sinapse */}
          <p
            className="text-[11px] sm:text-xs font-semibold tracking-[0.06em] text-[var(--color-secondary)] mb-1.5"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Consistem Sinapse
          </p>

          {/* Título do Card */}
          <h2
            className="text-2xl sm:text-[26px] font-semibold text-white tracking-[-0.02em] leading-tight mb-2"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Acesso institucional
          </h2>

          {/* Descrição orientativa */}
          <p className="text-xs sm:text-[13.5px] text-[#A2A3A8] leading-[1.5] mb-7 font-normal">
            Entre com sua conta Google corporativa autorizada pela Consistem.
          </p>

          {/* Botão de Ação Primária: Continuar com o Google (Fundo Branco no Card Dark para máximo destaque) */}
          <button
            id="btn-google-login"
            onClick={onLogin}
            disabled={signingIn}
            aria-busy={signingIn}
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-[#F2F3F5] active:bg-[#E5E6E8] transition-all duration-150 flex items-center justify-center gap-3 text-sm font-medium text-[#191C1D] shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer group"
          >
            {signingIn ? (
              <>
                <Loader2 size={18} className="animate-spin text-[#191C1D]" />
                <span>Autenticando sessão...</span>
              </>
            ) : (
              <>
                {/* Ícone oficial multicolorido do Google */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.9c2.27-2.1 3.645-5.2 3.645-9.15z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.73-2.1-6.67-4.92H1.28v3.13C3.31 21.36 7.37 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.33 14.28c-.24-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28V6.59H1.28C.46 8.21 0 10.05 0 12s.46 3.79 1.28 5.41l4.05-3.13z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.31 2.64 1.28 6.59l4.05 3.13c.94-2.82 3.57-4.97 6.67-4.97z"
                  />
                </svg>
                <span className="font-semibold text-[#191C1D]">
                  Continuar com o Google
                </span>
              </>
            )}
          </button>

          {/* Divisor & Nota de Segurança Operacional */}
          <div className="border-t border-white/10 mt-7 pt-4 flex items-start gap-2 text-xs text-[var(--color-on-surface-muted)] leading-normal">
            <Lock size={13} className="shrink-0 text-[var(--color-on-surface-muted)] mt-0.5" />
            <span>
              O acesso é validado pela conta Google institucional da Consistem e protegido por sessão segura.
            </span>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
