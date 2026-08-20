import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { partnerService } from "./partner.service";
import { CreatePartnerData, Partner } from "../../types/partner.types";
import {
  formatDocumentInputBr,
  formatPhoneInputBr,
} from "../../utils/formatters";

type PartnersListResult = Awaited<
  ReturnType<typeof partnerService.getPartners>
>;

const PARTNER_LIST_QUERY_KEYS = [
  ["partners-active-rental"],
  ["partners-active-rental-detail"],
  ["partners"],
];

interface CreatePartnerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (partner: Partner) => void;
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  document: "",
};

const CreatePartnerModal: React.FC<CreatePartnerModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (data: CreatePartnerData) => partnerService.createPartner(data),
    onSuccess: (res) => {
      const partner = res.data;
      PARTNER_LIST_QUERY_KEYS.forEach((queryKey) => {
        queryClient.setQueryData(
          queryKey,
          (old: PartnersListResult | undefined) => {
            if (!old?.data) {
              return old
                ? { ...old, data: [partner] }
                : {
                    success: true,
                    data: [partner],
                    pagination: {
                      total: 1,
                      page: 1,
                      limit: 200,
                      totalPages: 1,
                    },
                  };
            }
            return {
              ...old,
              data: [
                partner,
                ...old.data.filter((p: Partner) => p._id !== partner._id),
              ],
            };
          },
        );
        queryClient.invalidateQueries({ queryKey });
      });
      onCreated(partner);
      onClose();
      toast.success("Parceiro cadastrado e selecionado.");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Erro ao cadastrar parceiro.";
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const name = form.name.trim();
    if (!name) {
      toast.warning("Informe o nome do parceiro.");
      return;
    }
    mutation.mutate({
      name,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      document: form.document.trim() || undefined,
      isActive: true,
    });
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Novo parceiro
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cadastre o parceiro sem sair do aluguel. Após salvar, ele será
            selecionado automaticamente.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Fornecedor ABC"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CPF/CNPJ
            </label>
            <input
              type="text"
              value={form.document}
              onChange={(e) =>
                setForm({
                  ...form,
                  document: formatDocumentInputBr(e.target.value),
                })
              }
              placeholder="000.000.000-00"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telefone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: formatPhoneInputBr(e.target.value),
                  })
                }
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {mutation.isPending ? "Salvando..." : "Cadastrar e usar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default CreatePartnerModal;
