import React from 'react';
import { Button } from "@/components/ui/button";
import { Linkedin, Youtube, Video, Link2, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialConnectorButtonProps {
  platform: 'LINKEDIN' | 'YOUTUBE' | 'TIKTOK';
  isConnected: boolean;
  isExpired?: boolean;
  profileName?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading?: boolean;
}

export function SocialConnectorButton({ 
  platform, 
  isConnected, 
  isExpired, 
  profileName, 
  onConnect, 
  onDisconnect,
  isLoading 
}: SocialConnectorButtonProps) {
  
  const icons = {
    LINKEDIN: <Linkedin className="w-5 h-5" />,
    YOUTUBE: <Youtube className="w-5 h-5" />,
    TIKTOK: <Video className="w-5 h-5" />,
  };

  const colors = {
    LINKEDIN: "hover:bg-blue-50 text-blue-700 border-blue-200",
    YOUTUBE: "hover:bg-red-50 text-red-700 border-red-200",
    TIKTOK: "hover:bg-zinc-50 text-zinc-900 border-zinc-200",
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-xl border bg-white transition-all shadow-sm",
      isConnected ? "border-emerald-100 bg-emerald-50/10" : "border-slate-100"
    )}>
      <div className="flex items-center space-x-4">
        <div className={cn(
          "p-2.5 rounded-lg",
          isConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
        )}>
          {icons[platform]}
        </div>
        <div>
          <h4 className="text-sm font-bold">{platform}</h4>
          <p className="text-xs text-muted-foreground">
            {isConnected ? (profileName || "Conectado") : "No conectado"}
            {isExpired && <span className="text-rose-600 ml-1 font-semibold">• Token expirado</span>}
          </p>
        </div>
      </div>

      <Button
        variant={isConnected ? "ghost" : "outline"}
        size="sm"
        disabled={isLoading}
        onClick={isConnected ? onDisconnect : onConnect}
        className={cn(
          "ml-4",
          !isConnected && colors[platform]
        )}
      >
        {isLoading ? (
          "Cargando..."
        ) : isConnected ? (
          <><Link2Off className="w-4 h-4 mr-2" /> Desconectar</>
        ) : (
          <><Link2 className="w-4 h-4 mr-2" /> Conectar</>
        )}
      </Button>
    </div>
  );
}
