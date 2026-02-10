import { autumnHandler } from "autumn-js/next"
import { auth, currentUser } from "@clerk/nextjs/server"

export const { GET, POST } = autumnHandler({
    identify: async () => {
        const { orgId } = await auth()
        const user = await currentUser()

        if (!orgId || !user) {
            return null
        }

        // Use orgId as the customer ID since billing is per-organization
        return {
            customerId: orgId,
            customerData: {
                name: user.fullName ?? user.firstName ?? undefined,
                email: user.emailAddresses[0]?.emailAddress,
            },
        }
    },
})
