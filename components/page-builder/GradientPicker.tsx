"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface GradientProps {
    value: string;
    onChange: (value: string) => void;
}

const parseGradient = (gradientStr: string) => {
    const defaultGradient = {
        color1: "#667eea",
        color2: "#764ba2",
        angle: 135,
        enabled: false
    };

    if (!gradientStr || gradientStr.includes("url") || !gradientStr.includes("linear-gradient"))
        return defaultGradient;

    try {
        const match = gradientStr.match(/linear-gradient\((\d+)deg,\s*(#[A-Fa-f0-9]+|rgba?\([^)]+\))\s*\d*%?,\s*(#[A-Fa-f0-9]+|rgba?\([^)]+\))/);
        if (match) {
            return {
                angle: parseInt(match[1]),
                color1: match[2],
                color2: match[3],
                enabled: true
            };
        }
    } catch (e) {
        console.error("Error parsing gradient:", e);
    }

    return defaultGradient;
};

const formatGradient = (g: any) => {
    if (!g.enabled) return "";
    return `linear-gradient(${g.angle}deg, ${g.color1} 0%, ${g.color2} 100%)`;
};

export function GradientPicker({ value, onChange }: GradientProps) {
    const [gradient, setGradient] = useState(parseGradient(value));

    useEffect(() => {
        // Only update if external value is actually a gradient or empty
        if (!value || value.includes("linear-gradient")) {
            setGradient(parseGradient(value));
        }
    }, [value]);

    const updateGradient = (key: string, val: any) => {
        const newGradient = { ...gradient, [key]: val };

        // If just enabled, ensure it has some valid formatting
        if (key === "enabled") {
            if (val) {
                onChange(formatGradient(newGradient));
            } else {
                onChange(""); // When disabled, clear the value so solid color can take over
            }
        } else if (newGradient.enabled) {
            onChange(formatGradient(newGradient));
        }

        setGradient(newGradient);
    };

    return (
        <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex justify-between items-center mb-2">
                <Label className="font-semibold text-gray-700">Fondo Degradado (Gradient)</Label>
                <Switch
                    checked={gradient.enabled}
                    onCheckedChange={(c) => updateGradient("enabled", c)}
                />
            </div>

            {gradient.enabled && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <Label className="text-xs text-gray-500">Color 1</Label>
                            <div className="flex gap-2 mt-1">
                                <Input
                                    type="color"
                                    value={gradient.color1}
                                    onChange={(e) => updateGradient("color1", e.target.value)}
                                    className="h-8 w-12 p-1"
                                />
                                <Input
                                    type="text"
                                    value={gradient.color1}
                                    onChange={(e) => updateGradient("color1", e.target.value)}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>

                        <div className="flex-1">
                            <Label className="text-xs text-gray-500">Color 2</Label>
                            <div className="flex gap-2 mt-1">
                                <Input
                                    type="color"
                                    value={gradient.color2}
                                    onChange={(e) => updateGradient("color2", e.target.value)}
                                    className="h-8 w-12 p-1"
                                />
                                <Input
                                    type="text"
                                    value={gradient.color2}
                                    onChange={(e) => updateGradient("color2", e.target.value)}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs text-gray-500 flex justify-between">
                            <span>Ángulo</span>
                            <span>{gradient.angle}°</span>
                        </Label>
                        <Slider
                            value={[gradient.angle]}
                            min={0}
                            max={360}
                            step={1}
                            onValueChange={(val) => updateGradient("angle", val[0])}
                            className="mt-2"
                        />
                    </div>

                    {/* Preview */}
                    <div className="mt-4 p-1 border border-gray-200 bg-white rounded flex justify-center items-center">
                        <div
                            className="w-full h-16 rounded transition-all"
                            style={{ background: formatGradient(gradient) }}
                        ></div>
                    </div>
                </div>
            )}
        </div>
    );
}
