import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "./db";

export async function getTenantContext() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, tenantId: true, role: true }
    });

    return user;
}
