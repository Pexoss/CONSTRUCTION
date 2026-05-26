import React from "react";
import { getFontSizeHint, useTheme } from "../contexts/ThemeContext";

const FontSizeToggle: React.FC = () => {
  const { fontSize, fontSizeLabel, toggleFontSize } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleFontSize}
      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={getFontSizeHint(fontSize)}
      aria-pressed={fontSize !== "normal"}
      title={getFontSizeHint(fontSize)}
    >
      <span
        className="inline-flex items-center justify-center min-w-[1.25rem] text-xs font-bold text-gray-800 dark:text-gray-100"
        aria-hidden="true"
      >
        {fontSizeLabel}
      </span>
    </button>
  );
};

export default FontSizeToggle;
