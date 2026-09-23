import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "~/lib/firebase/admin";
import { errorResponse, HttpError, requireUser } from "~/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  loanId: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
});

/** POST { loanId, text } — borrower ↔ RM message on a facility. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, ["borrower", "rm"]);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new HttpError(
        400,
        'Body must be { "loanId": string, "text": string }',
      );
    }
    const { loanId, text } = parsed.data;

    const loan = (await adminDb.doc(`loans/${loanId}`).get()).data();
    if (!loan) throw new HttpError(404, `Loan ${loanId} not found`);
    const allowed =
      user.role === "borrower"
        ? loan.ownerUid === user.uid
        : loan.rmUid === user.uid;
    if (!allowed) throw new HttpError(403, "Not your facility");

    const profile = (await adminDb.doc(`users/${user.uid}`).get()).data();
    const ref = await adminDb.collection("messages").add({
      loanId,
      ownerUid: loan.ownerUid as string,
      rmUid: loan.rmUid as string,
      fromUid: user.uid,
      fromRole: user.role,
      fromName: (profile?.fullName as string | undefined) ?? user.email ?? "",
      text,
      createdAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true, id: ref.id });
  } catch (err) {
    return errorResponse(err);
  }
}
