"use client";

import React, { useState, useEffect } from "react";
import LogoSVG from "./LogoSVG";

// SPA persistence: tracks whether the animation has played since the last hard page refresh
let globalNavbarAnimationPlayed = false;

export default function NavbarLogo() {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (!globalNavbarAnimationPlayed) {
      globalNavbarAnimationPlayed = true;
      setShouldAnimate(true);
    }
  }, []);

  return (
    <div 
      className="relative select-none pointer-events-none flex items-center justify-start"
      style={{ height: '40px', width: 'auto' }}
    >
      <LogoSVG
        type="full"
        animate={shouldAnimate}
        className="h-10 w-auto object-contain dark:invert dark:hue-rotate-180"
      />
    </div>
  );
}
