"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
}

export default function BlurText({
  text,
  delay = 150,
  className = "",
}: BlurTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  // Trigger when 20% of the element is visible in the viewport
  const isInView = useInView(containerRef, { once: false, amount: 0.2 });

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <span
      ref={containerRef}
      className={`inline-flex flex-wrap ${className}`}
    >
      {words.map((word, index) => (
        <motion.span
          key={index}
          initial={{ filter: "blur(5px)", opacity: 0, y: -20 }}
          animate={
            isInView
              ? {
                  filter: ["blur(5px)", "blur(2px)", "blur(0px)"],
                  opacity: [0, 0.6, 1],
                  y: [-20, 3, 0],
                }
              : {
                  filter: "blur(5px)",
                  opacity: 0,
                  y: -20,
                }
          }
          transition={{
            duration: 0.85,
            delay: (index * delay) / 1000,
            times: [0, 0.5, 1],
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ display: "inline-block", marginRight: "0.25em" }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}
