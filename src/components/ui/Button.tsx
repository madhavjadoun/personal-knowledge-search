"use client";

import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "glass" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export default function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const baseStyles =
    "relative inline-flex items-center justify-center font-medium rounded-xl overflow-hidden transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none active:scale-98";
  
  const variants = {
    primary:
      "bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 glow-btn-pulse border border-white/10",
    secondary:
      "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 hover:border-zinc-700 shadow-sm",
    glass:
      "glass-panel text-zinc-200 hover:text-white shadow-md border-white/5 hover:border-white/10",
    ghost:
      "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50",
  };

  const sizes = {
    sm: "px-3.5 py-1.5 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-7 py-3.5 text-lg",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {/* Premium background shine overlay for non-primary buttons */}
      {(variant === "glass" || variant === "secondary") && (
        <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent -translate-x-full hover:animate-shimmer pointer-events-none" />
      )}
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
