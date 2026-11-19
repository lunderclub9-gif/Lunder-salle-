"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { authorize } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { userMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { createExpense } from "@/lib/services/expenses";
import { toCents } from "@/lib/money";

export async function listExpenseCategoriesAction(_prev: ActionState): Promise<ActionState & { categories?: Array<{ id: string; name: string }> }> {
  try {
    const user = await authorize(PERMISSIONS.EXPENSES_MANAGE);
    const rows = await db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).orderBy(expenseCategories.sortOrder, expenseCategories.name);
    return { ok: true, categories: rows };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function createExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERMISSIONS.EXPENSES_MANAGE);
    const categoryId = String(formData.get("categoryId") ?? "");
    const amountCents = toCents(String(formData.get("amount") ?? "0") || "0");
    const paidWithCash = formData.get("paidWithCash") === "on";
    const shiftId = paidWithCash ? String(formData.get("shiftId") ?? "") : "";
    const expenseDate = new Date(String(formData.get("expenseDate") ?? Date.now()));
    const notes = String(formData.get("notes") ?? "").trim();

    await createExpense(user, {
      categoryId,
      amountCents,
      paidWithCash,
      expenseDate,
      notes,
      shiftId: paidWithCash ? shiftId : undefined,
    });

    revalidatePath("/depenses");
    revalidatePath("/caisse-journal");
    revalidatePath("/tableau-de-bord");
    return { ok: true, message: "Dépense enregistrée." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
