import type { Variants } from "motion/react";

export function createStaggerContainerVariants(reducedMotion: boolean): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: reducedMotion
        ? { duration: 0 }
        : { delayChildren: 0.08, staggerChildren: 0.08 },
    },
  };
}

export function createStaggerItemVariants(reducedMotion: boolean): Variants {
  return {
    hidden: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reducedMotion
        ? { duration: 0 }
        : { type: "spring", stiffness: 320, damping: 28 },
    },
  };
}
