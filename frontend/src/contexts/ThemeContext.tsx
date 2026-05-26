import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

type Theme = "light" | "dark";
export type FontSize = "normal" | "large" | "xlarge";

const FONT_SIZE_ORDER: FontSize[] = ["normal", "large", "xlarge"];

const FONT_SIZE_LABEL: Record<FontSize, string> = {
  normal: "A",
  large: "A+",
  xlarge: "A++",
};

const FONT_SIZE_HINT: Record<FontSize, string> = {
  normal: "Fonte padrão — clique para aumentar",
  large: "Fonte grande — clique para aumentar mais",
  xlarge: "Fonte extra grande — clique para voltar ao padrão",
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  fontSize: FontSize;
  toggleFontSize: () => void;
  fontSizeLabel: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const FONT_SIZE_STORAGE_KEY = "fontSize";

const parseStoredFontSize = (saved: string | null): FontSize => {
  if (saved === "large" || saved === "xlarge") return saved;
  return "normal";
};

const applyFontSizeClasses = (fontSize: FontSize) => {
  const root = document.documentElement;
  root.classList.remove("font-large", "font-xlarge");
  if (fontSize === "large") root.classList.add("font-large");
  if (fontSize === "xlarge") root.classList.add("font-xlarge");
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("theme") as Theme;
    return savedTheme || "light";
  });

  const [fontSize, setFontSize] = useState<FontSize>(() =>
    parseStoredFontSize(localStorage.getItem(FONT_SIZE_STORAGE_KEY)),
  );

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
    applyFontSizeClasses(fontSize);
  }, [fontSize]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const toggleFontSize = () => {
    setFontSize((prev) => {
      const idx = FONT_SIZE_ORDER.indexOf(prev);
      return FONT_SIZE_ORDER[(idx + 1) % FONT_SIZE_ORDER.length];
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        fontSize,
        toggleFontSize,
        fontSizeLabel: FONT_SIZE_LABEL[fontSize],
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export const getFontSizeHint = (fontSize: FontSize): string =>
  FONT_SIZE_HINT[fontSize];
