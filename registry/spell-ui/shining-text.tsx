import { motion, useReducedMotion } from "motion/react";

interface ShiningTextProps {
  text: string;
  className?: string;
}

export function ShiningText({ text, className = "" }: ShiningTextProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      className={`bg-[linear-gradient(110deg,#777980,35%,#ffffff,50%,#777980,75%,#777980)] bg-[length:200%_100%] bg-clip-text text-transparent ${className}`}
      initial={{ backgroundPosition: reduceMotion ? "0% 0" : "200% 0" }}
      animate={{ backgroundPosition: reduceMotion ? "0% 0" : "-200% 0" }}
      transition={{ repeat: reduceMotion ? 0 : Infinity, duration: 2.4, ease: "linear" }}
    >
      {text}
    </motion.span>
  );
}
