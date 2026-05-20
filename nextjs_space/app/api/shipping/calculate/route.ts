export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { calculateShipping } from "@/lib/ecommerce/shipping/calculate-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { origin, destination, package: pkg, items } = body;

    if (!destination || !pkg) {
      return NextResponse.json(
        { error: "destination y package son requeridos" },
        { status: 400 }
      );
    }

    const options = await calculateShipping({
      origin: origin || { postalCode: '28001', country: 'España' },
      destination,
      package: pkg,
      items: items || [],
    });

    return NextResponse.json({ options });
  } catch (error) {
    console.error("Error calculando envío:", error);
    return NextResponse.json({ error: "Error al calcular el envío" }, { status: 500 });
  }
}
