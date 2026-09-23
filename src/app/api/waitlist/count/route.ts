import { NextResponse } from "next/server";
import { getWaitlistCount } from "@/server/waitlist/actions";

export async function GET() {
  const count = await getWaitlistCount();
  return NextResponse.json({ count });
}
