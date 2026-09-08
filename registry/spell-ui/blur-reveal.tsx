import type { HTMLMotionProps } from "motion/react";
import { motion, useReducedMotion } from "motion/react";

interface BlurRevealProps extends Omit<HTMLMotionProps<"h1">, "children"> {
  children: string;
  delay?: number;
  stagger?: number;
}

export function BlurReveal({
  children,
  className = "",
  delay = 0.2,
  stagger = 0.14,
  ...props
}: BlurRevealProps) {
  const reduceMotion = useReducedMotion();
  const words = children.trim().split(/\s+/);

  return (
    <motion.h1
      className={className}
      aria-label={children}
      initial="hidden"
      animate="visible"
      {...props}
    >
      <span aria-hidden="true">
        {words.map((word, index) => (
          <motion.span
            key={`${word}-${index}`}
            className="inline-block will-change-[filter,opacity,transform]"
            variants={{
              hidden: reduceMotion
                ? { opacity: 1 }
                : { opacity: 0, filter: "blur(12px)", y: 12 },
              visible: reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, filter: "blur(0px)", y: 0 },
            }}
            transition={{
              duration: reduceMotion ? 0 : 0.9,
              delay: reduceMotion ? 0 : delay + index * stagger,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
            {index < words.length - 1 ? "\u00a0" : ""}
          </motion.span>
        ))}
      </span>
    </motion.h1>
  );
}
