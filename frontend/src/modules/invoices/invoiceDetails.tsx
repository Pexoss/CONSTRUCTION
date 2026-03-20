import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoiceService } from "./invoice.service";

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoiceService.getInvoiceById(id!),
    enabled: !!id,
  });

  const invoice = data?.data;

  const downloadPDFMutation = useMutation({
    mutationFn: (id: string) => invoiceService.generateInvoicePDF(id),
    onSuccess: (blob, id) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
  });

  if (isLoading) {
    return <div className="p-6">Carregando fatura...</div>;
  }

  if (isError || !invoice) {
    return <div className="p-6 text-red-500">Erro ao carregar fatura</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-start mb-8 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Fatura {invoice.invoiceNumber}
            </h1>

            <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
              {invoice.status}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Voltar
            </button>

            <button
              onClick={() => downloadPDFMutation.mutate(invoice._id)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition disabled:opacity-50"
              disabled={downloadPDFMutation.isPending}
            >
              {downloadPDFMutation.isPending ? "Gerando..." : "Baixar PDF"}
            </button>
          </div>
        </div>

        {/* INFO PRINCIPAL */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="font-semibold mb-3">Informações</h2>

            <p>
              <strong>Aluguel:</strong>{" "}
              {typeof invoice.rentalId === "string"
                ? invoice.rentalId
                : invoice.rentalId?._id}
            </p>

            <p>
              <strong>Cliente:</strong>{" "}
              {typeof invoice.customerId === "string"
                ? invoice.customerId
                : invoice.customerId?.name || invoice.customerId?._id}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="font-semibold mb-3">Datas</h2>

            <p>
              <strong>Emissão:</strong>{" "}
              {new Date(invoice.issueDate).toLocaleDateString()}
            </p>

            <p>
              <strong>Vencimento:</strong>{" "}
              {new Date(invoice.dueDate).toLocaleDateString()}
            </p>

            {invoice.paidDate && (
              <p>
                <strong>Pago em:</strong>{" "}
                {new Date(invoice.paidDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* ITENS */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold mb-4">Itens</h2>

          <div className="space-y-2">
            {invoice.items.map((item: any, index: number) => (
              <div
                key={index}
                className="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50 transition"
              >
                <span>{item.description || "Item"}</span>
                <span>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(item.total || item.price || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RESUMO */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="font-semibold mb-4">Resumo</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(invoice.subtotal)}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Taxa</span>
              <span>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(invoice.tax || 0)}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Desconto</span>
              <span>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(invoice.discount || 0)}
              </span>
            </div>

            <div className="flex justify-between font-bold text-lg mt-4 pt-3 border-t">
              <span>Total</span>
              <span>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(invoice.total)}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default InvoiceDetails;