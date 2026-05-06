export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"

const VOLKERN_API_URL = process.env.VOLKERN_API_URL || "https://volkern.app/api"
const VOLKERN_API_KEY = process.env.VOLKERN_API_KEY

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")

  if (!path) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 })
  }

  if (!VOLKERN_API_KEY) {
    return NextResponse.json({ error: "VOLKERN_API_KEY not configured" }, { status: 500 })
  }

  // Remove leading slash if present
  const cleanPath = path.startsWith("/") ? path.slice(1) : path
  
  // Construct the full URL with excluding the 'path' parameter from the forwarded query
  const forwardParams = new URLSearchParams(searchParams)
  forwardParams.delete("path")
  const query = forwardParams.toString()
  const fullUrl = `${VOLKERN_API_URL}/${cleanPath}${query ? `?${query}` : ""}`

  try {
    const res = await fetch(fullUrl, {
      headers: {
        "Authorization": `Bearer ${VOLKERN_API_KEY}`,
        "Content-Type": "application/json",
      },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error("Volkern API Proxy Error:", error)
    return NextResponse.json({ error: "Failed to fetch from Volkern API" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")

  if (!path) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 })
  }

  if (!VOLKERN_API_KEY) {
    return NextResponse.json({ error: "VOLKERN_API_KEY not configured" }, { status: 500 })
  }

  const cleanPath = path.startsWith("/") ? path.slice(1) : path
  const fullUrl = `${VOLKERN_API_URL}/${cleanPath}`

  try {
    const body = await req.json()
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOLKERN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error("Volkern API Proxy Error (POST):", error)
    return NextResponse.json({ error: "Failed to post to Volkern API" }, { status: 500 })
  }
}
