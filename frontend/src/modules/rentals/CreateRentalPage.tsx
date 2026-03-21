import React, { useState, useMemo, useEffect } from "react";
import { data, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { rentalService } from "./rental.service";
import { customerService } from "../customers/customer.service";
import { useItems } from "../../hooks/useInventory";
import {
  CreateRentalData,
  RentalService,
  RentalTypeAPI,
  RentalTypeUI,
  RentalWorkAddress,
} from "../../types/rental.types";
import { Item } from "../../types/inventory.types";
import Layout from "../../components/Layout";
import axios from "axios";
import { filterReferenceElements } from "recharts/types/state/selectors/axisSelectors";

export const rentalTypeMapper: Record<RentalTypeUI, RentalTypeAPI> = {
  diario: "daily",
  semanal: "weekly",
  mensal: "monthly",
};
interface SelectedItem {
  itemId: string;
  quantity: number;
  unitId?: string;
  rentalType?: RentalTypeUI;
  pickupDate?: string; // string ou Date
  returnDate?: string; // string ou Date
  item: Item;
}
interface Totals {
  equipmentSubtotal: number;
  servicesSubtotal: number;
  subtotal: number;
  deposit: number;
  total: number;
  rentalPeriod: { start: string; end: string };
}

const rentalTypeMap: Record<RentalTypeUI, "daily" | "weekly" | "monthly"> = {
  diario: "daily",
  semanal: "weekly",
  mensal: "monthly",
};

const CreateRentalPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [services, setServices] = useState<RentalService[]>([]);
  const [workAddress, setWorkAddress] = useState<RentalWorkAddress | null>(
    null,
  );
  const [saveWorkAddress, setSaveWorkAddress] = useState(false);
  const [selectedWorkAddressId, setSelectedWorkAddressId] =
    useState<string>("");
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [rentalType, setRentalType] = useState<"diario" | "semanal" | "mensal">(
    "diario",
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const [sort, setSort] = useState<
    "name" | "name_desc" | "price" | "price_desc" | "available"
  >("name");

  const billingTypeLabel: Record<"diario" | "semanal" | "mensal", string> = {
    diario: "Diário",
    semanal: "Semanal",
    mensal: "Mensal",
  };

  const { data: customersData } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customerService.getCustomers({ limit: 100 }),
  });

  const { data: itemsData } = useItems({ isActive: true, limit: 100 });
  const createMutation = useMutation({
    mutationFn: (data: CreateRentalData) => rentalService.createRental(data),
    onSuccess: async (response) => {
      if (response?.data?._id) {
        try {
          const blob = await rentalService.generateRentalPDF(response.data._id);
          const url = window.URL.createObjectURL(
            new Blob([blob], { type: "application/pdf" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `locacao-${response.data._id}.pdf`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        } catch {
          // Mantém o fluxo mesmo se o PDF falhar
        }
      }
      navigate("/rentals", {
        state: {
          newRentalId: response.data._id,
          showSuccessModal: true,
        },
      });
    },
  });

  function parseLocalDate(dateString: string) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const calculatePrice = (
    item: Item,
    quantity: number,
    startDate: Date,
    endDate: Date | null,
    rentalType: RentalTypeAPI,
  ) => {
    const pricing = item.pricing ?? {};

    // 1. Remova aquele switch que dava setDate(+1, +7, +30)
    // O Backend usa a data real selecionada, sem somar "prazos" na mão.
    let effectiveEndDate = endDate ? new Date(endDate) : new Date(startDate);

    // 2. Cálculo de dias exato igual ao Backend (Math.ceil da diferença)
    const diffTime = effectiveEndDate.getTime() - startDate.getTime();

    // Se a data for igual ou menor, o Backend garante 1 dia (Math.max(1, ...))
    const days =
      diffTime <= 0 ? 1 : Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let totalPrice = 0;
    const daily = pricing.dailyRate ?? 0;

    // 3. Replique a lógica exata do switch do seu Backend
    switch (rentalType) {
      case "daily":
        totalPrice = daily * days;
        break;
      case "weekly": {
        const weekly = pricing.weeklyRate || daily;
        const fullWeeks = Math.floor(days / 7);
        const extraDays = days % 7;
        totalPrice = fullWeeks * weekly + extraDays * daily;
        break;
      }
      case "monthly": {
        const monthly = pricing.monthlyRate || daily;
        const fullMonths = Math.floor(days / 30);
        const extraDays = days % 30;
        totalPrice = fullMonths * monthly + extraDays * daily;
        break;
      }
    }

    return totalPrice * quantity;
  };

  const calculateTotals = (): Totals => {
    if (selectedItems.length === 0) {
      return {
        equipmentSubtotal: 0,
        servicesSubtotal: 0,
        subtotal: 0,
        deposit: 0,
        total: 0,
        rentalPeriod: { start: "", end: "" },
      };
    }

    let equipmentSubtotal = 0;
    let servicesSubtotal = 0;
    let deposit = 0;

    let minPickup: Date | null = null;
    let maxReturn: Date | null = null;

    selectedItems.forEach((item) => {
      //usar parseLocalDate (corrige timezone)
      const itemPickup: Date | null = item.pickupDate
        ? parseLocalDate(item.pickupDate)
        : null;

      const itemReturn: Date | null = item.returnDate
        ? parseLocalDate(item.returnDate)
        : null;

      if (itemPickup && (!minPickup || itemPickup < minPickup))
        minPickup = itemPickup;

      if (itemReturn && (!maxReturn || itemReturn > maxReturn))
        maxReturn = itemReturn;

      if (itemPickup) {
        const rentalTypeAPI = item.rentalType
          ? rentalTypeMapper[item.rentalType]
          : "daily";

        const price = calculatePrice(
          item.item,
          item.quantity,
          itemPickup,
          itemReturn,
          rentalTypeAPI,
        );

        equipmentSubtotal += price;
      }

      deposit += (item.item.pricing?.depositAmount ?? 0) * item.quantity;
    });

    services.forEach((service) => {
      servicesSubtotal += service.subtotal;
    });

    const subtotal = equipmentSubtotal + servicesSubtotal;
    const total = subtotal - discount;

    //evitar toISOString (bug de fuso)
    const formatDate = (date: Date | null) => {
      if (!date) return "";
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const rentalPeriod = {
      start: formatDate(minPickup),
      end: formatDate(maxReturn),
    };

    return {
      equipmentSubtotal,
      servicesSubtotal,
      subtotal,
      deposit,
      total,
      rentalPeriod,
    };
  };
  const getRentalTypeFromItem = (item: Item): RentalTypeUI => {
    if (item.pricing.monthlyRate) return "mensal";
    if (item.pricing.weeklyRate) return "semanal";
    return "diario";
  };

  function getBillingType(
    pickupDate?: string,
    returnDate?: string,
  ): "diario" | "semanal" | "mensal" {
    if (!pickupDate || !returnDate) return "diario";

    const start = new Date(pickupDate);
    const end = new Date(returnDate);
    const diffInDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffInDays >= 30) return "mensal";
    if (diffInDays >= 7) return "semanal";
    return "diario";
  }
  const handleAddItem = (item: Item) => {
    if (item.trackingType === "unit") {
      const availableUnits =
        item.units?.filter((u) => u.status === "available") || [];
      if (availableUnits.length === 0) {
        alert(
          `O item "${item.name}" não possui unidades disponíveis para aluguel.`,
        );
        return;
      }
    }

    //definir tipo automaticamente pelo item
    const getRentalTypeFromItem = (item: Item): RentalTypeUI => {
      if (item.pricing.monthlyRate) return "mensal";
      if (item.pricing.weeklyRate) return "semanal";
      return "diario";
    };

    const rentalType = getRentalTypeFromItem(item);

    const existingIndex = selectedItems.findIndex(
      (si) => si.itemId === item._id,
    );

    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      if (item.trackingType !== "unit") {
        updated[existingIndex].quantity += 1;
      }
      setSelectedItems(updated);
    } else {
      //já calcula a devolução mínima
      const calculatedReturn =
        pickupDate && !returnDate
          ? calculateReturnDate(pickupDate, rentalType)
          : returnDate || "";

      setSelectedItems([
        ...selectedItems,
        {
          itemId: item._id,
          quantity: 1,
          item,
          pickupDate: pickupDate || "",
          returnDate: calculatedReturn,
          rentalType,
        },
      ]);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((si) => si.itemId !== itemId));
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setSelectedItems(
      selectedItems.map((si) =>
        si.itemId === itemId ? { ...si, quantity } : si,
      ),
    );
  };

  const addService = () => {
    setServices([
      ...services,
      {
        description: "",
        price: 0,
        quantity: 1,
        subtotal: 0,
        category: "",
      },
    ]);
  };

  const updateService = (
    index: number,
    field: keyof RentalService,
    value: any,
  ) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };

    // Recalcular subtotal
    if (field === "price" || field === "quantity") {
      newServices[index].subtotal =
        newServices[index].price * newServices[index].quantity;
    }

    setServices(newServices);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const missingFields: string[] = [];
    if (!selectedCustomer) missingFields.push("cliente");
    if (selectedItems.length === 0) {
      if ((itemsData?.data || []).length === 0) {
        alert("Nenhum item disponível no inventário para alugar.");
        return;
      }
      missingFields.push("itens do aluguel");
    }

    if (missingFields.length > 0) {
      alert(`Preencha os campos obrigatórios: ${missingFields.join(", ")}.`);
      return;
    }

    if (selectedItems.length === 0) {
      alert("Adicione pelo menos um item.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const hasRetroactive = selectedItems.some(
      (si) =>
        (si.pickupDate && si.pickupDate < today) ||
        (si.returnDate && si.returnDate < today),
    );
    if (
      hasRetroactive ||
      (pickupDate && pickupDate < today) ||
      (returnDate && returnDate < today)
    ) {
      const shouldContinue = window.confirm(
        "Você informou uma data anterior a hoje. Tem certeza de que deseja continuar?",
      );
      if (!shouldContinue) return;
    }

    //format dates
    const formatDateToISO = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toISOString();
    };

    for (const si of selectedItems) {
      if (si.item.trackingType === "unit" && !si.unitId) {
        alert(`O item "${si.item.name}" precisa de um unitId válido.`);
        return;
      }
      if (!si.pickupDate) {
        alert(`Informe a retirada do item "${si.item.name}".`);
        return;
      }
      if (si.returnDate && si.pickupDate && si.returnDate < si.pickupDate) {
        alert(
          `A devolução do item "${si.item.name}" deve ser posterior à retirada.`,
        );
        return;
      }
    }

    const servicesToSend = services.map((s) => ({
      description: s.description.trim(),
      price: Number(s.price) || 0,
      quantity: Number(s.quantity) || 1,
      subtotal: (Number(s.price) || 0) * (Number(s.quantity) || 1),
      category: s.category?.trim() || "",
    }));

    const data: CreateRentalData = {
      customerId: selectedCustomer,
      items: selectedItems.map((si) => {
        const uiType = si.rentalType ?? rentalType; // fallback da tela

        return {
          itemId: si.itemId,
          unitId: si.item.trackingType === "unit" ? si.unitId : undefined,
          quantity: si.quantity,
          rentalType: rentalTypeMapper[uiType],
          pickupScheduled: formatDateToISO(si.pickupDate as string),
          returnScheduled: si.returnDate
            ? formatDateToISO(si.returnDate)
            : undefined,
        };
      }),

      services: servicesToSend.length > 0 ? servicesToSend : undefined,
      workAddress: workAddress || undefined,
      dates:
        pickupDate || returnDate
          ? {
              pickupScheduled: pickupDate
                ? formatDateToISO(pickupDate)
                : undefined,
              returnScheduled: returnDate
                ? formatDateToISO(returnDate)
                : undefined,
            }
          : undefined,
      pricing: {
        discount,
      },
      notes,
    };

    createMutation.mutate(data, {
      onSuccess: async (res) => {
        setServerError(null);

        if (
          saveWorkAddress &&
          selectedCustomer &&
          workAddress &&
          !workAddress.workId
        ) {
          const missing = [];
          if (!workAddress.workName?.trim()) missing.push("nome da obra");
          if (!workAddress.street?.trim()) missing.push("rua");
          if (!workAddress.city?.trim()) missing.push("cidade");
          if (!workAddress.state?.trim()) missing.push("estado");
          if (!workAddress.zipCode?.trim()) missing.push("CEP");
          if (missing.length > 0) {
            alert(`Preencha o endereço da obra: ${missing.join(", ")}.`);
            return;
          }
          try {
            await customerService.addAddress(selectedCustomer, {
              addressName: workAddress.workName || "Obra",
              type: "work",
              workName: workAddress.workName,
              street: workAddress.street,
              number: workAddress.number,
              complement: workAddress.complement,
              neighborhood: workAddress.neighborhood,
              city: workAddress.city,
              state: workAddress.state,
              zipCode: workAddress.zipCode,
              country: "Brasil",
              isDefault: false,
            });
          } catch {
            alert("Não foi possível salvar o endereço do cliente.");
          }
        }
      },
      onError: (err: any) => {
        const message =
          err.response?.data?.message || "Erro ao processar a requisição";
        setServerError(message);
      },
    });
  };

  const totals = calculateTotals();
  const items = itemsData?.data || [];
  const customers = customersData?.data || [];
  const selectedCustomerData =
    customers.find((c) => c._id === selectedCustomer) ?? null;

  const customerAddresses = selectedCustomerData?.addresses ?? [];

  const calculateMultiplier = () => {
    switch (rentalType) {
      case "diario":
        return 1;
      case "semanal":
        return 7; // 1 semana = 7 dias
      case "mensal":
        return 30;
      default:
        return 1;
    }
  };

  const totalsWithRentalType = {
    ...totals,
    // apenas copia, sem multiplicar
    subtotal: totals.subtotal,
    total: totals.total,
    equipmentSubtotal: totals.equipmentSubtotal,
    servicesSubtotal: totals.servicesSubtotal,
  };

  const calculateReturnDate = (pickup: string, type: typeof rentalType) => {
    if (!pickup) return "";

    //corrigido (sem bug de fuso)
    const [year, month, day] = pickup.split("-").map(Number);
    const pickupDateObj = new Date(year, month - 1, day);

    let daysToAdd = 1;

    switch (type) {
      case "diario":
        daysToAdd = 1;
        break;
      case "semanal":
        daysToAdd = 7;
        break;
      case "mensal":
        daysToAdd = 30;
        break;
    }

    const returnDateObj = new Date(pickupDateObj);
    returnDateObj.setDate(returnDateObj.getDate() + daysToAdd);

    //evitar toISOString (timezone bug)
    const y = returnDateObj.getFullYear();
    const m = String(returnDateObj.getMonth() + 1).padStart(2, "0");
    const d = String(returnDateObj.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (pickupDate) {
      const newReturnDate = calculateReturnDate(pickupDate, rentalType);
      setReturnDate(newReturnDate);
    }
  }, [pickupDate, rentalType]);

  useEffect(() => {
    if (customerAddresses.length === 1) {
      const addr = customerAddresses[0];
      setWorkAddress({
        workName: addr.workName || "",
        street: addr.street,
        number: addr.number,
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zipCode,
      });
      setSelectedWorkAddressId(addr._id || "");
    }
  }, [customerAddresses]);

  const addressOptions =
    selectedCustomerData?.addresses?.map((address, index) => ({
      label:
        address.type === "work"
          ? address.workName || `Obra ${index + 1}`
          : address.type === "main"
            ? "Principal"
            : `Outro ${index + 1}`,
      value: index,
    })) ?? [];

  const filteredItems = items.filter((item) => {
    if (item.quantity.available <= 0) return false;

    if (search) {
      const term = search.toLowerCase();

      const matches =
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term) ||
        item.barcode?.toLowerCase().includes(term) ||
        item.customId?.toLowerCase().includes(term);

      if (!matches) return false;
    }

    return true;
  });

  const handleClearFilters = () => {
    setSearch("");
  };

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    switch (sort) {
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));

      case "name_desc":
        return list.sort((a, b) => b.name.localeCompare(a.name));

      case "price":
        return list.sort(
          (a, b) => (a.pricing?.dailyRate ?? 0) - (b.pricing?.dailyRate ?? 0),
        );

      case "price_desc":
        return list.sort(
          (a, b) => (b.pricing?.dailyRate ?? 0) - (a.pricing?.dailyRate ?? 0),
        );

      case "available":
        return list.sort(
          (a, b) => (b.quantity.available ?? 0) - (a.quantity.available ?? 0),
        );

      default:
        return list;
    }
  }, [filteredItems, sort]);

  return (
    <Layout title="Novo Aluguel" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/rentals"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              ← Voltar para Aluguéis
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Items Selection */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer Selection */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Cliente *
                  </h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Obrigatório
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm appearance-none"
                  >
                    <option value="">Selecione um cliente</option>
                    {customers.map((customer) => (
                      <option key={customer._id} value={customer._id}>
                        {customer.name} - {customer.cpfCnpj}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                    <svg
                      className="h-5 w-5 text-gray-400 dark:text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
                {selectedCustomer && selectedCustomerData && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Cliente selecionado:</span>{" "}
                      {selectedCustomerData.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Items Selection */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Itens Disponíveis
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Busque e filtre os itens para alugar
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {
                        items.filter((item) => item.quantity.available > 0)
                          .length
                      }{" "}
                      itens disponíveis
                    </span>
                  </div>
                </div>

                {/* Barra de busca e filtros */}
                <div className="mb-6 space-y-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400 dark:text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar por nome, descrição ou código..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      aria-label="Limpar filtros"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0l1 12a1 1 0 001 1h4a1 1 0 001-1l1-12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {filteredItems.filter((item) => item.quantity.available > 0)
                  .length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                    <svg
                      className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                      />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                      Nenhum item encontrado
                    </h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                      {items.length === 0
                        ? "Não há itens cadastrados no sistema."
                        : "Tente ajustar os filtros ou termos da busca."}
                    </p>
                    {items.length > 0 && (
                      <button
                        onClick={handleClearFilters}
                        className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Contador de resultados filtrados */}
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {filteredItems.length} itens disponíveis
                      </span>

                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700 dark:text-gray-300">
                          Ordenar por:
                        </label>
                        <select
                          value={sort}
                          onChange={(e) => setSort(e.target.value as any)}
                          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="name">Nome A-Z</option>
                          <option value="name_desc">Nome Z-A</option>
                          <option value="price">Preço menor</option>
                          <option value="price_desc">Preço maior</option>
                          <option value="available">Disponibilidade</option>
                        </select>
                      </div>
                    </div>

                    {/* Lista de itens */}
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {sortedItems.map((item) => (
                        <div
                          key={item._id}
                          className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors group bg-white dark:bg-gray-800"
                        >
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-gray-900 dark:text-white">
                                    {item.name}
                                  </h3>
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    R$ {item.pricing.dailyRate}/dia
                                  </span>
                                  <span className="mx-2">•</span>
                                  <span className="inline-flex items-center">
                                    <svg
                                      className="w-4 h-4 mr-1 text-green-600 dark:text-green-400"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                    Disponível: {item.quantity.available}
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddItem(item)}
                            className="ml-4 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white px-4 py-2.5 rounded-md text-sm font-medium shadow-sm hover:shadow transition-colors whitespace-nowrap flex items-center gap-2"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Selected Items */}
                {selectedItems.length > 0 && (
                  <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Itens Selecionados
                      </h2>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {selectedItems.length} item
                        {selectedItems.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {selectedItems.map((selectedItem) => (
                        <div
                          key={selectedItem.itemId}
                          className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="font-medium text-gray-900 dark:text-white">
                                  {selectedItem.item.name}
                                </h3>

                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                  {selectedItem.pickupDate
                                    ? `R$ ${calculatePrice(
                                        selectedItem.item,
                                        selectedItem.quantity,
                                        new Date(selectedItem.pickupDate),
                                        selectedItem.returnDate
                                          ? new Date(selectedItem.returnDate)
                                          : null,
                                        selectedItem.rentalType
                                          ? rentalTypeMap[
                                              selectedItem.rentalType
                                            ]
                                          : "daily", // fallback caso undefined
                                      ).toFixed(2)}/un`
                                    : "Defina a retirada"}
                                </span>
                              </div>

                              {/* Unidade */}
                              {selectedItem.item.trackingType === "unit" && (
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-gray-500">
                                    Unidade *
                                  </label>
                                  <select
                                    value={selectedItem.unitId || ""}
                                    onChange={(e) => {
                                      const updated = selectedItems.map((si) =>
                                        si.itemId === selectedItem.itemId
                                          ? { ...si, unitId: e.target.value }
                                          : si,
                                      );
                                      setSelectedItems(updated);
                                    }}
                                    required
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  >
                                    <option value="">Selecione...</option>
                                    {selectedItem.item.units
                                      ?.filter((u) => u.status === "available")
                                      .map((unit) => (
                                        <option
                                          key={unit.unitId}
                                          value={unit.unitId}
                                        >
                                          Unidade: {unit.unitId}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              )}

                              {/* BLOCO PRINCIPAL (tipo + datas) */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Tipo de cobrança
                                  </label>

                                  <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-200">
                                    {
                                      billingTypeLabel[
                                        getBillingType(
                                          selectedItem.pickupDate,
                                          selectedItem.returnDate,
                                        )
                                      ]
                                    }
                                  </div>
                                </div>
                                {/* Retirada */}
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Retirada
                                  </label>
                                  <input
                                    type="date"
                                    value={selectedItem.pickupDate || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;

                                      const updated = selectedItems.map(
                                        (si) => {
                                          if (si.itemId !== selectedItem.itemId)
                                            return si;

                                          const newReturn = value
                                            ? calculateReturnDate(
                                                value,
                                                si.rentalType ?? "diario",
                                              )
                                            : si.returnDate;

                                          return {
                                            ...si,
                                            pickupDate: value,
                                            returnDate: newReturn,
                                          };
                                        },
                                      );

                                      setSelectedItems(updated);
                                    }}
                                    onKeyDown={(e) => e.preventDefault()}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>

                                {/* Devolução */}
                                {/* Devolução */}
                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-500 mb-1">
                                    Devolução
                                  </label>
                                  <input
                                    type="date"
                                    value={selectedItem.returnDate || ""}
                                    onChange={(e) => {
                                      const updated = selectedItems.map((si) =>
                                        si.itemId === selectedItem.itemId
                                          ? {
                                              ...si,
                                              returnDate: e.target.value,
                                            }
                                          : si,
                                      );
                                      setSelectedItems(updated);
                                    }}
                                    onKeyDown={(e) => e.preventDefault()}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>
                              </div>

                              <div className="text-xs text-gray-500">
                                Os itens podem ter períodos diferentes. O
                                aluguel encerra somente após a devolução do
                                último item.
                              </div>
                            </div>

                            {/* Quantidade e botão remover */}
                            <div className="flex flex-col items-end gap-2 ml-4">
                              <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-700 dark:text-gray-300">
                                  Qtd:
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max={selectedItem.item.quantity.available}
                                  value={selectedItem.quantity}
                                  onChange={(e) =>
                                    handleQuantityChange(
                                      selectedItem.itemId,
                                      parseInt(e.target.value) || 1,
                                    )
                                  }
                                  className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                              </div>
                              <button
                                onClick={() =>
                                  handleRemoveItem(selectedItem.itemId)
                                }
                                className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-sm font-medium flex items-center gap-1 transition-colors"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Serviços Adicionais */}
                <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Serviços Adicionais
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Ex: Frete, Limpeza, Instalação, etc.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addService}
                      className="bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white px-4 py-2.5 rounded-md text-sm font-medium shadow-sm hover:shadow transition-colors flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Adicionar Serviço
                    </button>
                  </div>

                  {services.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Nenhum serviço adicionado
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {services.map((service, index) => (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors bg-white dark:bg-gray-800"
                        >
                          {/* Primeira linha - 3 campos */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                            <div className="md:col-span-5">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Descrição *
                              </label>
                              <input
                                type="text"
                                value={service.description}
                                onChange={(e) =>
                                  updateService(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Ex: Frete Alfenas-Fama"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              />
                            </div>

                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Categoria
                              </label>
                              <input
                                type="text"
                                value={service.category}
                                onChange={(e) =>
                                  updateService(
                                    index,
                                    "category",
                                    e.target.value,
                                  )
                                }
                                placeholder="Ex: frete, limpeza"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              />
                            </div>

                            <div className="md:col-span-4">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Subtotal
                              </label>
                              <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 rounded-md text-sm font-medium text-gray-900 dark:text-white">
                                R$ {service.subtotal.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Segunda linha - 3 campos */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Preço Unitário (R$) *
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                                    R$
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={service.price}
                                  onChange={(e) =>
                                    updateService(
                                      index,
                                      "price",
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                              </div>
                            </div>

                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Quantidade
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={service.quantity}
                                onChange={(e) =>
                                  updateService(
                                    index,
                                    "quantity",
                                    parseInt(e.target.value) || 1,
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                              />
                            </div>

                            <div className="md:col-span-4">
                              <div className="flex items-end justify-between gap-3">
                                <div className="flex-1">
                                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                    Cálculo:
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                                    R$ {service.price.toFixed(2)} ×{" "}
                                    {service.quantity} = R${" "}
                                    {service.subtotal.toFixed(2)}
                                  </div>
                                </div>

                                <div>
                                  <button
                                    type="button"
                                    onClick={() => removeService(index)}
                                    className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-300 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-700 rounded-md transition-colors flex items-center justify-center"
                                    title="Remover serviço"
                                  >
                                    <svg
                                      className="w-5 h-5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Endereço da Obra */}
                {selectedCustomerData && (
                  <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Endereço da Obra
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Opcional - para entrega no local
                        </p>
                      </div>
                      {customerAddresses.length > 0 && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">
                            Usar endereço salvo:
                          </label>
                          <select
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            defaultValue=""
                            onChange={(e) => {
                              const index = Number(e.target.value);
                              const addr = customerAddresses[index];
                              if (!addr) return;

                              setWorkAddress({
                                workName:
                                  addr.addressName ||
                                  (addr.type === "main"
                                    ? "Endereço Principal"
                                    : addr.type === "billing"
                                      ? "Endereço de Cobrança"
                                      : "Outro Endereço"),
                                street: addr.street,
                                number: addr.number,
                                complement: addr.complement,
                                neighborhood: addr.neighborhood,
                                city: addr.city,
                                state: addr.state,
                                zipCode: addr.zipCode,
                                workId: addr._id,
                              });
                            }}
                          >
                            <option value="">Selecione um endereço</option>
                            {customerAddresses.map((address, index) => (
                              <option key={index} value={index}>
                                {address.type === "work"
                                  ? address.workName || `Obra ${index + 1}`
                                  : address.type === "main"
                                    ? "Principal"
                                    : `Outro ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Nome da Obra
                          </label>
                          <input
                            type="text"
                            value={workAddress?.workName || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                workName: e.target.value,
                              } as RentalWorkAddress)
                            }
                            placeholder="Ex: Construção Residencial"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            CEP
                          </label>
                          <input
                            type="text"
                            value={workAddress?.zipCode || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                zipCode: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Rua
                          </label>
                          <input
                            type="text"
                            value={workAddress?.street || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                street: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Número
                          </label>
                          <input
                            type="text"
                            value={workAddress?.number || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                number: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Bairro
                          </label>
                          <input
                            type="text"
                            value={workAddress?.neighborhood || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                neighborhood: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Cidade
                          </label>
                          <input
                            type="text"
                            value={workAddress?.city || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                city: e.target.value,
                              } as RentalWorkAddress)
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Estado
                          </label>
                          <input
                            type="text"
                            value={workAddress?.state || ""}
                            onChange={(e) =>
                              setWorkAddress({
                                ...(workAddress || ({} as RentalWorkAddress)),
                                state: e.target.value,
                              } as RentalWorkAddress)
                            }
                            maxLength={2}
                            placeholder="UF"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                  Resumo do Aluguel
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Inputs de desconto e observações */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Desconto (R$)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(e) =>
                          setDiscount(
                            e.target.value === "" ? 0 : Number(e.target.value),
                          )
                        }
                        className="w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Observações
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Instruções especiais, detalhes da obra, etc."
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                      />
                    </div>
                  </div>

                  {/* Resumo dos itens */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">
                        Equipamentos:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        R$ {totalsWithRentalType.equipmentSubtotal.toFixed(2)}
                      </span>
                    </div>

                    {totalsWithRentalType.servicesSubtotal > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">
                          Serviços:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          R$ {totalsWithRentalType.servicesSubtotal.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Subtotal:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        R$ {totalsWithRentalType.subtotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">
                        Caução:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        R$ {totalsWithRentalType.deposit.toFixed(2)}
                      </span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between items-center text-red-600 dark:text-red-400">
                        <span>Desconto:</span>
                        <span className="font-medium">
                          - R$ {discount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        Total:
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        R$ {totalsWithRentalType.total.toFixed(2)}
                      </span>
                    </div>

                    {/* Período total estimado */}
                    <div className="mt-2">
                      <small className="text-gray-500 dark:text-gray-400 text-xs">
                        ⚠️ Período estimado: {totals.rentalPeriod.start} a{" "}
                        {totals.rentalPeriod.end}. O valor final será calculado
                        no fechamento do aluguel com base na devolução real de
                        cada item.
                      </small>
                    </div>
                  </div>

                  {/* Botão de criação */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={
                        createMutation.isPending || selectedItems.length === 0
                      }
                      className={`w-full py-3.5 px-4 rounded-md text-sm font-medium shadow-sm transition-all ${
                        createMutation.isPending || selectedItems.length === 0
                          ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                          : "bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white hover:shadow"
                      }`}
                    >
                      {createMutation.isPending
                        ? "Criando aluguel..."
                        : selectedItems.length === 0
                          ? "Selecione pelo menos 1 item"
                          : `Criar Aluguel • R$ ${totalsWithRentalType.total.toFixed(2)}`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CreateRentalPage;
