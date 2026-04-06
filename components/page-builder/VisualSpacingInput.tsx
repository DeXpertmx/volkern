"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SpacingProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
}

// Función auxiliar para parsear valores como "10px 20px" a un objeto { top, right, bottom, left }
const parseSpacing = (spacingStr: string) => {
    const defaultSpacing = { top: "0", right: "0", bottom: "0", left: "0" };
    if (!spacingStr) return defaultSpacing;

    const parts = spacingStr.split(" ").filter(p => p.trim());

    // Limpiar "px" para la UI numérica
    const clean = (val: string) => val.replace(/px$/, "");

    if (parts.length === 1) {
        return { top: clean(parts[0]), right: clean(parts[0]), bottom: clean(parts[0]), left: clean(parts[0]) };
    } else if (parts.length === 2) {
        return { top: clean(parts[0]), right: clean(parts[1]), bottom: clean(parts[0]), left: clean(parts[1]) };
    } else if (parts.length === 3) {
        return { top: clean(parts[0]), right: clean(parts[1]), bottom: clean(parts[2]), left: clean(parts[1]) };
    } else if (parts.length >= 4) {
        return { top: clean(parts[0]), right: clean(parts[1]), bottom: clean(parts[2]), left: clean(parts[3]) };
    }
    return defaultSpacing;
};

// Formatea el objeto {top, right, bottom, left} de vuelta al string "top right bottom left"
const formatSpacing = (spacing: { top: string, right: string, bottom: string, left: string }) => {
    const { top, right, bottom, left } = spacing;

    const addPx = (v: string) => (v && !isNaN(Number(v)) ? `${v}px` : v || "0px");

    const t = addPx(top);
    const r = addPx(right);
    const b = addPx(bottom);
    const l = addPx(left);

    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    return `${t} ${r} ${b} ${l}`;
};

export function VisualSpacingInput({ value, onChange, label }: SpacingProps) {
    const [spacing, setSpacing] = useState(parseSpacing(value));
    const [advanced, setAdvanced] = useState(false);

    useEffect(() => {
        setSpacing(parseSpacing(value));
    }, [value]);

    const handleChange = (pos: "top" | "right" | "bottom" | "left", val: string) => {
        const newSpacing = { ...spacing, [pos]: val };

        // Si no está en modo avanzado, sincronizamos todos los lados si se cambia el top
        // o al menos mantenemos el comportamiento simple de string 
        if (!advanced && pos === "top") {
            newSpacing.right = val;
            newSpacing.bottom = val;
            newSpacing.left = val;
        }

        setSpacing(newSpacing);
        onChange(formatSpacing(newSpacing));
    };

    const SpacingInput = ({ pos, val }: { pos: "top" | "right" | "bottom" | "left", val: string }) => (
        <input
            type="text"
            value={val}
            onChange={(e) => handleChange(pos, e.target.value)}
            className="w-12 h-6 text-center text-xs font-mono bg-transparent border-none rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
            placeholder="0"
        />
    );

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label className="text-xs font-medium text-gray-500">{label}</Label>
                <button
                    onClick={() => setAdvanced(!advanced)}
                    className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                >
                    {advanced ? "Simple" : "Independiente"}
                </button>
            </div>

            <div className="relative w-full aspect-[2/1] max-w-[200px] mx-auto bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center select-none overflow-hidden group">

                {/* Top */}
                <div className="absolute top-0 left-0 right-0 flex justify-center py-1 hover:bg-gray-100 transition-colors">
                    <SpacingInput pos="top" val={spacing.top} />
                </div>

                {/* Bottom */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-center py-1 hover:bg-gray-100 transition-colors">
                    <SpacingInput pos="bottom" val={spacing.bottom} />
                </div>

                {/* Left */}
                <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center px-1 hover:bg-gray-100 transition-colors">
                    <SpacingInput pos="left" val={spacing.left} />
                </div>

                {/* Right */}
                <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center px-1 hover:bg-gray-100 transition-colors">
                    <SpacingInput pos="right" val={spacing.right} />
                </div>

                {/* Center Box */}
                <div className="w-16 h-8 bg-white border border-gray-300 rounded shadow-sm flex items-center justify-center z-10">
                    <div className="w-10 h-2 bg-gray-200 rounded-full"></div>
                </div>

                {/* Diagonal borders for visual box model, purely decorative */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" preserveAspectRatio="none">
                    <line x1="0" y1="0" x2="30%" y2="25%" stroke="var(--tw-colors-gray-400, #9ca3af)" strokeWidth="1" />
                    <line x1="100%" y1="0" x2="70%" y2="25%" stroke="var(--tw-colors-gray-400, #9ca3af)" strokeWidth="1" />
                    <line x1="0" y1="100%" x2="30%" y2="75%" stroke="var(--tw-colors-gray-400, #9ca3af)" strokeWidth="1" />
                    <line x1="100%" y1="100%" x2="70%" y2="75%" stroke="var(--tw-colors-gray-400, #9ca3af)" strokeWidth="1" />
                </svg>
            </div>
        </div>
    );
}
