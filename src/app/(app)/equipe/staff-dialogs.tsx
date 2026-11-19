"use client";

import { KeyRound, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { createUserAction, resetUserPasswordAction, updateUserAction } from "@/app/actions/admin";

const ROLE_OPTIONS = [
  { value: "manager", label: "Gérant" },
  { value: "cashier", label: "Caissier" },
  { value: "technician", label: "Technicien" },
  { value: "viewer", label: "Lecteur" },
];

export function CreateUserDialog() {
  return (
    <Modal
      triggerLabel="Nouvel employé"
      title="Créer un compte employé"
      description="Chaque employé dispose de son propre compte : les actions sont nominatives dans l'audit."
      icon={<Plus className="h-4 w-4" />}
    >
      <ActionForm action={createUserAction} submitLabel="Créer le compte">
        <Field label="Nom complet">
          <Input name="fullName" required placeholder="Prénom Nom" maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Identifiant">
            <Input name="username" required placeholder="prenom.nom" maxLength={30} />
          </Field>
          <Field label="Téléphone">
            <Input name="phone" inputMode="tel" maxLength={20} />
          </Field>
        </div>
        <Field label="Rôle">
          <Select name="role" defaultValue="cashier">
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mot de passe provisoire" hint="L'employé devra le changer à sa première connexion.">
          <Input name="password" type="password" required minLength={8} />
        </Field>
      </ActionForm>
    </Modal>
  );
}

export function EditUserDialog({
  user,
}: {
  user: { id: string; fullName: string; phone: string; role: string; isActive: boolean; isPrimaryOwner: boolean };
}) {
  if (user.isPrimaryOwner) {
    return <span className="text-[11px] text-muted">Compte protégé</span>;
  }

  return (
    <Modal
      triggerLabel=""
      title={`Modifier ${user.fullName}`}
      icon={<Pencil className="h-3.5 w-3.5" />}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="px-2"
    >
      <ActionForm action={updateUserAction} submitLabel="Enregistrer" hidden={{ userId: user.id }}>
        <Field label="Nom complet">
          <Input name="fullName" defaultValue={user.fullName} required maxLength={120} />
        </Field>
        <Field label="Téléphone">
          <Input name="phone" defaultValue={user.phone} maxLength={20} />
        </Field>
        <Field label="Rôle">
          <Select name="role" defaultValue={user.role}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={user.isActive}
            className="h-4 w-4 accent-[#8b5cf6]"
          />
          Compte actif
        </label>
        <p className="text-[11px] text-muted">
          Désactiver un compte ferme immédiatement ses sessions ouvertes.
        </p>
      </ActionForm>
    </Modal>
  );
}

export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  return (
    <Modal
      triggerLabel=""
      title={`Réinitialiser le mot de passe de ${name}`}
      icon={<KeyRound className="h-3.5 w-3.5" />}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="px-2"
    >
      <ActionForm action={resetUserPasswordAction} submitLabel="Réinitialiser" hidden={{ userId }}>
        <Field label="Nouveau mot de passe provisoire">
          <Input name="password" type="password" required minLength={8} />
        </Field>
        <p className="text-[11px] text-muted">
          Toutes les sessions actives de ce compte seront fermées immédiatement.
        </p>
      </ActionForm>
    </Modal>
  );
}
