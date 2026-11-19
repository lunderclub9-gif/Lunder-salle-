import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories, expenses, cashMovements, shifts, users } from "@/db/schema";
import { AppError } from "../errors";
import { logAudit, AUDIT_ACTIONS } from "../audit";
import type { SessionUser } from "../auth";
import { requireOpenShift } from "./shifts";
import { formatCents } from "../money";

export async function createExpense(
  user: SessionUser,
  input: {
    categoryId: string;
    amountCents: number;
    paidWithCash: boolean;
    expenseDate: Date | string;
    notes: string;
    shiftId?: string;
  },
) {
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new AppError("Le montant doit être positif.");

  return db.transaction(async (tx) => {
    const [category] = await tx
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, input.categoryId))
      .for("update");
    if (!category) throw new AppError("Catégorie de dépense introuvable.");

    let shiftId: string | null = null;
    let hasCash = input.paidWithCash;

    if (hasCash) {
      const targetShiftId = input.shiftId ?? null;
      const resolvedShift = targetShiftId
        ? (await tx
            .select()
            .from(shifts)
            .where(and(eq(shifts.id, targetShiftId), eq(shifts.status, "open")))
            .for("update"))[0]
        : null;

      if (!resolvedShift) {
        throw new AppError("La dépense payée en espèces doit être rattachée à une caisse ouverte.");
      }
      shiftId = resolvedShift.id;

      await tx.insert(cashMovements).values({
        shiftId: resolvedShift.id,
        type: "expense",
        amountCents: amount,
        reason: category.name,
        createdBy: user.id,
      });
    }

    const [expense] = await tx
      .insert(expenses)
      .values({
        categoryId: input.categoryId,
        shiftId: shiftId ?? null,
        amountCents: amount,
        paidWithCash: hasCash,
        expenseDate: new Date(input.expenseDate),
        employeeId: user.id,
        notes: input.notes.trim().slice(0, 500),
      })
      .returning();

    await logAudit(
      {
        actorId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.EXPENSE_CREATED,
        entityType: "expense",
        entityId: expense!.id,
        after: {
          category: category.name,
          amountCents: amount,
          paidWithCash: hasCash,
          shiftId: shiftId,
        },
      },
      tx,
    );

    return { id: expense!.id, paidWithCash: hasCash };
  });
}

export async function listExpensesByShift(shiftId: string) {
  return db
    .select({
      expense: expenses,
      category: expenseCategories.name,
      userName: users.fullName,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(users, eq(users.id, expenses.employeeId))
    .where(eq(expenses.shiftId, shiftId))
    .orderBy(expenses.expenseDate);
}

export async function listOpenShiftExpenses(shiftId: string) {
  return db
    .select({
      amount: cashMovements.amountCents,
    })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.shiftId, shiftId),
        eq(cashMovements.type, "expense"),
      ),
    );
}
