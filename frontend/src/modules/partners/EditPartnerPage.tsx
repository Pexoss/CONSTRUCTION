import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { partnerService } from "./partner.service";
import { CreatePartnerData } from "../../types/partner.types";
import { toast } from "react-toastify";

const EditPartnerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<CreatePartnerData>({
    name: "",
    phone: "",
    email: "",
    document: "",
    notes: "",
    isActive: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["partner", id],
    queryFn: () => partnerService.getPartnerById(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.data) {
      const p = data.data;
      setForm({
        name: p.name,
        phone: p.phone || "",
        email: p.email || "",
        document: p.document || "",
        notes: p.notes || "",
        isActive: p.isActive !== false,
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Partial<CreatePartnerData>) =>
      partnerService.updatePartner(id!, payload),
    onSuccess: () => {
      toast.success("Parceiro atualizado");
      navigate(`/partners/${id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Erro ao atualizar");
    },
  });

  if (isLoading) {
    return (
      <Layout title="Editar parceiro" backTo="/partners">
        <p className="p-8 text-sm text-gray-500">Carregando...</p>
      </Layout>
    );
  }

  return (
    <Layout title="Editar parceiro" backTo={`/partners/${id}`}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Link
            to={`/partners/${id}`}
            className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
          >
            ← Voltar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Editar parceiro
          </h1>
          <form
            className="space-y-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                ...form,
                email: form.email?.trim() || "",
                phone: form.phone?.trim() || "",
                document: form.document?.trim() || "",
                notes: form.notes?.trim() || "",
              });
            }}
          >
            <div>
              <label className="block text-sm font-medium mb-1">Nome *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <input
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CPF/CNPJ</label>
              <input
                value={form.document || ""}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Observações</label>
              <textarea
                rows={3}
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive !== false}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
              Parceiro ativo
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate(`/partners/${id}`)}
                className="px-4 py-2 border rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default EditPartnerPage;
