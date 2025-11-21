import React, { createContext, useContext, useEffect, useState } from "react";

interface TerminalContextType {
    isTerminalVisible: boolean;
    showTerminal: () => void;
    hideTerminal: () => void;
    toggleTerminal: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);

    // Notify main process when terminal visibility changes
    useEffect(() => {
        if (typeof window !== "undefined" && window.api) {
            window.api.send("terminal-visibility-changed", isTerminalVisible);
        }
    }, [isTerminalVisible]);

    const showTerminal = () => {
        setIsTerminalVisible(true);
    };
    const hideTerminal = () => {
        setIsTerminalVisible(false);
    };
    const toggleTerminal = () => setIsTerminalVisible((prev) => !prev);

    return <TerminalContext.Provider value={{ isTerminalVisible, showTerminal, hideTerminal, toggleTerminal }}>{children}</TerminalContext.Provider>;
};

export const useTerminal = () => {
    const context = useContext(TerminalContext);
    if (!context) {
        throw new Error("useTerminal must be used within a TerminalProvider");
    }
    return context;
};
