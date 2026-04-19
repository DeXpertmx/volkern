import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  variation?: number;
  icon?: React.ReactNode;
  description?: string;
  className?: string;
}

export function MetricCard({ title, value, variation, icon, description, className }: MetricCardProps) {
  const isPositive = variation && variation > 0;
  
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center pt-1">
          {variation !== undefined && (
            <span className={cn(
              "flex items-center text-xs font-medium mr-2",
              isPositive ? "text-emerald-600" : "text-rose-600"
            )}>
              {isPositive ? <ArrowUpIcon className="w-3 h-3 mr-1" /> : <ArrowDownIcon className="w-3 h-3 mr-1" />}
              {Math.abs(variation)}%
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            {description || "vs. periodo anterior"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
