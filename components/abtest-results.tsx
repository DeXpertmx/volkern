
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ABTestResultsProps {
  campanaId: string;
}

interface ResultadoAB {
  // Variante A
  varianteA_enviados: number;
  varianteA_abiertos: number;
  varianteA_clics: number;
  varianteA_conversiones: number;
  varianteA_tasaApertura: number;
  varianteA_tasaClic: number;
  varianteA_tasaConversion: number;

  // Variante B
  varianteB_enviados: number;
  varianteB_abiertos: number;
  varianteB_clics: number;
  varianteB_conversiones: number;
  varianteB_tasaApertura: number;
  varianteB_tasaClic: number;
  varianteB_tasaConversion: number;

  // Análisis
  significanciaEstadistica: boolean;
  nivelConfianza: number;
  ganador: string | null;
  mejoraPorcentaje: number | null;
  recomendacion: string | null;
}

export function ABTestResults({ campanaId }: ABTestResultsProps) {
  const [loading, setLoading] = useState(true);
  const [resultado, setResultado] = useState<ResultadoAB | null>(null);
  const [declarandoGanador, setDeclarandoGanador] = useState(false);

  useEffect(() => {
    cargarResultados();
  }, [campanaId]);

  const cargarResultados = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/email-campanas/${campanaId}/ab-results`);
      if (res.ok) {
        const data = await res.json();
        setResultado(data);
      } else {
        toast.error("Error al cargar resultados de A/B Testing");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al cargar resultados");
    } finally {
      setLoading(false);
    }
  };

  const declararGanador = async (ganador: "A" | "B") => {
    try {
      setDeclarandoGanador(true);
      const res = await fetch(`/api/email-campanas/${campanaId}/ab-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ganador }),
      });

      if (res.ok) {
        toast.success(`Variante ${ganador} declarada como ganadora`);
        cargarResultados();
      } else {
        toast.error("Error al declarar ganador");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al declarar ganador");
    } finally {
      setDeclarandoGanador(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resultados de A/B Testing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Cargando resultados...</p>
        </CardContent>
      </Card>
    );
  }

  if (!resultado) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resultados de A/B Testing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No hay datos disponibles</p>
        </CardContent>
      </Card>
    );
  }

  const metricaPrincipal =
    resultado.varianteA_conversiones > 0 || resultado.varianteB_conversiones > 0
      ? "conversión"
      : "apertura";

  const tasaA =
    metricaPrincipal === "conversión"
      ? resultado.varianteA_tasaConversion
      : resultado.varianteA_tasaApertura;
  const tasaB =
    metricaPrincipal === "conversión"
      ? resultado.varianteB_tasaConversion
      : resultado.varianteB_tasaApertura;

  return (
    <div className="space-y-6">
      {/* Resumen del ganador */}
      {resultado.significanciaEstadistica && resultado.ganador && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Resultados Estadísticamente Significativos
                </CardTitle>
                <CardDescription>
                  Nivel de confianza: {resultado.nivelConfianza}%
                </CardDescription>
              </div>
              {resultado.ganador !== "empate" && (
                <Badge variant="default" className="text-lg px-4 py-2">
                  Ganador: Variante {resultado.ganador}
                </Badge>
              )}
            </div>
          </CardHeader>
          {resultado.recomendacion && (
            <CardContent>
              <p className="text-sm">{resultado.recomendacion}</p>
            </CardContent>
          )}
        </Card>
      )}

      {!resultado.significanciaEstadistica && (
        <Card className="border-yellow-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <CardTitle>Datos Insuficientes</CardTitle>
            </div>
            <CardDescription>{resultado.recomendacion}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Comparación lado a lado */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Variante A */}
        <Card className={resultado.ganador === "A" ? "border-green-500 shadow-lg" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Variante A</span>
              {resultado.ganador === "A" && tasaA > tasaB && (
                <TrendingUp className="h-5 w-5 text-green-600" />
              )}
            </CardTitle>
            <CardDescription>
              {resultado.varianteA_enviados} emails enviados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tasa de apertura */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Tasa de Apertura</span>
                <span className="font-medium">
                  {resultado.varianteA_tasaApertura.toFixed(2)}%
                </span>
              </div>
              <Progress value={resultado.varianteA_tasaApertura} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {resultado.varianteA_abiertos} abiertos
              </p>
            </div>

            {/* Tasa de clic */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Tasa de Clic</span>
                <span className="font-medium">
                  {resultado.varianteA_tasaClic.toFixed(2)}%
                </span>
              </div>
              <Progress value={resultado.varianteA_tasaClic} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {resultado.varianteA_clics} clics
              </p>
            </div>

            {/* Tasa de conversión */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Tasa de Conversión</span>
                <span className="font-medium">
                  {resultado.varianteA_tasaConversion.toFixed(2)}%
                </span>
              </div>
              <Progress value={resultado.varianteA_tasaConversion} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {resultado.varianteA_conversiones} conversiones
              </p>
            </div>

            {resultado.significanciaEstadistica && resultado.ganador !== "A" && (
              <Button
                onClick={() => declararGanador("A")}
                disabled={declarandoGanador}
                variant="outline"
                className="w-full"
              >
                Declarar como Ganador
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Variante B */}
        <Card className={resultado.ganador === "B" ? "border-green-500 shadow-lg" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Variante B</span>
              {resultado.ganador === "B" && tasaB > tasaA && (
                <TrendingUp className="h-5 w-5 text-green-600" />
              )}
            </CardTitle>
            <CardDescription>
              {resultado.varianteB_enviados} emails enviados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tasa de apertura */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Tasa de Apertura</span>
                <span className="font-medium">
                  {resultado.varianteB_tasaApertura.toFixed(2)}%
                </span>
              </div>
              <Progress value={resultado.varianteB_tasaApertura} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {resultado.varianteB_abiertos} abiertos
              </p>
            </div>

            {/* Tasa de clic */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Tasa de Clic</span>
                <span className="font-medium">
                  {resultado.varianteB_tasaClic.toFixed(2)}%
                </span>
              </div>
              <Progress value={resultado.varianteB_tasaClic} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {resultado.varianteB_clics} clics
              </p>
            </div>

            {/* Tasa de conversión */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Tasa de Conversión</span>
                <span className="font-medium">
                  {resultado.varianteB_tasaConversion.toFixed(2)}%
                </span>
              </div>
              <Progress value={resultado.varianteB_tasaConversion} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {resultado.varianteB_conversiones} conversiones
              </p>
            </div>

            {resultado.significanciaEstadistica && resultado.ganador !== "B" && (
              <Button
                onClick={() => declararGanador("B")}
                disabled={declarandoGanador}
                variant="outline"
                className="w-full"
              >
                Declarar como Ganador
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mejora porcentual */}
      {resultado.mejoraPorcentaje && resultado.mejoraPorcentaje > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mejora del Ganador</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold text-green-600">
                +{resultado.mejoraPorcentaje.toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">
                mejora en tasa de {metricaPrincipal} comparada con la otra variante
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
