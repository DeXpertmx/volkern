"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface ShadowProps {
    value: string;
    onChange: (value: string) => void;
}

// Extract shadow values from string like "inset 0px 4px 6px -1px rgba(0,0,0,0.1)"
const parseShadow = (shadowStr: string) => {
    const defaultShadow = {
        x: 0,
        y: 4,
        blur: 6,
        spread: -1,
        color: "rgba(0,0,0,0.1)",
        inset: false,
        enabled: true
    };

    if (!shadowStr || shadowStr === "none") return { ...defaultShadow, enabled: false };

    try {
        const isInset = shadowStr.includes("inset");
        let cleanStr = shadowStr.replace("inset", "").trim();

        // Extract color first
        const colorMatch = cleanStr.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]+|[a-zA-Z]+)$/);
        const color = colorMatch ? colorMatch[1] : "rgba(0,0,0,0.1)";

        // Remove color from string
        cleanStr = cleanStr.replace(color, "").trim();

        // Extract numbers
        const parts = cleanStr.split(" ").filter(p => p.trim());

        return {
            x: parseInt(parts[0]) || 0,
            y: parseInt(parts[1]) || 0,
            blur: parseInt(parts[2]) || 0,
            spread: parseInt(parts[3]) || 0,
            color,
            inset: isInset,
            enabled: true
        };
    } catch (e) {
        console.error("Error parsing shadow:", e);
        return defaultShadow;
    }
};

const formatShadow = (s: any) => {
    if (!s.enabled) return "none";
    return `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
};

export function ShadowBuilder({ value, onChange }: ShadowProps) {
    const [shadow, setShadow] = useState(parseShadow(value));

    useEffect(() => {
        setShadow(parseShadow(value));
    }, [value]);

    const updateShadow = (key: string, val: any) => {
        const newShadow = { ...shadow, [key]: val };

        // If we just enabled it and it was none, set some defaults so it's visible
        if (key === "enabled" && val && value === "none") {
            newShadow.y = 4;
            newShadow.blur = 6;
            newShadow.color = "rgba(0,0,0,0.1)";
        }

        setShadow(newShadow);
        onChange(formatShadow(newShadow));
    };

    return (
        <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex justify-between items-center mb-2">
                <Label className="font-semibold text-gray-700">Sombra (Box Shadow)</Label>
                <Switch
                    checked={shadow.enabled}
                    onCheckedChange={(c) => updateShadow("enabled", c)}
                />
            </div>

            {shadow.enabled && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    {/* X & Y Offset */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-gray-500">Eje X: {shadow.x}px</Label>
                            <Slider
                                value={[shadow.x]}
                                min={-50}
                                max={50}
                                step={1}
                                onValueChange={(val) => updateShadow("x", val[0])}
                                className="mt-2"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-gray-500">Eje Y: {shadow.y}px</Label>
                            <Slider
                                value={[shadow.y]}
                                min={-50}
                                max={50}
                                step={1}
                                onValueChange={(val) => updateShadow("y", val[0])}
                                className="mt-2"
                            />
                        </div>
                    </div>

                    {/* Blur & Spread */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-gray-500">Desenfoque: {shadow.blur}px</Label>
                            <Slider
                                value={[shadow.blur]}
                                min={0}
                                max={100}
                                step={1}
                                onValueChange={(val) => updateShadow("blur", val[0])}
                                className="mt-2"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-gray-500">Extensión: {shadow.spread}px</Label>
                            <Slider
                                value={[shadow.spread]}
                                min={-50}
                                max={50}
                                step={1}
                                onValueChange={(val) => updateShadow("spread", val[0])}
                                className="mt-2"
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <div className="flex-1 mr-4">
                            <Label className="text-xs text-gray-500">Color</Label>
                            <div className="flex gap-2 mt-1">
                                <Input
                                    type="text"
                                    value={shadow.color}
                                    onChange={(e) => updateShadow("color", e.target.value)}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 mt-4">
                            <Switch
                                id="inset-mode"
                                checked={shadow.inset}
                                onCheckedChange={(c) => updateShadow("inset", c)}
                            />
                            <Label htmlFor="inset-mode" className="text-xs text-gray-500">Interior (inset)</Label>
                        </div>
                    </div>

                    {/* Small Preview */}
                    <div className="mt-4 p-4 bg-gray-200 rounded flex justify-center items-center">
                        <div
                            className="w-16 h-16 bg-white rounded transition-shadow"
                            style={{ boxShadow: formatShadow(shadow) }}
                        ></div>
                    </div>
                </div>
            )}
        </div>
    );
}
